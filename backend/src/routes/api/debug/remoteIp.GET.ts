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

const { method, url, tag } = parseRouteFromFileUrl(import.meta.url);

const requestSchema = z.object({
  dummyDataLength: z
    .number()
    .max(10 * 1024 * 1024)
    .default(0),
});

const responseSchema = z.object({
  remoteIp: z.string(),
  xForwardedFor: z.string(),
  dummyData: z.string(),
});

// 1MB のランダム文字列を生成

function generateRandomString(length: number): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}
const randomString = generateRandomString(1 * 1024 * 1024);

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
      return res.send({
        remoteIp: req.remoteIp,
        xForwardedFor: req.headers['x-forwarded-for'] ?? '',
        dummyData: randomString.substring(0, req.query.dummyDataLength),
      });
    },
  });
};

export default routes;
