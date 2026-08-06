import * as Fastify from 'fastify';
import fastifyPlugin from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyRequest {
    remoteIp: string;
  }
}

export const remoteIpSetter = fastifyPlugin(
  async (fastify: Fastify.FastifyInstance) => {
    if (!fastify.hasRequestDecorator('remoteIp')) {
      fastify.decorateRequest('remoteIp', '');
    }

    fastify.addHook('onRequest', (request, reply, done) => {
      const xForwardedFor = request.headers['x-forwarded-for'];
      if (!xForwardedFor) {
        request.remoteIp = request.ip;
        done();
        return;
      }
      // ALB の後ろにいる前提で、ALB に最終接続してきたクライアントの IP アドレスを取得する
      const forwardedString = Array.isArray(xForwardedFor)
        ? xForwardedFor.join(',')
        : xForwardedFor;
      const ips = forwardedString.split(',');
      request.remoteIp = ips[ips.length - 1] ?? request.ip;
      done();
    });
  }
);
