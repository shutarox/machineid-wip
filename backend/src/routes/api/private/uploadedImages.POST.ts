import {
  commonErrorsSchema,
  commonRequestHeadersSchema,
} from '@/libs/commonSchemas.js';
import { ClientError } from '@/libs/appError.js';
import { nestableTransactionWithTenantId } from '@/libs/prisma-connection.js';
import { parseRouteFromFileUrl } from '@/libs/routeTool.js';
import {
  createUploadedImage,
  deleteUploadedImages,
  presignThumbnail,
  processImage,
  putImageObjects,
  UPLOAD_MAX_BYTES,
} from '@/models/uploadedImages.js';
import {
  FastifyPluginAsyncZod,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { v7 as uuidV7 } from 'uuid';
import { z } from 'zod';

const { method, url, tag } = parseRouteFromFileUrl(import.meta.url);

// 画像の仮アップロード。**multipart/form-data で 1 枚**受け取り、
// EXIF を除去した本体とサムネイルを作って S3 に置き、未確定(reportId = null)の
// レコードを作る。報告書に紐づくのは reports.POST の時点(モデルの reportId)。
//
// multipart の body は Zod で検証できないため `schema.body` は書かず、
// `consumes` だけ宣言して req.file() で読む。OpenAPI 上は body なしの
// multipart エンドポイントとして出る(フロントは FormData を直接送る)。

export const uploadedImageResponseSchema = z.object({
  id: z.uuid(),
  width: z.int(),
  height: z.int(),
  byteSize: z.int(),
  /** プレビュー用の期限つき URL */
  thumbnailUrl: z.string(),
});

export const responseSchema = z.object({
  uploadedImage: uploadedImageResponseSchema,
});

const ACCEPTED_MIME_PREFIX = 'image/';

const isFileTooLargeError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === 'FST_REQ_FILE_TOO_LARGE';

const routes: FastifyPluginAsyncZod = async (fastify, _opts) => {
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method,
    url,
    schema: {
      tags: [tag],
      consumes: ['multipart/form-data'],
      querystring: z.object({}),
      headers: commonRequestHeadersSchema,
      response: {
        200: responseSchema,
        ...commonErrorsSchema,
      },
    },
    handler: async (req, res) => {
      const { tenantId, userId } = req;

      const part = await req.file();
      if (!part) {
        throw new ClientError('画像が送信されていません');
      }
      if (!part.mimetype.startsWith(ACCEPTED_MIME_PREFIX)) {
        throw new ClientError('画像ファイルを選択してください');
      }

      // limits.fileSize を超えると toBuffer() が FST_REQ_FILE_TOO_LARGE を投げる。
      // そのままだと FastifyError なので 500 になる — 利用者の入力起因なので 400 に直す
      let input: Buffer;
      try {
        input = await part.toBuffer();
      } catch (error) {
        if (isFileTooLargeError(error)) {
          throw new ClientError(
            `画像は ${Math.floor(UPLOAD_MAX_BYTES / 1024 / 1024)}MB 以下にしてください`
          );
        }
        throw error;
      }

      const processed = await processImage(input);

      // id は通常 Prisma の `@default(uuid(7))` が採番する。ここで JS 側から
      // 採るのは、storageKey / thumbnailKey が **NOT NULL かつ id から決まる**ため。
      // Prisma に任せると「INSERT しないと id が分からない / id が無いと INSERT
      // できない」で詰まるので、id を先に確定させて循環を切る
      //
      // 順序は DB → S3。逆にすると DB が失敗したときにどこからも参照されない
      // オブジェクトが残る(掃除は DB を起点にしている)
      const id = uuidV7();
      const uploadedImage = await nestableTransactionWithTenantId(
        tenantId,
        async (tx) =>
          await createUploadedImage(tx, {
            tenantId,
            userId,
            id,
            processed,
            byteSize: processed.body.length,
          })
      );

      // S3 は tx の外(assertNotInTransaction)。失敗したら DB 側も戻す
      try {
        await putImageObjects(id, processed);
      } catch (error) {
        await nestableTransactionWithTenantId(
          tenantId,
          async (tx) => await deleteUploadedImages(tx, { tenantId, ids: [id] })
        );
        throw error;
      }

      return res.send({
        uploadedImage: {
          id: uploadedImage.id,
          width: uploadedImage.width,
          height: uploadedImage.height,
          byteSize: uploadedImage.byteSize,
          thumbnailUrl: await presignThumbnail(id),
        },
      });
    },
  });
};

export default routes;
