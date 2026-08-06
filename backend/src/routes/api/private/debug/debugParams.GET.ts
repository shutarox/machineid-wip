import {
  commonErrorsSchema,
  commonRequestHeadersSchema,
} from '@/libs/commonSchemas.js';

import {
  FastifyPluginAsyncZod,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';

import { parseRouteFromFileUrl } from '@/libs/routeTool.js';

import { debugParamsSchema, getDebugParams } from '@/models/debugParams.js';

const { method, url, tag } = parseRouteFromFileUrl(import.meta.url);

const requestSchema = z.object({});

const responseSchema = debugParamsSchema;

const routes: FastifyPluginAsyncZod = async (fastify, _opts) => {
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method,
    url,
    schema: {
      tags: [tag],
      querystring: requestSchema,
      headers: commonRequestHeadersSchema,
      response: {
        200: responseSchema,
        ...commonErrorsSchema,
      },
    },
    handler: async (req, res) => {
      const { tenantId, id: requestId } = req;
      const debugParams = await getDebugParams({
        tenantId,
        requestId,
      });
      return res.send(debugParams);
    },
  });
};

export default routes;
