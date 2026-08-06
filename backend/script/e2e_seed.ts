// E2E スモークテスト用のテナントとユーザを作成する(冪等)。
// パスワードは固定(ローカル/CI のテスト専用。本番系では実行しない)

import { passwordHashGenerate } from '@/libs/cryptoUtils.js';
import { nestableTransactionWithTenantId } from '@/libs/prisma-connection.js';
import { exit } from 'process';

export const E2E_TENANT_CODE = 'e2e-tenant';
export const E2E_LOGIN_ID = 'e2e-admin';
export const E2E_PASSWORD = 'E2eTestPass123';

const passwordHash = await passwordHashGenerate(E2E_PASSWORD);

await nestableTransactionWithTenantId('*', async (tx) => {
  let tenant = await tx.tenant.findFirst({
    where: { tenantCode: E2E_TENANT_CODE },
  });
  tenant ??= await tx.tenant.create({
    data: { tenantName: 'E2Eテナント', tenantCode: E2E_TENANT_CODE },
  });

  // 過去のテスト実行が作ったユーザ(e2e-created-*)を掃除する
  const staleUsers = await tx.user.findMany({
    select: { id: true },
    where: {
      tenantId: tenant.id,
      loginId: { startsWith: 'e2e-created-' },
    },
  });
  const staleIds = staleUsers.map((u) => u.id);
  if (staleIds.length > 0) {
    await tx.loginSession.deleteMany({
      where: { tenantId: tenant.id, userId: { in: staleIds } },
    });
    await tx.passwordResetRequest.deleteMany({
      where: { tenantId: tenant.id, userId: { in: staleIds } },
    });
    await tx.user.deleteMany({
      where: { tenantId: tenant.id, id: { in: staleIds } },
    });
    console.log(`cleaned up ${staleIds.length} stale e2e users`);
  }

  // 過去のテスト実行が残した報告書・画像を掃除する。
  // S3 側のオブジェクトはここでは消さない(消し漏れは cleanup_uploads.ts が
  // 3 日で回収する。テスト用 MinIO なので実害もない)
  const staleReports = await tx.report.findMany({
    select: { id: true },
    where: { tenantId: tenant.id, title: { startsWith: 'E2E' } },
  });
  if (staleReports.length > 0) {
    const staleReportIds = staleReports.map((r) => r.id);
    await tx.uploadedImage.deleteMany({
      where: { tenantId: tenant.id, reportId: { in: staleReportIds } },
    });
    await tx.report.deleteMany({
      where: { tenantId: tenant.id, id: { in: staleReportIds } },
    });
    console.log(`cleaned up ${staleReportIds.length} stale e2e reports`);
  }

  await tx.user.upsert({
    where: {
      tenantId_loginId: { tenantId: tenant.id, loginId: E2E_LOGIN_ID },
    },
    create: {
      tenantId: tenant.id,
      userName: 'E2E管理者',
      loginId: E2E_LOGIN_ID,
      email: '',
      role: 'ADMIN',
      passwordHash,
    },
    update: { passwordHash, role: 'ADMIN', isDisabled: false },
  });
});

console.log(`e2e seed done: ${E2E_TENANT_CODE} / ${E2E_LOGIN_ID}`);
exit(0);
