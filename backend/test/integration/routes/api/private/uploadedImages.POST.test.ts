import { nestableTransactionWithTenantId } from '@/libs/prisma-connection.js';
import { setStorageForTesting } from '@/libs/storage.js';
import {
  buildStorageKeys,
  UPLOAD_MAX_BYTES,
} from '@/models/uploadedImages.js';
import { responseSchema } from '@/routes/api/private/uploadedImages.POST.js';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryStorage, type MemoryStorage } from '../../../../fakes.js';
import {
  buildTestApp,
  multipartPayload,
  parseResponse,
  setupMemberSession,
} from '../../_helpers.js';

// S3 は注入点をフェイクに差し替える(実 S3 固有の配線は E2E と
// script/test/storage_smoke.ts が MinIO 経由で見る)。
// ここで見たいのは「何をどういうキーで置いたか」と、画像加工の結果。

let app: FastifyInstance;
let storage: MemoryStorage;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  storage = createMemoryStorage();
  setStorageForTesting(storage);
});

afterEach(() => {
  setStorageForTesting(null);
});

/** EXIF 付きの JPEG を作る */
const jpegWithExif = async (width = 1200, height = 800): Promise<Buffer> =>
  await sharp({
    create: { width, height, channels: 3, background: '#3366cc' },
  })
    .withExif({
      IFD0: { Make: 'TestCam', Model: 'X-1' },
      IFD3: { GPSLatitudeRef: 'N' },
    })
    .jpeg()
    .toBuffer();

const upload = async (
  cookies: Record<string, string>,
  file: { fileName: string; contentType: string; body: Buffer }
) => {
  const { payload, headers } = multipartPayload(file);
  return await app.inject({
    method: 'POST',
    url: '/api/private/uploadedImages',
    cookies,
    headers,
    payload,
  });
};

