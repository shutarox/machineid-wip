import { Prisma } from '@/generated/prisma/client.js';
import { ClientError } from '@/libs/appError.js';
import type { NestablePrismaTransaction } from '@/libs/prisma-connection.js';
import { presignGetObject, putObject, removeObjects } from '@/libs/storage.js';
import sharp from 'sharp';
import type { Metadata } from 'sharp';

// 画像アップロードのモデル。
// 「route → tx を受け取るモデル関数 → 純粋関数」の 3 層で、**S3 I/O は tx の外**に置く
// (tx 内で書くとロールバック時にオブジェクトだけ残る。assertNotInTransaction が守る)。

//================= 制限値(雛形の既定。案件で変える場合はここだけ)

/** 1 報告書あたりの最大枚数 */
export const MAX_IMAGES_PER_REPORT = 10;
/** 1 枚あたりの最大バイト数(multipart のパーサにも渡す) */
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
/** 本体の長辺 */
const MAX_EDGE_PX = 2000;
/** サムネイルの長辺 */
const THUMBNAIL_EDGE_PX = 400;
/** 仮アップロードを保持する期間。これを過ぎた未確定画像は cleanup_uploads.ts が消す */
const UPLOAD_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;

const OUTPUT_MIME = 'image/webp';

//================= 純粋関数

/** S3 のキー。テナントを含めない(判断は docs/decisions/20260805-file-upload.md) */
export const buildStorageKeys = (uploadedImageId: string) => ({
  storageKey: `uploaded-images/${uploadedImageId}/original.webp`,
  thumbnailKey: `uploaded-images/${uploadedImageId}/thumb.webp`,
});

/** 仮アップロードのうち、この時刻より古いものが削除対象になる */
export const uploadExpiryThreshold = (now: Date): Date =>
  new Date(now.getTime() - UPLOAD_RETENTION_MS);

//================= 画像加工(外部 I/O ではないので tx の内外を問わない)

export type ProcessedImage = {
  body: Buffer;
  thumbnail: Buffer;
  width: number;
  height: number;
  rawExif: Prisma.InputJsonValue;
};

/**
 * EXIF を読み取ってから**除去した**本体とサムネイルを作る。
 *
 * `sharp` は既定でメタデータを引き継がない(`withMetadata()` を呼ばない限り)ので、
 * 出力には EXIF が乗らない。読み取った内容は記録として呼び出し側が保存する。
 */
export const processImage = async (input: Buffer): Promise<ProcessedImage> => {
  const source = sharp(input, { failOn: 'error' });

  let metadata: Metadata;
  try {
    metadata = await source.metadata();
  } catch {
    throw new ClientError('画像として読み取れませんでした', 400);
  }
  if (!metadata.width || !metadata.height) {
    throw new ClientError('画像として読み取れませんでした', 400);
  }

  const body = await sharp(input)
    .rotate() // EXIF の向きをピクセルに焼き込む(この後 EXIF を落とすため)
    .resize({
      width: MAX_EDGE_PX,
      height: MAX_EDGE_PX,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp()
    .toBuffer();

  const thumbnail = await sharp(input)
    .rotate()
    .resize({
      width: THUMBNAIL_EDGE_PX,
      height: THUMBNAIL_EDGE_PX,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp()
    .toBuffer();

  const processed = await sharp(body).metadata();

  return {
    body,
    thumbnail,
    width: processed.width ?? 0,
    height: processed.height ?? 0,
    // exif は Buffer なので JSON にできない。読める形に落として残す
    rawExif: extractExif(metadata),
  };
};

/** sharp の metadata から JSON にできる形で EXIF 相当を取り出す */
const extractExif = (metadata: Metadata): Prisma.InputJsonValue => {
  const exif: Record<string, unknown> = {
    format: metadata.format ?? null,
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    orientation: metadata.orientation ?? null,
    density: metadata.density ?? null,
    hasAlpha: metadata.hasAlpha ?? null,
    space: metadata.space ?? null,
  };
  // 生の EXIF ブロックは base64 で保持する(解析はせず、原本を失わないことを優先)
  if (metadata.exif) {
    exif.exifBase64 = Buffer.from(metadata.exif).toString('base64');
  }
  return exif as Prisma.InputJsonValue;
};

//================= モデル関数(tx を受け取る)

export const createUploadedImage = async (
  tx: NestablePrismaTransaction,
  params: {
    tenantId: string;
    userId: string;
    id: string;
    processed: ProcessedImage;
    byteSize: number;
  }
) => {
  const { storageKey, thumbnailKey } = buildStorageKeys(params.id);
  return await tx.uploadedImage.create({
    data: {
      id: params.id,
      tenantId: params.tenantId,
      userId: params.userId,
      storageKey,
      thumbnailKey,
      mimeType: OUTPUT_MIME,
      byteSize: params.byteSize,
      width: params.processed.width,
      height: params.processed.height,
      rawExif: params.processed.rawExif,
    },
  });
};

/**
 * 仮アップロード(未確定)を 1 件取得する。
 * **確定済み・他人のものは返さない** — 呼び出し側で「見つからない = 404」にする。
 */
export const findPendingUploadedImage = async (
  tx: NestablePrismaTransaction,
  params: { tenantId: string; userId: string; id: string }
) =>
  await tx.uploadedImage.findFirst({
    where: {
      tenantId: params.tenantId,
      id: params.id,
      userId: params.userId,
      reportId: null,
    },
  });

export const deleteUploadedImages = async (
  tx: NestablePrismaTransaction,
  params: { tenantId: string; ids: string[] }
) => {
  await tx.uploadedImage.deleteMany({
    where: { tenantId: params.tenantId, id: { in: params.ids } },
  });
};

//================= ストレージ操作(tx の外で呼ぶこと)

export const putImageObjects = async (
  id: string,
  processed: ProcessedImage
): Promise<void> => {
  const { storageKey, thumbnailKey } = buildStorageKeys(id);
  await putObject(storageKey, processed.body, OUTPUT_MIME);
  await putObject(thumbnailKey, processed.thumbnail, OUTPUT_MIME);
};

export const removeImageObjects = async (ids: string[]): Promise<void> => {
  const keys = ids.flatMap((id) => {
    const { storageKey, thumbnailKey } = buildStorageKeys(id);
    return [storageKey, thumbnailKey];
  });
  await removeObjects(keys);
};

export const presignThumbnail = async (id: string): Promise<string> =>
  await presignGetObject(buildStorageKeys(id).thumbnailKey);
