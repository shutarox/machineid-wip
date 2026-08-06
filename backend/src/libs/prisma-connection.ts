/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import { ServerError } from '@/libs/appError.js';
import { repoRoot } from '@/libs/repoRoot.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client.js';
import { AsyncLocalStorage } from 'async_hooks';
import fs from 'fs';
import path from 'path';

// Prisma 7: 接続は driver adapter(@prisma/adapter-pg)経由。
// connection_limit は Prisma エンジン時代の URL パラメータだったため、
// pg Pool の max に読み替える
if (!process.env.DB_URL) {
  throw new ServerError('DB_URL が設定されていません');
}
const dbUrl = new URL(process.env.DB_URL);
const connectionLimit = Number(dbUrl.searchParams.get('connection_limit') ?? 10);
dbUrl.searchParams.delete('connection_limit');

const adapter = new PrismaPg({
  connectionString: dbUrl.toString(),
  max: connectionLimit,
});

const prisma1 = new PrismaClient({
  adapter,
  log: [{ emit: 'event', level: 'query' }],
});

import PrismaInternals from '@prisma/internals';
const getDMMF = PrismaInternals.getDMMF;

//==================

// tenantId があるテーブル（ RLS 的な対応をするため ）
const hasTenantId: Map<string, boolean> = new Map<string, boolean>();
// @db.Date フィールド名の集合（TZ-naive な date 型の正規化用）
// "date" にマッチするフィールド名のみ @db.Date として許可
const dateFieldNames: Set<string> = new Set<string>();

async function loadSchemaMetadata() {
  const schemaPath = path.join(repoRoot(), 'backend/prisma/schema.prisma');
  const schema = fs.readFileSync(schemaPath, 'utf-8');

  const dmmf = await getDMMF({ datamodel: schema });
  dmmf.datamodel.models.forEach((model) => {
    model.fields.forEach((field) => {
      if (field.name === 'tenantId') {
        hasTenantId.set(model.name, true);
      }
      const isDateNativeType =
        field.nativeType && field.nativeType[0]?.toLowerCase() === 'date';
      const matchesDatePattern = /^date$/.test(field.name);

      if (isDateNativeType && !matchesDatePattern) {
        throw new ServerError(
          `カラム命名規則違反: ${model.name}.${field.name} -- Date 型のカラム名で許可されているカラム名は date のみです`
        );
      }
      if (matchesDatePattern && !isDateNativeType) {
        throw new ServerError(
          `カラム命名規則違反: ${model.name}.${field.name} -- このカラム名は Date 型のみ許可されています`
        );
      }
      if (isDateNativeType) {
        dateFieldNames.add(field.name);
      }
    });
  });
}