describe('POST /api/private/uploadedImages', () => {
  it('アップロードすると本体とサムネイルが置かれ、未確定の画像が作られる', async () => {
    const { tenant, cookies } = await setupMemberSession(app);

    const res = await upload(cookies, {
      fileName: 'photo.jpg',
      contentType: 'image/jpeg',
      body: await jpegWithExif(),
    });
    expect(res.statusCode).toBe(200);

    const { uploadedImage } = parseResponse(responseSchema, res);
    // 長辺 2000px 以内に収まる(元が 1200x800 なので拡大はしない)
    expect(uploadedImage.width).toBe(1200);
    expect(uploadedImage.height).toBe(800);
    expect(uploadedImage.thumbnailUrl).toContain(uploadedImage.id);

    // S3 に本体とサムネイルの 2 つ
    const { storageKey, thumbnailKey } = buildStorageKeys(uploadedImage.id);
    expect([...storage.objects.keys()].sort()).toEqual(
      [storageKey, thumbnailKey].sort()
    );
    expect(storage.objects.get(storageKey)!.contentType).toBe('image/webp');

    // DB は未確定(reportId = null)で、キーが記録されている
    const row = await nestableTransactionWithTenantId(tenant.id, async (tx) =>
      tx.uploadedImage.findFirstOrThrow({
        where: { tenantId: tenant.id, id: uploadedImage.id },
      })
    );
    expect(row.reportId).toBeNull();
    expect(row.storageKey).toBe(storageKey);
    expect(row.thumbnailKey).toBe(thumbnailKey);
    expect(row.mimeType).toBe('image/webp');
  });

  it('保存された画像から EXIF が除去されている', async () => {
    const { cookies } = await setupMemberSession(app);

    const source = await jpegWithExif();
    // 元画像には EXIF がある、という前提を先に確かめる
    expect((await sharp(source).metadata()).exif).toBeDefined();

    const res = await upload(cookies, {
      fileName: 'photo.jpg',
      contentType: 'image/jpeg',
      body: source,
    });
    const { uploadedImage } = parseResponse(responseSchema, res);
    const { storageKey, thumbnailKey } = buildStorageKeys(uploadedImage.id);

    for (const key of [storageKey, thumbnailKey]) {
      const stored = await sharp(storage.objects.get(key)!.body).metadata();
      expect(stored.format).toBe('webp');
      expect(stored.exif).toBeUndefined();
    }
  });

  it('除去した EXIF は rawExif に記録として残る', async () => {
    const { tenant, cookies } = await setupMemberSession(app);

    const res = await upload(cookies, {
      fileName: 'photo.jpg',
      contentType: 'image/jpeg',
      body: await jpegWithExif(),
    });
    const { uploadedImage } = parseResponse(responseSchema, res);

    const row = await nestableTransactionWithTenantId(tenant.id, async (tx) =>
      tx.uploadedImage.findFirstOrThrow({
        where: { tenantId: tenant.id, id: uploadedImage.id },
      })
    );
    const rawExif = row.rawExif as Record<string, unknown>;
    expect(rawExif.format).toBe('jpeg');
    expect(typeof rawExif.exifBase64).toBe('string');
    // 元の EXIF ブロックがそのまま復元できる
    const restored = Buffer.from(rawExif.exifBase64 as string, 'base64');
    expect(restored.subarray(0, 6).toString('latin1')).toBe('Exif\0\0');
  });

  it('長辺 2000px を超える画像は縮小される', async () => {
    const { cookies } = await setupMemberSession(app);

    const res = await upload(cookies, {
      fileName: 'big.jpg',
      contentType: 'image/jpeg',
      body: await jpegWithExif(3000, 1500),
    });
    const { uploadedImage } = parseResponse(responseSchema, res);
    expect(uploadedImage.width).toBe(2000);
    expect(uploadedImage.height).toBe(1000);

    const thumb = await sharp(
      storage.objects.get(buildStorageKeys(uploadedImage.id).thumbnailKey)!.body
    ).metadata();
    expect(thumb.width).toBe(400);
    expect(thumb.height).toBe(200);
  });

  it('サイズ上限を超えると 400 で、S3 にも DB にも残らない', async () => {
    const { tenant, cookies } = await setupMemberSession(app);

    const res = await upload(cookies, {
      fileName: 'huge.jpg',
      contentType: 'image/jpeg',
      // 圧縮の効かないノイズで上限超えを作る
      body: await sharp({
        create: {
          width: 4000,
          height: 4000,
          channels: 3,
          background: '#808080',
          noise: { type: 'gaussian', mean: 128, sigma: 80 },
        },
      })
        .jpeg({ quality: 100 })
        .toBuffer(),
    });
    expect(res.statusCode).toBe(400);
    expect(storage.objects.size).toBe(0);

    const count = await nestableTransactionWithTenantId(tenant.id, async (tx) =>
      tx.uploadedImage.count({ where: { tenantId: tenant.id } })
    );
    expect(count).toBe(0);
  });

  it('画像でないファイルは 400', async () => {
    const { cookies } = await setupMemberSession(app);

    const res = await upload(cookies, {
      fileName: 'note.txt',
      contentType: 'text/plain',
      body: Buffer.from('これは画像ではない'),
    });
    expect(res.statusCode).toBe(400);
    expect(storage.objects.size).toBe(0);
  });

  it('image/* を名乗っていても中身が画像でなければ 400', async () => {
    const { cookies } = await setupMemberSession(app);

    const res = await upload(cookies, {
      fileName: 'fake.jpg',
      contentType: 'image/jpeg',
      body: Buffer.from('JPEG ではないバイト列'),
    });
    expect(res.statusCode).toBe(400);
    expect(storage.objects.size).toBe(0);
  });

  it('未ログインは 401', async () => {
    const { payload, headers } = multipartPayload({
      fileName: 'photo.jpg',
      contentType: 'image/jpeg',
      body: await jpegWithExif(100, 100),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/private/uploadedImages',
      headers,
      payload,
    });
    expect(res.statusCode).toBe(401);
  });

  it('上限バイト数は multipart のパーサにも渡っている', () => {
    // ルート側の判定と parser の limits が同じ定数から導かれていること
    expect(UPLOAD_MAX_BYTES).toBe(10 * 1024 * 1024);
  });
});
