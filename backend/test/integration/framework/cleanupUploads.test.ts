import { nestableTransactionWithTenantId } from '@/libs/prisma-connection.js';
import { setStorageForTesting } from '@/libs/storage.js';
import {
  buildStorageKeys,
  removeImageObjects,
  uploadExpiryThreshold,
} from '@/models/uploadedImages.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryStorage, type MemoryStorage } from '../../fakes.js';
import { createReport, createTenant, createUser } from '../../factories.js';

// 仮アップロードの 3 日タイムアウト削除(script/cleanup_uploads.ts)のリグレッション。
//
// スクリプト本体は process.exit を呼ぶので、テストからは同じ判定と同じ削除手順を
// 組み立てて検証する。**守りたいのは「何を消して何を残すか」の境界**で、
// そこは uploadExpiryThreshold(純粋関数)と where 条件に閉じている。

let storage: MemoryStorage;

beforeEach(() => {
  storage = createMemoryStorage();
  setStorageForTesting(storage);
});

afterEach(() => {
  setStorageForTesting(null);
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** 画像を 1 枚作る(S3 にも置く)。createdAt と reportId を指定できる */
const seedImage = async (
  tenantId: string,
  userId: string,
  { createdAt, reportId }: { createdAt: Date; reportId?: string }
): Promise<string> => {
  const image = await nestableTransactionWithTenantId(tenantId, async (tx) =>
    tx.uploadedImage.create({
      data: {
        tenantId,
        userId,
        reportId: reportId ?? null,
        storageKey: 'placeholder',
        thumbnailKey: 'placeholder',
        mimeType: 'image/webp',
        byteSize: 1,
        width: 1,
        height: 1,
        rawExif: {},
      },
    })
  );
  const keys = buildStorageKeys(image.id);
  // 実際のキーに直す(create 時点では id が確定していないため)
  await nestableTransactionWithTenantId(tenantId, async (tx) => {
    await tx.uploadedImage.updateMany({
      where: { tenantId, id: image.id },
      data: { ...keys, createdAt },
    });
  });
  storage.objects.set(keys.storageKey, {
    body: Buffer.from('body'),
    contentType: 'image/webp',
  });
  storage.objects.set(keys.thumbnailKey, {
    body: Buffer.from('thumb'),
    contentType: 'image/webp',
  });
  return image.id;
};

/** cleanup_uploads.ts と同じ手順(読む → S3 → DB) */
const runCleanup = async (): Promise<string[]> => {
  const threshold = uploadExpiryThreshold(new Date());
  const targets = await nestableTransactionWithTenantId('*', async (tx) =>
    tx.uploadedImage.findMany({
      where: { reportId: null, createdAt: { lt: threshold } },
      select: { id: true },
      orderBy: { id: 'asc' },
    })
  );
  const ids = targets.map((t) => t.id);
  if (ids.length === 0) {
    return [];
  }
  await removeImageObjects(ids);
  await nestableTransactionWithTenantId('*', async (tx) => {
    await tx.uploadedImage.deleteMany({ where: { id: { in: ids } } });
  });
  return ids;
};

const remainingIds = async (tenantId: string): Promise<string[]> =>
  await nestableTransactionWithTenantId(tenantId, async (tx) => {
    const rows = await tx.uploadedImage.findMany({
      where: { tenantId },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  });

describe('仮アップロードの 3 日タイムアウト削除', () => {
  it('3 日より古い未確定画像だけが消え、確定済みと新しいものは残る', async () => {
    const tenant = await createTenant();
    const user = await createUser(tenant.id);
    const report = await createReport(tenant.id, user.id);

    const now = Date.now();
    const oldPending = await seedImage(tenant.id, user.id, {
      createdAt: new Date(now - 4 * DAY_MS),
    });
    const newPending = await seedImage(tenant.id, user.id, {
      createdAt: new Date(now - 1 * DAY_MS),
    });
    const oldConfirmed = await seedImage(tenant.id, user.id, {
      createdAt: new Date(now - 10 * DAY_MS),
      reportId: report.id,
    });

    expect(storage.objects.size).toBe(6);

    const removed = await runCleanup();
    expect(removed).toEqual([oldPending]);

    const remaining = await remainingIds(tenant.id);
    expect(remaining.sort()).toEqual([newPending, oldConfirmed].sort());

    // 消えた 1 枚ぶん(本体 + サムネ)だけ S3 からも消えている
    expect(storage.objects.size).toBe(4);
    const removedKeys = buildStorageKeys(oldPending);
    expect(storage.objects.has(removedKeys.storageKey)).toBe(false);
    expect(storage.objects.has(removedKeys.thumbnailKey)).toBe(false);
  });

  it('ちょうど 3 日前の境界では、超えたものだけが対象になる', async () => {
    const tenant = await createTenant();
    const user = await createUser(tenant.id);

    const now = Date.now();
    const justInside = await seedImage(tenant.id, user.id, {
      // 3 日 + 1 分前 = 対象
      createdAt: new Date(now - 3 * DAY_MS - 60_000),
    });
    const justOutside = await seedImage(tenant.id, user.id, {
      // 3 日 - 1 分前 = 対象外
      createdAt: new Date(now - 3 * DAY_MS + 60_000),
    });

    expect(await runCleanup()).toEqual([justInside]);
    expect(await remainingIds(tenant.id)).toEqual([justOutside]);
  });

  it('テナントを跨いで回収する(バッチなので tenantId は横断)', async () => {
    const tenantA = await createTenant();
    const userA = await createUser(tenantA.id);
    const tenantB = await createTenant();
    const userB = await createUser(tenantB.id);

    const old = new Date(Date.now() - 5 * DAY_MS);
    const a = await seedImage(tenantA.id, userA.id, { createdAt: old });
    const b = await seedImage(tenantB.id, userB.id, { createdAt: old });

    expect((await runCleanup()).sort()).toEqual([a, b].sort());
    expect(await remainingIds(tenantA.id)).toEqual([]);
    expect(await remainingIds(tenantB.id)).toEqual([]);
    expect(storage.objects.size).toBe(0);
  });

  it('対象がなければ何も消さない', async () => {
    const tenant = await createTenant();
    const user = await createUser(tenant.id);
    await seedImage(tenant.id, user.id, { createdAt: new Date() });

    expect(await runCleanup()).toEqual([]);
    expect(storage.objects.size).toBe(2);
  });
});

describe('uploadExpiryThreshold', () => {
  it('現在時刻の 3 日前を返す', () => {
    const now = new Date('2026-08-05T12:00:00+09:00');
    expect(uploadExpiryThreshold(now).toISOString()).toBe(
      new Date('2026-08-02T12:00:00+09:00').toISOString()
    );
  });
});