// @db.Date カラムの正規化
// PostgreSQL の date 型は TZ 情報を持たず、Prisma は Date オブジェクトを UTC で送信する。
// そのため JST midnight (= UTC 前日 15:00) を date に送ると、UTC の日付部分が前日になり
// 1 日ずれてしまう。
// 入力: JST の年月日を保持したまま UTC でも同じ日付になる値に変換
// 出力: PG が返す UTC midnight を JST midnight に補正

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeDateInputs(obj: any) {
  if (obj === null || typeof obj !== 'object' || obj instanceof Date) return;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      normalizeDateInputs(item);
    }
    return;
  }
  for (const [key, value] of Object.entries(obj)) {
    if (value instanceof Date && dateFieldNames.has(key)) {
      // JST の年月日を取り出し、UTC の同じ日付になる Date を生成する
      // (JST midnight をそのまま送ると UTC では前日になるため)
      obj[key] = new Date(
        Date.UTC(value.getFullYear(), value.getMonth(), value.getDate())
      );
    } else if (value !== null && typeof value === 'object') {
      normalizeDateInputs(value);
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeDateOutputs(result: any) {
  if (result === null || typeof result !== 'object') return;
  if (Array.isArray(result)) {
    for (const item of result) {
      normalizeDateOutputs(item);
    }
    return;
  }
  for (const [key, value] of Object.entries(result)) {
    if (value instanceof Date && dateFieldNames.has(key)) {
      // PG が返す UTC midnight から UTC の年月日を取り出し、JST の同日 midnight を生成する
      result[key] = new Date(
        value.getUTCFullYear(),
        value.getUTCMonth(),
        value.getUTCDate()
      );
    } else if (value !== null && typeof value === 'object') {
      normalizeDateOutputs(value);
    }
  }
}

// 拡張

let isLoaded = false;

const prisma2 = prisma1.$extends({
  query: {
    async $allOperations({ operation, model, args, query }) {
      if (!isLoaded) {
        await loadSchemaMetadata();
        isLoaded = true;
      }

      // RLS 確認
      if (model) {
        if (hasTenantId.get(model)) {
          const requiredTenantId = getTenantId();
          if (!requiredTenantId) {
            throw new ServerError(
              `RLS: requiredTenantId is not set. Use 'nestableTransactionWithTenantId'`
            );
          }
          if (requiredTenantId !== '*') {
            const target = operation.match(
              /^find|upsert|delete|update|count|aggregate|groupBy/i
            )
              ? 'where'
              : operation.match(/^create/i)
                ? 'data'
                : '';
            const columns = args[target] ?? {};
            const values = Object.entries(columns)
              .map(([key, val]) => {
                if (key === 'tenantId') {
                  return val;
                }
                // 複合ユニークキー(tenantId_lockName 等)や upsert の
                // where 内にネストされた tenantId も 1 段だけ拾う
                if (val && typeof val === 'object') {
                  const hits = Object.entries(val)
                    .map(([key2, val2]) => {
                      if (key2 === 'tenantId') {
                        return val2;
                      }
                    })
                    .filter((val2) => val2 !== undefined);
                  if (hits.length > 0) {
                    return hits[0];
                  }
                }
              })
              .filter((val) => val !== undefined);

            const value = values.length > 0 ? values[0] : undefined;

            if (!value) {
              throw new ServerError(
                `RLS: ${model} ${operation} does not contained in ${operation} tenantId ${JSON.stringify(columns)}`
              );
            } else if (value !== requiredTenantId) {
              throw new ServerError(
                `RLS: ${model} ${operation} tenantId does not match ${value} !== ${requiredTenantId}`
              );
            }
          }
        }
      }

      // @db.Date カラムの入力正規化
      normalizeDateInputs(args);

      const result = await query(args);

      // @db.Date カラムの出力正規化
      normalizeDateOutputs(result);

      return result;
    },
  },
});

export const prisma = prisma2;

//================= nestable transaction scope

const asyncLocalStorage = new AsyncLocalStorage();

export type NestablePrismaTransaction = Omit<
  PrismaClient,
  '$on' | '$connect' | '$disconnect' | '$use' | '$transaction'
>;

type PrismaTransactionContext = {
  tx: NestablePrismaTransaction;
  tenantId?: string;
};

const getPrismaTransactionContext = ():
  | PrismaTransactionContext
  | undefined => {
  const store = asyncLocalStorage.getStore();
  if (!store) {
    return undefined;
  }
  return store as PrismaTransactionContext;
};

const setTenantId = (tenantId: string) => {
  const ctx = getPrismaTransactionContext();

  if (!ctx) {
    throw new ServerError('this should be called in nestableTransaction');
  }

  if (ctx.tenantId && ctx.tenantId !== tenantId) {
    throw new ServerError('different tenantId is already set');
  }
  ctx.tenantId = tenantId;
};

export const getTenantId = () => {
  const ctx = getPrismaTransactionContext();
  return ctx?.tenantId;
};

// tx 内での外部 I/O(メール送信・外部 API 等)を禁止するガード。
// 外部サービスクライアントの入口で呼ぶこと
export const assertNotInTransaction = (what: string) => {
  if (getPrismaTransactionContext()) {
    throw new ServerError(
      `トランザクション内での外部 I/O は禁止です: ${what}(tx の外に出してから実行してください)`
    );
  }
};

//================= transaction scope

// READ COMMITTED: Prisma の $transaction は START TRANSACTION WITH CONSISTENT SNAPSHOT を
// 発行するため REPEATABLE READ ではトランザクション開始時点でスナップショットが確定する。
// getLock による排他制御を正しく機能させるには、ロック取得後の read が最新コミット済み
// データを見る必要があるため、READ COMMITTED をデフォルトとする。

// タイムアウトは二段構え: Web API は既定 5 秒、バッチ等の長時間処理は
// opts.timeoutMs で明示的に延長する。閾値を超えた tx は警告ログを出す

export type TransactionOptions = {
  timeoutMs?: number;
};

const DEFAULT_TX_TIMEOUT_MS = 5000;
const SLOW_TX_WARN_MS = 3000;

export const nestableTransaction = async <R>(
  f: (tx: NestablePrismaTransaction) => Promise<R>,
  opts?: TransactionOptions
): Promise<R> => {
  const ctx = getPrismaTransactionContext();
  if (ctx) {
    return await f(ctx.tx);
  } else {
    const startedAt = Date.now();
    try {
      return await prisma2.$transaction(
        async (newTx) => {
          const newCtx = { tx: newTx };
          return await asyncLocalStorage.run(newCtx, async () => {
            return await nestableTransaction(f);
          });
        },
        {
          timeout: opts?.timeoutMs ?? DEFAULT_TX_TIMEOUT_MS,
          isolationLevel: 'ReadCommitted',
        }
      );
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed > SLOW_TX_WARN_MS) {
        console.warn(`[tx] トランザクションが ${elapsed}ms かかりました`);
      }
    }
  }
};

export const nestableTransactionWithTenantId = async <R>(
  tenantId: string,
  f: (tx: NestablePrismaTransaction) => Promise<R>,
  opts?: TransactionOptions
): Promise<R> => {
  const ctx = getPrismaTransactionContext();
  if (ctx) {
    setTenantId(tenantId);
    return await f(ctx.tx);
  } else {
    const startedAt = Date.now();
    try {
      return await prisma2.$transaction(
        async (newTx) => {
          const newCtx = { tx: newTx };
          return await asyncLocalStorage.run(newCtx, async () => {
            setTenantId(tenantId);
            return await nestableTransaction(f);
          });
        },
        {
          timeout: opts?.timeoutMs ?? DEFAULT_TX_TIMEOUT_MS,
          isolationLevel: 'ReadCommitted',
        }
      );
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed > SLOW_TX_WARN_MS) {
        console.warn(`[tx] トランザクションが ${elapsed}ms かかりました`);
      }
    }
  }
};

//======================================= get lock

export const getLock = async (tenantId: string, lockName: string) => {
  await nestableTransactionWithTenantId(tenantId, async (tx) => {
    const result = await tx.editLock.update({
      data: { lockedAt: new Date() },
      where: { tenantId_lockName: { tenantId, lockName } },
    });
    if (!result) {
      throw new ServerError('lock not found');
    }
  });
};
