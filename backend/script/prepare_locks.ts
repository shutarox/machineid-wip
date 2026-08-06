/*===================================================

新テナントに対してロックファイルを準備するスクリプト

===================================================*/

import { nestableTransactionWithTenantId } from '@/libs/prisma-connection.js';

import { exit } from 'process';

const [script, ...args] = process.argv.slice(1);
if (args.length < 1) {
  console.error(`Usage: ${script} <tenant_code>`);
  exit(1);
}
const tenantCode = args[0]!;
const tenantId = await nestableTransactionWithTenantId('*', async (tx) => {
  const tenant = await tx.tenant.findFirst({
    where: { tenantCode },
  });
  if (!tenant) {
    throw new Error(`${tenantCode} が見つかりません`);
  }
  return tenant.id;
});

await nestableTransactionWithTenantId(tenantId, async (tx) => {
  const lockNames = ['sharedAssignment', 'reservation'];
  await tx.editLock.deleteMany({
    where: { tenantId },
  });

  for (const lockName of lockNames) {
    await tx.editLock.create({
      data: { tenantId, lockName, lockedAt: new Date() },
    });
  }
});
