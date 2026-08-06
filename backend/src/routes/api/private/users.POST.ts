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
import { createUser, requireAdmin } from '@/models/users.js';
import { userResponseSchema } from './users.GET.js';

const { method, url, tag } = parseRouteFromFileUrl(import.meta.url);

const requestSchema = z.object({
  userName: z.string().min(1, '名前を入力してください').max(255),
  loginId: z.string().min(1, 'ログインIDを入力してください').max(255),
  email: z.email('メールアドレスの形式が不正です').or(z.literal('')),
  role: z.enum(Role),
});

export const responseSchema = z.object({
  user: userResponseSchema,
  initialPassword: z.string(),
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

      // レスポンスは tx コミット後に返す(作成直後のログイン等の可視性レース対策)
      const result = await nestableTransactionWithTenantId(
        tenantId,
        async (tx) => {
          await requireAdmin(tx, { tenantId, userId });

          const { user, initialPassword } = await createUser(tx, {
            tenantId,
            ...req.body,
          });
          return { user, initialPassword };
        }
      );

      return res.send(result);
    },
  });
};

export default routes;
