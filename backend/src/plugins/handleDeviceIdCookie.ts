import * as Config from '@/config.js';
import * as Fastify from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { randomUUID } from 'node:crypto';

// 初回コールしてきた端末に deviceId を発行する

declare module 'fastify' {
  interface FastifyRequest {
    deviceId: string;
  }
}
export const handleDeviceIdCookie = fastifyPlugin(
  async (fastify: Fastify.FastifyInstance) => {
    if (!fastify.hasRequestDecorator('deviceId')) {
      fastify.decorateRequest('deviceId', '');
    }

    fastify.addHook('preValidation', async (request, reply) => {
      // 有効な deviceId があればそれを使う

      if (request.cookies.deviceId) {
        const result = fastify.unsignCookie(request.cookies.deviceId);
        if (!result.valid) {
          Object.keys(request.cookies).forEach((key) => {
            reply.clearCookie(key, Config.DEFAULT_COOKIE_OPTIONS);
          });
          reply.code(401).send({
            message: 'Cookie が無効になりました',
            actions: ['forceLogout'],
          });
          return;
        }
        if (result.value) {
          request.deviceId = result.value;
        }
      }

      // なかったら生成してセットする

      if (!request.deviceId) {
        request.deviceId = randomUUID();
        reply.setCookie(
          'deviceId',
          request.deviceId,
          Config.DEFAULT_COOKIE_OPTIONS
        );
      }
    });
  }
);
