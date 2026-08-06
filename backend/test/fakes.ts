import type { Storage } from '@/libs/storage.js';

// テスト用のフェイク。外部サービスの注入点(`setStorageForTesting` 等)に差し込む。
// 実データを扱う DB はモックしないが、外部サービスはここで差し替える
// (ADR `docs/decisions/20260710-test-strategy.md`)。

export type MemoryObject = {
  body: Buffer;
  contentType: string;
};

export type MemoryStorage = Storage & {
  /** 置かれているオブジェクト(キー → 中身)。アサーションに使う */
  objects: Map<string, MemoryObject>;
};

/**
 * メモリ上のオブジェクトストレージ。
 *
 * `presignGet` は**署名を検証できる URL を作らない**(実 S3 固有の配線は
 * `script/test/storage_smoke.ts` と E2E が MinIO 経由で見る)。ここでは
 * 「キーごとに一意な URL が返る」ことだけを保証する。
 */
export const createMemoryStorage = (): MemoryStorage => {
  const objects = new Map<string, MemoryObject>();
  return {
    objects,
    put: async (key, body, contentType) => {
      objects.set(key, { body, contentType });
    },
    presignGet: async (key) => `memory://${key}`,
    remove: async (keys) => {
      // S3 は存在しないキーの削除も成功する。その挙動に合わせる
      for (const key of keys) {
        objects.delete(key);
      }
    },
  };
};
