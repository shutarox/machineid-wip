import { ValidationError } from '@/libs/appError.js';
import {
  commonErrorsSchema,
  commonRequestHeadersSchema,
} from '@/libs/commonSchemas.js';

import { nestableTransactionWithTenantId } from '@/libs/prisma-connection.js';
import {
  FastifyPluginAsyncZod,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';

import { parseRouteFromFileUrl } from '@/libs/routeTool.js';
import { debugParamsSchema } from '@/models/debugParams.js';

const { method, url, tag } = parseRouteFromFileUrl(import.meta.url);

const requestSchema = debugParamsSchema;

const responseSchema = z.object({});

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
      const { tenantId } = req;
      await nestableTransactionWithTenantId(tenantId, async (tx) => {
        let { virtualDate } = req.body;

        // virtualDate の値チェック

        {
          virtualDate = virtualDate
            .replace(/\//g, '-')
            .replace(/^\s+/, '')
            .replace(/\s+$/, '');

          if (virtualDate !== '') {
            if (!virtualDate.match(/ \d{1,2}:\d{2}$/)) {
              virtualDate += ' 0:00';
            }
            const matches = virtualDate.match(
              /^(\d{4})-(\d{1,2})-(\d{1,2}) (\d{1,2}):(\d{2})$/
            );
            if (!matches) {
              throw new ValidationError(
                `日付フォーマットが不正です: '${virtualDate}'`
              );
            }
            const [_, year, month, day, hour, minute] = matches;
            virtualDate = `${year}-${`0${month}`.slice(-2)}-${`0${day}`.slice(
              -2
            )} ${`0${hour}`.slice(-2)}:${`0${minute}`.slice(-2)}`;
          }
        }

        // デバッグパラメータの更新

        await tx.debugParameter.deleteMany({
          where: { tenantId },
        });

        await tx.debugParameter.create({
          data: {
            tenantId,
            name: 'virtualDate',
            value: virtualDate,
          },
        });
      });
      // レスポンスは tx コミット後に返す(直後の再取得の可視性レース対策)
      return res.send({});
    },
  });
};

export default routes;
