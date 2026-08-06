import {
  commonErrorsSchema,
  commonRequestHeadersSchema,
} from '@/libs/commonSchemas.js';
import { nestableTransactionWithTenantId } from '@/libs/prisma-connection.js';
import { parseRouteFromFileUrl } from '@/libs/routeTool.js';
import { createReport } from '@/models/reports.js';
import {
  MAX_IMAGES_PER_REPORT,
  presignThumbnail,
} from '@/models/uploadedImages.js';
import {
  FastifyPluginAsyncZod,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';

import { reportResponseSchema } from './reports.GET.js';

const { method, url, tag } = parseRouteFromFileUrl(import.meta.url);

// 報告書の作成。**画像 1 枚以上が必須**で、指定された仮アップロード画像を
// この時点で確定させる(reportId を入れる)。

const requestSchema = z.object({
  title: z.string().min(1, 'タイトルを入力してください').max(255),
  comment: z.string().min(1, '本文を入力してください'),
  imageIds: z
    .array(z.uuid())
    .min(1, '画像を 1 枚以上添付してください')
    .max(MAX_IMAGES_PER_REPORT, `画像は ${MAX_IMAGES_PER_REPORT} 枚までです`),
});

export const responseSchema = z.object({
  report: reportResponseSchema,
});

const routes: FastifyPluginAsyncZod = async (fastify, _opts) => {
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method,
    url,
    schema: {
      tags: [tag],
      querystring: z.object({}),
      headers: commonRequestHeadersSchema,
      body: requestSchema,
      response: {
        200: responseSchema,
        ...commonErrorsSchema,
      },
    },
    handler: async (req, res) => {
      const { tenantId, userId } = req;
      const { title, comment, imageIds } = req.body;

      // レスポンスは tx コミット後に返す(作成直後の一覧取得との可視性レース対策)
      const report = await nestableTransactionWithTenantId(
        tenantId,
        async (tx) =>
          await createReport(tx, {
            tenantId,
            userId,
            title,
            comment,
            imageIds,
          })
      );

      return res.send({
        report: {
          id: report.id,
          title: report.title,
          comment: report.comment,
          userId: report.userId,
          userName: report.user.userName,
          createdAt: report.createdAt,
          images: await Promise.all(
            report.uploadedImages.map(async (image) => ({
              id: image.id,
              width: image.width,
              height: image.height,
              thumbnailUrl: await presignThumbnail(image.id),
            }))
          ),
        },
      });
    },
  });
};

export default routes;
