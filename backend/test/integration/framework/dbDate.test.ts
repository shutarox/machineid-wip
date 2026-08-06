import {
  nestableTransactionWithTenantId,
  prisma,
} from '@/libs/prisma-connection.js';
import { describe, expect, it } from 'vitest';
import { createTenant } from '../../factories.js';

// @db.Date 正規化拡張のリグレッションテスト。
// PG の date 型は TZ を持たないため、JST の年月日を保ったまま入出力されることを固定する。
// 前提: プロセスは TZ=Asia/Tokyo で動作(起動時 assert 対象)

describe('@db.Date 正規化', () => {
  it('JST midnight を入れても日付がずれない(バグ時は UTC 変換で前日になる)', async () => {
    const tenant = await createTenant();
    const jstMidnight = new Date('2026-07-10T00:00:00+09:00');

    await nestableTransactionWithTenantId(tenant.id, async (tx) => {
      await tx.dateExample.create({
        data: { tenantId: tenant.id, date: jstMidnight },
      });
    });

    // DB 上の生の値が 2026-07-10 であること
    const raw = await prisma.$queryRawUnsafe<{ date: string }[]>(
      `SELECT date::text AS date FROM date_examples`
    );
    expect(raw[0]!.date).toBe('2026-07-10');
  });

  it('JST 深夜(23時台)でも同じ日付として保存される', async () => {
    const tenant = await createTenant();
    await nestableTransactionWithTenantId(tenant.id, async (tx) => {
      await tx.dateExample.create({
        data: {
          tenantId: tenant.id,
          date: new Date('2026-07-10T23:30:00+09:00'),
        },
      });
    });
    const raw = await prisma.$queryRawUnsafe<{ date: string }[]>(
      `SELECT date::text AS date FROM date_examples`
    );
    expect(raw[0]!.date).toBe('2026-07-10');
  });

  it('読み出しは JST midnight の Date として返る', async () => {
    const tenant = await createTenant();
    await nestableTransactionWithTenantId(tenant.id, async (tx) => {
      await tx.dateExample.create({
        data: {
          tenantId: tenant.id,
          date: new Date('2026-07-10T00:00:00+09:00'),
        },
      });
    });

    const row = await nestableTransactionWithTenantId(tenant.id, async (tx) =>
      tx.dateExample.findFirst({ where: { tenantId: tenant.id } })
    );
    const d = row!.date;
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([
      2026, 7, 10,
    ]);
    expect([d.getHours(), d.getMinutes()]).toEqual([0, 0]);
  });

  it('where 条件の date も正規化されて一致検索できる', async () => {
    const tenant = await createTenant();
    await nestableTransactionWithTenantId(tenant.id, async (tx) => {
      await tx.dateExample.create({
        data: {
          tenantId: tenant.id,
          date: new Date('2026-07-10T00:00:00+09:00'),
        },
      });
    });

    const found = await nestableTransactionWithTenantId(
      tenant.id,
      async (tx) =>
        tx.dateExample.findFirst({
          where: {
            tenantId: tenant.id,
            date: new Date('2026-07-10T00:00:00+09:00'),
          },
        })
    );
    expect(found).not.toBeNull();
  });
});
