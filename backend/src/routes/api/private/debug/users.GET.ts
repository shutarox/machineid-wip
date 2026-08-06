import {
  commonErrorsSchema,
  commonRequestHeadersSchema,
} from '@/libs/commonSchemas.js';
import { nestableTransactionWithTenantId } from '@/libs/prisma-connection.js';
import {
  FastifyPluginAsyncZod,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { Role } from '@/generated/prisma/client.js';
import { z } from 'zod';

import { parseRouteFromFileUrl } from '@/libs/routeTool.js';

const { method, url, tag } = parseRouteFromFileUrl(import.meta.url);

// debug のユーザ切替用の簡易一覧(権限チェックなし。debug 系 UI からのみ使用)

const responseSchema = z.object({
  users: z.array(
    z.object({
      id: z.uuid(),
      userName: z.string(),
      loginId: z.string(),
      role: z.enum(Role),
      isDisabled: z.boolean(),
    })
  ),
});

const routes: FastifyPluginAsyncZod = async (fastify, _opts) => {
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method,
    url,
    schema: {
      tags: [tag],
      headers: commonRequestHeadersSchema,
      querystring: z.object({}),
      response: {
        200: responseSchema,
        ...commonErrorsSchema,
      },
    },
    handler: async (req, res) => {
      const { tenantId } = req;

      return nestableTransactionWithTenantId(tenantId, async (tx) => {
        const users = await tx.user.findMany({
          select: {
            id: true,
            userName: true,
            loginId: true,
            role: true,
            isDisabled: true,
          },
          where: { tenantId },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        return res.send({ users });
      });
    },
  });
};

export default routes;
