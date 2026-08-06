import * as Config from '@/config.js';
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

const { method, url, tag } = parseRouteFromFileUrl(import.meta.url);

export const responseSchema = z.object({});

const routes: FastifyPluginAsyncZod = async (fastify, _opts) => {
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method,
    url,
    schema: {
      tags: [tag],
      headers: commonRequestHeadersSchema,
      response: {
        200: responseSchema,
        ...commonErrorsSchema,
      },
    },
    handler: async (req, res) => {
      const tenantId = req.tenantId;

      // レスポンスは tx コミット後に返す(コミット前に send すると、クライアントの
      // 次のリクエストで削除前のセッションが見えるレースがある)
      await nestableTransactionWithTenantId(tenantId, async (tx) => {
        await tx.loginSession.delete({
          where: { tenantId, deviceId: req.deviceId, sessionId: req.sessionId },
        });
      });
      res.clearCookie('sessionId', Config.SESSION_COOKIE_OPTIONS);
      return res.send({});
    },
  });
};

export default routes;
