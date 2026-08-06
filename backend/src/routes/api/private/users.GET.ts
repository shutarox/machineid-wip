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
import { zDateOut } from '@/libs/zDate.js';
import { listUsers, requireAdmin } from '@/models/users.js';

const { method, url, tag } = parseRouteFromFileUrl(import.meta.url);

const requestSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

export const userResponseSchema = z.object({
  id: z.uuid(),
  userName: z.string(),
  loginId: z.string(),
  email: z.string(),
  role: z.enum(Role),
  isDisabled: z.boolean(),
  createdAt: zDateOut(),
  lastLoginAt: zDateOut().nullable(),
});

export const responseSchema = z.object({
  users: z.array(userResponseSchema),
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
      const { page, perPage, search } = req.query;

      return nestableTransactionWithTenantId(tenantId, async (tx) => {
        await requireAdmin(tx, { tenantId, userId });

        const { users, total } = await listUsers(tx, {
          tenantId,
          page,
          perPage,
          search,
        });

        return res.send({ users, total });
      });
    },
  });
};

export default routes;
