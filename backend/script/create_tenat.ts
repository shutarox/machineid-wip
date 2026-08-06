import { nestableTransactionWithTenantId } from '@/libs/prisma-connection.js';
import { exit } from 'process';

const [script, ...args] = process.argv.slice(1);

if (args.length < 2) {
  console.error(`Usage: ${script} <tenant_name> <tenant_code>`);
  exit(1);
}

const tenantName = args[0]!;
const tenantCode = args[1]!;

await nestableTransactionWithTenantId('*', async (tx) => {
  const tenant = await tx.tenant.create({
    data: {
      tenantName,
      tenantCode,
      sourceIpRange: '0.0.0.0',
    },
  });
  console.log(`created tenant:${JSON.stringify(tenant, null, 2)}`);
});
