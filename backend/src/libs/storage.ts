import * as Config from '@/config.js';
import { ServerError } from '@/libs/appError.js';
import { assertNotInTransaction } from '@/libs/prisma-connection.js';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// オブジェクトストレージの注入点。
// 実体は S3(ローカル / CI は MinIO)だが、テストでは setStorageForTesting で
// フェイクに差し替える。`libs/mailer.ts` と同じ構造。
//
// 入出力はトランザクション内では禁止(assertNotInTransaction)— tx 内で外部 I/O を
// すると、ロールバックしてもオブジェクトだけ残る・tx をネットワークのレイテンシで
// 長引かせる、を防ぐ。
//
// **パスにテナントを含めない**方針(アップロード時点で tenantId が確定しない
// ユーザがありうるため)。アクセス制御は presigned URL を発行する前の DB 検査で行う
// ので、キーの構造はセキュリティ境界ではない。判断は
// `docs/decisions/20260805-file-upload.md`。

export type Storage = {
  /** オブジェクトを置く(同じキーなら上書き) */
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** 期限つきの取得 URL を発行する */
  presignGet(key: string, expiresInSec?: number): Promise<string>;
  /** まとめて削除する。存在しないキーが混ざっていても成功する(S3 の挙動に合わせる) */
  remove(keys: string[]): Promise<void>;
};

// credentials は**ローカル / CI(MinIO)でだけ**明示的に渡す。本番は undefined になり、
// SDK の既定チェーン = ECS のタスクロールに落ちる(Config.S3_CREDENTIALS のコメント参照)
const s3Client = (): S3Client =>
  new S3Client({
    region: Config.AWS_REGION,
    endpoint: Config.S3_ENDPOINT,
    forcePathStyle: Config.S3_FORCE_PATH_STYLE,
    credentials: Config.S3_CREDENTIALS,
  });

// presigned URL の発行専用。URL を開くのはサーバではなく**ブラウザ**なので、
// ブラウザから到達できるホスト名で署名する必要がある(Config.S3_PUBLIC_ENDPOINT)。
// URL のホスト名を後から書き換えるのは不可 — SigV4 が Host ごと署名するため 403 になる
const s3PresignClient = (): S3Client =>
  new S3Client({
    region: Config.AWS_REGION,
    endpoint: Config.S3_PUBLIC_ENDPOINT,
    forcePathStyle: Config.S3_FORCE_PATH_STYLE,
    credentials: Config.S3_CREDENTIALS,
  });

const requireBucket = (): string => {
  if (!Config.S3_BUCKET) {
    throw new ServerError('S3_BUCKET is not set');
  }
  return Config.S3_BUCKET;
};

const s3Storage: Storage = {
  async put(key, body, contentType) {
    await s3Client().send(
      new PutObjectCommand({
        Bucket: requireBucket(),
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );
  },

  async presignGet(key, expiresInSec = Config.S3_PRESIGN_EXPIRES_SEC) {
    return await getSignedUrl(
      s3PresignClient(),
      new GetObjectCommand({ Bucket: requireBucket(), Key: key }),
      { expiresIn: expiresInSec }
    );
  },

  async remove(keys) {
    if (keys.length === 0) {
      return;
    }
    await s3Client().send(
      new DeleteObjectsCommand({
        Bucket: requireBucket(),
        Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
      })
    );
  },
};

let storage: Storage = s3Storage;

export const putObject = async (
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> => {
  assertNotInTransaction('S3 へのアップロード');
  await storage.put(key, body, contentType);
};

export const presignGetObject = async (
  key: string,
  expiresInSec?: number
): Promise<string> => {
  assertNotInTransaction('S3 の presigned URL 発行');
  return await storage.presignGet(key, expiresInSec);
};

export const removeObjects = async (keys: string[]): Promise<void> => {
  assertNotInTransaction('S3 のオブジェクト削除');
  await storage.remove(keys);
};

// テスト用: フェイクに差し替える(null で実体に戻す)
export const setStorageForTesting = (fake: Storage | null): void => {
  storage = fake ?? s3Storage;
};
