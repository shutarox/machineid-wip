import { nestableTransactionWithTenantId } from '@/libs/prisma-connection.js';
import { z } from 'zod';
import { getCache, setCache } from './caches.js';

export const debugParamsSchema = z.object({
  virtualDate: z.string(),
});

export type DebugParams = z.infer<typeof debugParamsSchema>;

export const getDebugParams = async ({
  tenantId,
  requestId,
}: {
  tenantId: string;
  requestId: string;
}): Promise<DebugParams> => {
  const cachedDebugParams = getCache<DebugParams>(tenantId, requestId, 'debugParams');
  if (cachedDebugParams !== null) {
    return cachedDebugParams;
  }

  return await nestableTransactionWithTenantId(tenantId, async (tx) => {
    const result = await tx.debugParameter.findMany({
      where: { tenantId },
    });

    let virtualDate =
      result.find((param) => param.name === 'virtualDate')?.value ?? '';
    if (isNaN(new Date(virtualDate).getTime())) {
      virtualDate = '';
    }

    const debugParams = { tenantId, virtualDate };
    setCache(tenantId, requestId, 'debugParams', debugParams);

    return debugParams;
  });
};
