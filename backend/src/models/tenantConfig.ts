import { nestableTransactionWithTenantId } from '@/libs/prisma-connection.js';
import { z } from 'zod';
import { getCache, setCache } from '@/models/caches.js';

// テナントごとの設定は tenants.configurations(JSON カラム)に保存する。
// DB 保存形(dbTenantConfigSchema)と、クライアントへ公開する部分集合
// (publicTenantConfigSchema)を分けて定義する。案件固有の設定は
// ここにフィールドを追加していく(unknown キーは parse 時に除去される)。

const dbTenantConfigSchema = z.object({});

export const publicTenantConfigSchema = z.object({});

export type TenantConfig = z.infer<typeof dbTenantConfigSchema>;

export const getTenantConfig = async ({
  tenantId,
  requestId,
}: {
  tenantId: string;
  requestId: string;
}): Promise<TenantConfig> => {
  const cachedTenantConfig = getCache<TenantConfig>(tenantId, requestId, 'tenantConfig');
  if (cachedTenantConfig !== null) {
    return cachedTenantConfig;
  }

  return await nestableTransactionWithTenantId(tenantId, async (tx) => {
    const result = await tx.tenant.findFirst({
      select: { configurations: true },
      where: { id: tenantId },
    });
    if (!result) {
      throw new Error(`Tenant config not found for tenantId: ${tenantId}`);
    }

    const config: TenantConfig = dbTenantConfigSchema.parse(
      result.configurations
    );
    setCache(tenantId, requestId, 'tenantConfig', config);

    return config;
  });
};
