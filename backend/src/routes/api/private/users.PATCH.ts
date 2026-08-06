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
import { requireAdmin, updateUser } from '@/models/users.js';
import { userResponseSchema } from './users.GET.js';

const { method, url, tag } = parseRouteFromFileUrl(import.meta.url);

const requestSchema = z.object({
  id: z.uuid(),
  userName: z.string().min(1).max(255).optional(),
  email: z
    .email('メールアドレスの形式が不正です')
    .or(z.literal(''))
    .optional(),
  role: z.enum(Role).optional(),
  isDisabled: z.boolean().optional(),
});

export const responseSchema = z.object({
  user: userResponseSchema,
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
      const { id, ...patch } = req.body;

      // レスポンスは tx コミット後に返す(更新直後の参照の可視性レース対策)
      const user = await nestableTransactionWithTenantId(tenantId, async (tx) => {
        await requireAdmin(tx, { tenantId, userId });

        return updateUser(tx, {
          tenantId,
          actorId: userId,
          targetId: id,
          patch,
        });
      });

      return res.send({ user });
    },
  });
};

export default routes;
