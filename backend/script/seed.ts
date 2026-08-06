// 初期シード: テナント + 管理者ユーザを作成する
//
// Usage:
//   pnpm script script/seed.ts [tenantName] [tenantCode] [adminLoginId]
//   (backend/ で実行。`script` は tsconfig paths を解決するラッパーで、
//    素の `npx tsx` では @/ の import が解決できない)
//
// 既に同じ tenantCode のテナントがあれば何もしない(冪等)。
// 管理者の初期パスワードを標準出力に表示する。

import { randomString } from '@/libs/cryptoUtils.js';
import { passwordHashGenerate } from '@/libs/cryptoUtils.js';
import { nestableTransactionWithTenantId } from '@/libs/prisma-connection.js';
import { exit } from 'process';

const args = process.argv.slice(2);
const tenantName = args[0] ?? 'デモテナント';
const tenantCode = args[1] ?? 'demo';
const adminLoginId = args[2] ?? 'admin';

await nestableTransactionWithTenantId('*', async (tx) => {
  const existing = await tx.tenant.findFirst({ where: { tenantCode } });
  if (existing) {
    console.log(`tenant '${tenantCode}' already exists. skipped.`);
    return;
  }

  const tenant = await tx.tenant.create({
    data: {
      tenantName,
      tenantCode,
    },
  });

  const initialPassword = randomString(12);
  const passwordHash = await passwordHashGenerate(initialPassword);

  const admin = await tx.user.create({
    data: {
      tenantId: tenant.id,
      userName: '管理者',
      loginId: adminLoginId,
      email: '',
      role: 'ADMIN',
      passwordHash,
    },
  });

  console.log(`created tenant: ${tenant.tenantName} (${tenant.tenantCode})`);
  console.log(`created admin user: ${admin.loginId}`);
  console.log(`initial password: ${initialPassword}`);
});

exit(0);
