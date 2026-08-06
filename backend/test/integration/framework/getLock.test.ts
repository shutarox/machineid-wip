import {
  getLock,
  nestableTransactionWithTenantId,
} from '@/libs/prisma-connection.js';
import { describe, expect, it } from 'vitest';
import { createEditLock, createTenant } from '../../factories.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// getLock(EditLock 行の行ロックによる排他制御)のリグレッションテスト。
// READ COMMITTED 分離レベルとセットで「ロック取得後の read が最新コミット済みを見る」
// ことを前提にした仕組みのため、直列化されることをテストで固定する

describe('getLock', () => {
  it('同じロック名を取る 2 つの tx は直列化される', async () => {
    const tenant = await createTenant();
    await createEditLock(tenant.id, 'test-lock');

    const events: string[] = [];

    const task = (name: string) =>
      nestableTransactionWithTenantId(tenant.id, async () => {
        await getLock(tenant.id, 'test-lock');
        events.push(`${name}:start`);
        await sleep(200);
        events.push(`${name}:end`);
      });

    await Promise.all([task('A'), task('B')]);

    // 直列化されていれば start → end が必ず対で並ぶ(交差しない)
    expect(events).toHaveLength(4);
    expect(events[1]).toBe(`${events[0]!.split(':')[0]}:end`);
    expect(events[3]).toBe(`${events[2]!.split(':')[0]}:end`);
  });

  it('存在しないロック名は例外', async () => {
    const tenant = await createTenant();
    await expect(
      nestableTransactionWithTenantId(tenant.id, async () => {
        await getLock(tenant.id, 'no-such-lock');
      })
    ).rejects.toThrow();
  });
});
