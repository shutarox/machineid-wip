import * as Config from '@/config.js';
import { ServerError } from '@/libs/appError.js';
import {
  commonErrorsSchema,
  commonRequestHeadersSchema,
} from '@/libs/commonSchemas.js';

import { nestableTransactionWithTenantId } from '@/libs/prisma-connection.js';
import {
  FastifyPluginAsyncZod,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { parseRouteFromFileUrl } from '@/libs/routeTool.js';
import { Role, Prisma } from '@/generated/prisma/client.js';

const { method, url, tag } = parseRouteFromFileUrl(import.meta.url);

const requestSchema = z.object({
  userId: z.uuid(),
});

const responseSchema = z.object({
  user: z.object({
    id: z.uuid(),
    name: z.string(),
    role: z.enum(Role),
  }),
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
      const tenantId = req.tenantId;
      // レスポンスは tx コミット後に返す(セッション書き換えの可視性レース対策)
      const outcome = await nestableTransactionWithTenantId(tenantId, async (tx) => {
        const result = await tx.user.findFirst({
          where: { tenantId, id: req.body.userId },
        });
        if (!result) {
          throw new ServerError('user not found');
        }

        const sessionId = randomUUID();

        const data: Prisma.LoginSessionUncheckedCreateInput = {
          sessionId,
          deviceId: req.deviceId,
          loginIp: req.remoteIp,
          userAgent: req.headers['user-agent'] || '-',
          tenantId,
          userId: result.id,
        };
        await tx.loginSession.upsert({
          where: { tenantId, deviceId: req.deviceId },
          create: data,
          update: data,
        });

        return {
          sessionId,
          reply: {
            user: {
              id: result.id,
              name: result.userName,
              role: result.role,
            },
          },
        };
      });

      res.setCookie('sessionId', outcome.sessionId, Config.SESSION_COOKIE_OPTIONS);
      return res.send(outcome.reply);
    },
  });
};

export default routes;
