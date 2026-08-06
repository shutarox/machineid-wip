import { ClientError } from '@/libs/appError.js';
import {
  commonErrorsSchema,
  commonRequestHeadersSchema,
} from '@/libs/commonSchemas.js';
import { nestableTransactionWithTenantId } from '@/libs/prisma-connection.js';
import { parseRouteFromFileUrl } from '@/libs/routeTool.js';
import {
  deleteUploadedImages,
  findPendingUploadedImage,
  removeImageObjects,
} from '@/models/uploadedImages.js';
import {
  FastifyPluginAsyncZod,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';

const { method, url, tag } = parseRouteFromFileUrl(import.meta.url);

// プレビュー中の画像の取り消し。**未確定(reportId = null)で自分のものだけ**消せる。
// 確定済みの画像を消すのは reports.DELETE の役目。
//
// パスパラメータが使えないので、対象の指定は querystring の id。

const requestSchema = z.object({
  id: z.uuid(),
});

export const responseSchema = z.object({
  ok: z.literal(true),
});

const routes: FastifyPluginAsyncZod = async (fastify, _opts) => {
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method,
    url,
    schema: {
      tags: [tag],
      querystring: requestSchema,
      headers: commonRequestHeadersSchema,
      response: {
        200: responseSchema,
        ...commonErrorsSchema,
      },
    },
    handler: async (req, res) => {
      const { tenantId, userId } = req;
      const { id } = req.query;

      await nestableTransactionWithTenantId(tenantId, async (tx) => {
        // 見えない画像(他人のもの・確定済み・存在しない)は一律 404。
        // 403 だと「その id は存在する」ことが漏れる
        const target = await findPendingUploadedImage(tx, {
          tenantId,
          userId,
          id,
        });
        if (!target) {
          throw new ClientError('画像が見つかりません', 404);
        }

        await deleteUploadedImages(tx, { tenantId, ids: [id] });
      });

      // S3 は tx の外。DB を消したあとに消すので、ここが失敗しても
      // オブジェクトが残るだけ(実害はなく、S3 のライフサイクルで回収できる)
      await removeImageObjects([id]);

      return res.send({ ok: true });
    },
  });
};

export default routes;
