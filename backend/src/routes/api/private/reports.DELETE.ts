import {
  commonErrorsSchema,
  commonRequestHeadersSchema,
} from '@/libs/commonSchemas.js';
import { nestableTransactionWithTenantId } from '@/libs/prisma-connection.js';
import { parseRouteFromFileUrl } from '@/libs/routeTool.js';
import { deleteReport } from '@/models/reports.js';
import { removeImageObjects } from '@/models/uploadedImages.js';
import { requireActor } from '@/models/users.js';
import {
  FastifyPluginAsyncZod,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';

const { method, url, tag } = parseRouteFromFileUrl(import.meta.url);

// 報告書の削除。添付画像も一緒に消える。
// 可視外(MEMBER から見た他人の報告書)は 404。

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

      const imageIds = await nestableTransactionWithTenantId(
        tenantId,
        async (tx) => {
          const actor = await requireActor(tx, { tenantId, userId });
          return await deleteReport(tx, { tenantId, actor, id });
        }
      );

      // S3 は tx の外。DB を消したあとなので、ここが失敗してもオブジェクトが
      // 残るだけで実害はない(S3 のライフサイクルで回収できる)
      await removeImageObjects(imageIds);

      return res.send({ ok: true });
    },
  });
};

export default routes;
