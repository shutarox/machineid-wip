import { ServerError } from '@/libs/appError.js';
import {
  commonErrorsSchema,
  commonRequestHeadersSchema,
} from '@/libs/commonSchemas.js';
import { nestableTransactionWithTenantId } from '@/libs/prisma-connection.js';
import { parseRouteFromFileUrl } from '@/libs/routeTool.js';

import {
  FastifyPluginAsyncZod,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';

const { method, url, tag } = parseRouteFromFileUrl(import.meta.url);

const responseSchema = z.object({});

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
    handler: async () => {
      return nestableTransactionWithTenantId('*', async (tx) => {
        await tx.tenant.findFirst({});

        throw new ServerError('test error');
      });
    },
  });
};

export default routes;
