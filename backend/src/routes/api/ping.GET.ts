import * as Config from '@/config.js';
import { nestableTransactionWithTenantId } from '@/libs/prisma-connection.js';

import {
  FastifyPluginAsyncZod,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';

import { parseRouteFromFileUrl } from '@/libs/routeTool.js';

const { method, url, tag } = parseRouteFromFileUrl(import.meta.url);

export const responseSchema = z.object({
  status: z.string(),
  addr: z.string().optional(),
  ua: z.string().optional(),
  deviceId: z.string().optional(),
  sessionId: z.string().optional(),
  tenantId: z.uuid().optional(),
  version: z.string().optional(),
});

const routes: FastifyPluginAsyncZod = async (fastify, _opts) => {
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method,
    url,
    schema: {
      tags: [tag],
      response: {
        200: responseSchema,
      },
    },
    handler: async (req, res) => {
      if (Config.MAINTENANCE_MODE) {
        return res.send({ status: 'maintenance' });
      }

      res.setCookie(
        'ping',
        Math.random().toString(),
        Config.DEFAULT_COOKIE_OPTIONS
      );
      return nestableTransactionWithTenantId('*', async (tx) => {
        // DB 疎通確認
        const result = await tx.tenant.findFirst({});
        if (!result) {
          throw new Error('tenant not found');
        }
        const { deviceId, sessionId, tenantId } = req;
        return res.send({
          status: 'OK',
          addr: req.remoteIp,
          ua: req.headers['user-agent'],
          deviceId,
          sessionId,
          tenantId,
          version: '1.0.1',
        });
      });
    },
  });
};

export default routes;
