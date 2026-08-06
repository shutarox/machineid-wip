import { getDebugParams } from '@/models/debugParams.js';

export const getCurrentDate = async ({
  tenantId,
  requestId,
}: {
  tenantId: string;
  requestId: string;
}): Promise<Date> => {
  const debugParams = await getDebugParams({
    tenantId,
    requestId,
  });

  return debugParams?.virtualDate
    ? new Date(debugParams.virtualDate)
    : new Date();
};
