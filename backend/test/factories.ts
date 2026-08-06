import { passwordHashGenerate } from '@/libs/cryptoUtils.js';
import { nestableTransactionWithTenantId } from '@/libs/prisma-connection.js';
import { Report, Tenant, User } from '@/generated/prisma/client.js';

// テストデータのファクトリ(シードファクトリの見本)。
// 一意性が必要な値は連番で採番し、上書きしたい値だけ引数で渡す。

let seq = 0;
const nextSeq = () => ++seq;

export const createTenant = async (
  overrides: Partial<Omit<Tenant, 'configurations'>> = {}
): Promise<Tenant> => {
  const n = nextSeq();
  return nestableTransactionWithTenantId('*', async (tx) =>
    tx.tenant.create({
      data: {
        tenantName: `テストテナント${n}`,
        tenantCode: `test-tenant-${n}`,
        ...overrides,
      },
    })
  );
};

export const createUser = async (
  tenantId: string,
  overrides: Partial<User> & { password?: string } = {}
): Promise<User> => {
  const n = nextSeq();
  const { password, ...rest } = overrides;
  const passwordHash = password
    ? await passwordHashGenerate(password)
    : 'unusable-password-hash';
  return nestableTransactionWithTenantId(tenantId, async (tx) =>
    tx.user.create({
      data: {
        tenantId,
        userName: `テストユーザ${n}`,
        loginId: `test-user-${n}`,
        email: '',
        role: 'MEMBER',
        passwordHash,
        ...rest,
      },
    })
  );
};

export const createReport = async (
  tenantId: string,
  userId: string,
  overrides: Partial<Report> = {}
): Promise<Report> => {
  const n = nextSeq();
  return nestableTransactionWithTenantId(tenantId, async (tx) =>
    tx.report.create({
      data: {
        tenantId,
        userId,
        title: `テスト報告書${n}`,
        comment: `テスト報告書${n}の本文`,
        ...overrides,
      },
    })
  );
};

export const createEditLock = async (
  tenantId: string,
  lockName: string
): Promise<void> => {
  await nestableTransactionWithTenantId(tenantId, async (tx) => {
    await tx.editLock.create({
      data: { tenantId, lockName, lockedAt: new Date() },
    });
  });
};
