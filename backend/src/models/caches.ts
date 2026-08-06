// リクエスト単位のインメモリキャッシュ(requestId キー)。
// 値の型は呼び出し側がキーごとに指定する(platform は app 側の型を知らない)。

type Cache = {
  createdAt: Date;
  values: {
    [cacheType: string]: { tenantId: string; value: unknown };
  };
};

type Caches = {
  [requestId: string]: Cache;
};

const caches: Caches = {};

export const getCache = <T>(
  tenantId: string,
  requestId: string,
  cacheType: string
): T | null => {
  if (requestId === '') {
    throw new Error('requestId is empty');
  }
  const entry = caches[requestId]?.values[cacheType];
  if (!entry) {
    return null;
  }
  if (entry.tenantId !== tenantId) {
    throw new Error(`tenantId is different: ${entry.tenantId} !== ${tenantId}`);
  }
  return entry.value as T;
};

export const setCache = <T>(
  tenantId: string,
  requestId: string,
  cacheType: string,
  value: T | null
): void => {
  if (requestId === '') {
    throw new Error('requestId is empty');
  }
  if (!caches[requestId]) {
    caches[requestId] = { createdAt: new Date(), values: {} };
  }

  const cacheTenantId = caches[requestId].values[cacheType]?.tenantId;
  if (cacheTenantId && cacheTenantId !== tenantId) {
    throw new Error(`tenantId is different: ${cacheTenantId} !== ${tenantId}`);
  }

  if (value === null) {
    delete caches[requestId].values[cacheType];
  } else {
    caches[requestId].values[cacheType] = { tenantId, value };
  }
};

export const clearCache = (requestId: string): void => {
  delete caches[requestId];

  // abort したリクエストのキャッシュが拾いきれないので30秒以上経過したものを削除
  for (const [requestId, cache] of Object.entries(caches)) {
    if (cache.createdAt.getTime() < Date.now() - 30 * 1000) {
      delete caches[requestId];
    }
  }
};
