import {
  nestableTransactionWithTenantId,
  prisma,
} from '@/libs/prisma-connection.js';
import { describe, expect, it } from 'vitest';
import { createTenant, createUser } from '../../factories.js';

// マルチテナント RLS 拡張のリグレッションテスト(雛形の目玉)。
// tenantId カラムを持つモデルへのクエリは、tenantId 付き tx コンテキスト内で、
// かつ where / data に一致する tenantId を含まなければ拒否される

describe('RLS 拡張', () => {
  it('tx コンテキスト外のクエリは拒否される', async () => {
    await expect(prisma.user.findMany({ take: 1 })).rejects.toThrow(
      /requiredTenantId is not set/
    );
  });

  it('where に tenantId がないクエリは拒否される', async () => {
    const tenant = await createTenant();
    await expect(
      nestableTransactionWithTenantId(tenant.id, async (tx) =>
        tx.user.findMany({ take: 1 })
      )
    ).rejects.toThrow(/RLS/);
  });

  it('コンテキストと異なる tenantId のクエリは拒否される', async () => {
    const tenantA = await createTenant();
    const tenantB = await createTenant();
    await expect(
      nestableTransactionWithTenantId(tenantA.id, async (tx) =>
        tx.user.findMany({ where: { tenantId: tenantB.id } })
      )
    ).rejects.toThrow(/does not match/);
  });

  it('一致する tenantId のクエリは通り、他テナントの行は見えない', async () => {
    const tenantA = await createTenant();
    const tenantB = await createTenant();
    await createUser(tenantA.id);
    await createUser(tenantB.id);

    const users = await nestableTransactionWithTenantId(
      tenantA.id,
      async (tx) => tx.user.findMany({ where: { tenantId: tenantA.id } })
    );
    expect(users).toHaveLength(1);
    expect(users[0]!.tenantId).toBe(tenantA.id);
  });

  it('create の data に tenantId がなければ拒否される', async () => {
    const tenant = await createTenant();
    await expect(
      nestableTransactionWithTenantId(tenant.id, async (tx) =>
        tx.editLock.create({
          // @ts-expect-error tenantId 欠落の検証
          data: { lockName: 'x', lockedAt: new Date() },
        })
      )
    ).rejects.toThrow(/RLS/);
  });

  it('count / aggregate も where の tenantId を要求する', async () => {
    const tenant = await createTenant();
    await createUser(tenant.id);

    await expect(
      nestableTransactionWithTenantId(tenant.id, async (tx) =>
        tx.user.count({})
      )
    ).rejects.toThrow(/RLS/);

    const count = await nestableTransactionWithTenantId(
      tenant.id,
      async (tx) => tx.user.count({ where: { tenantId: tenant.id } })
    );
    expect(count).toBe(1);
  });

  it('複合ユニークキー内の tenantId も認識される', async () => {
    const tenant = await createTenant();
    const user = await createUser(tenant.id);

    const found = await nestableTransactionWithTenantId(
      tenant.id,
      async (tx) =>
        tx.user.findUnique({
          where: {
            tenantId_loginId: { tenantId: tenant.id, loginId: user.loginId },
          },
        })
    );
    expect(found!.id).toBe(user.id);

    // 複合キー内でもテナント不一致は拒否
    const other = await createTenant();
    await expect(
      nestableTransactionWithTenantId(tenant.id, async (tx) =>
        tx.user.findUnique({
          where: {
            tenantId_loginId: { tenantId: other.id, loginId: user.loginId },
          },
        })
      )
    ).rejects.toThrow(/does not match/);
  });

  it("tenantId '*' はテナント横断を許可する(バッチ用)", async () => {
    const tenantA = await createTenant();
    const tenantB = await createTenant();
    await createUser(tenantA.id);
    await createUser(tenantB.id);

    const users = await nestableTransactionWithTenantId('*', async (tx) =>
      tx.user.findMany({})
    );
    expect(users).toHaveLength(2);
  });
});
