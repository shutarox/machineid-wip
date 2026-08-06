import {
  commonErrorsSchema,
  commonRequestHeadersSchema,
} from '@/libs/commonSchemas.js';
import { nestableTransactionWithTenantId } from '@/libs/prisma-connection.js';
import { parseRouteFromFileUrl } from '@/libs/routeTool.js';
import { zDateOut } from '@/libs/zDate.js';
import { listReports } from '@/models/reports.js';
import { presignThumbnail } from '@/models/uploadedImages.js';
import { requireActor } from '@/models/users.js';
import {
  FastifyPluginAsyncZod,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';

const { method, url, tag } = parseRouteFromFileUrl(import.meta.url);

// 報告書の一覧。**ロールで見える行が変わる**リソースの参照実装。
// 分岐は route ではなく models/reports.ts の where ビルダーにある。

const requestSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

export const reportImageResponseSchema = z.object({
  id: z.uuid(),
  width: z.int(),
  height: z.int(),
  /** 期限つきの取得 URL。毎回発行するのでレスポンスをキャッシュしない */
  thumbnailUrl: z.string(),
});

export const reportResponseSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  comment: z.string(),
  userId: z.uuid(),
  userName: z.string(),
  createdAt: zDateOut(),
  images: z.array(reportImageResponseSchema),
});

export const responseSchema = z.object({
  reports: z.array(reportResponseSchema),
  total: z.number().int(),
});

const routes: FastifyPluginAsyncZod = async (fastify, _opts) => {
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method,
    url,
    schema: {
      tags: [tag],
      headers: commonRequestHeadersSchema,
      querystring: requestSchema,
      response: {
        200: responseSchema,
        ...commonErrorsSchema,
      },
    },
    handler: async (req, res) => {
      const { tenantId, userId } = req;
      const { page, perPage } = req.query;

      const { reports, total } = await nestableTransactionWithTenantId(
        tenantId,
        async (tx) => {
          const actor = await requireActor(tx, { tenantId, userId });
          return await listReports(tx, {
            tenantId,
            actor,
            page,
            perPage,
          });
        }
      );

      // presigned URL の発行は tx の外(assertNotInTransaction)。
      // 署名は AWS SDK 内で完結しネットワークには出ないが、tx を外部 I/O で
      // 汚さない一貫性のためにガードの対象にしている
      const withUrls = await Promise.all(
        reports.map(async (report) => ({
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
        }))
      );

      return res.send({ reports: withUrls, total });
    },
  });
};

export default routes;
