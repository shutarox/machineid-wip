import * as Fastify from 'fastify';
import fastifyPlugin from 'fastify-plugin';

import { clearCache } from '@/models/caches.js';

export const cacheCleaner = fastifyPlugin(
  async (fastify: Fastify.FastifyInstance) => {
    fastify.addHook('onResponse', (request, reply, done) => {
      clearCache(request.id);
      done();
    });
    fastify.addHook('onError', (request, reply, error, done) => {
      clearCache(request.id);
      done();
    });
  }
);
