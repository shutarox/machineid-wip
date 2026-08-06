import { zDateOut } from '@/libs/zDate.js';
import {
  FastifyPluginAsyncZod,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';

import { parseRouteFromFileUrl } from '@/libs/routeTool.js';

const { method, url, tag } = parseRouteFromFileUrl(import.meta.url);

/*
curl -sX GET http://localhost:8080/api/debug/wait?sleep=3000 | jq

ab -n 5000 -c 100 http://localhost:8080/api/debug/wait?sleep=1000
// */

const querySchema = z.object({
  sleep: z.coerce.number().int().positive().default(1000),
});

const responseSchema = z.object({
  waited: z.number().int().positive(),
  now: zDateOut(),
});

const routes: FastifyPluginAsyncZod = async function (fastify, _opts) {
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method,
    url,
    schema: {
      tags: [tag],
      //querystring: querySchema,
      querystring: querySchema,
      response: {
        200: responseSchema,
      },
    },
    handler: async (req, res) => {
      // req.wait ミリ秒待つ
      await new Promise((resolve) => setTimeout(resolve, req.query.sleep));
      return res.send({
        waited: req.query.sleep,
        now: new Date(),
      });
    },
  });
};

export default routes;
