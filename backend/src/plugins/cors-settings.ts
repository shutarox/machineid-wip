import * as Config from '@/config.js';
import { ValidationError } from '@/libs/appError.js';
import fastifyCors from '@fastify/cors';
import * as Fastify from 'fastify';
import fastifyPlugin from 'fastify-plugin';

import { commonRequestHeadersKeys } from '@/libs/commonSchemas.js';

export const corsSettings = fastifyPlugin(
  async (fastify: Fastify.FastifyInstance) => {
    fastify.register(fastifyCors, {
      origin: (origin, cb) => {
        if (origin) {
          const hostname = new URL(origin).hostname;
          if (hostname === 'localhost') {
            cb(null, true);
            return;
          }
          if (hostname === new URL(Config.SPA_APP_BASE_URL).hostname) {
            cb(null, true);
            return;
          } else {
            cb(new ValidationError('Not allowed'), false);
            return;
          }
        }
        // origin がない場合は許可
        cb(null, true);
        return;
        /*
        // Generate an error on other origins, disabling access
        cb(new ValidationError('Not allowed'), false);
        */
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        ...commonRequestHeadersKeys,
      ],
    });
  }
);
