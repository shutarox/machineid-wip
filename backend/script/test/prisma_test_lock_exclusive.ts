// ちゃんとロックが機能するかのテスト

import {
  getLock,
  nestableTransactionWithTenantId,
} from '@/libs/prisma-connection.js';

let tenantId = '';
await nestableTransactionWithTenantId('*', async (tx) => {
  const result = await tx.tenant.findFirst({
    // 表示名ではなく tenantCode で引く(seed が作る既定のテナント)
    where: { tenantCode: 'demo' },
  });
  if (!result) {
    throw new Error('tenant not found');
  }
  tenantId = result.id;
});

setTimeout(() => {
  lock('thread1').catch(console.error);
}, 10);
setTimeout(() => {
  lock('thread2').catch(console.error);
}, 20);

async function lock(title: string) {
  await nestableTransactionWithTenantId(tenantId, async (_tx) => {
    console.log(`wait: ${title}`);
    await getLock(tenantId, 'test');
    console.log(`begin: ${title}`);
    await new Promise((resolve) => setTimeout(resolve, 2000)); // 2秒待つ
    console.log(`end: ${title}`);
  });
}
