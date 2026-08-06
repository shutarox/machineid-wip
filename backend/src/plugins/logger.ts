import * as Config from '@/config.js';
import * as Fastify from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { randomUUID } from 'node:crypto';

declare module 'fastify' {
  interface FastifyRequest {
    requestIdForLogging: string;
    startTime: number;
  }
}

export const logger = fastifyPlugin(
  async (fastify: Fastify.FastifyInstance) => {
    if (!fastify.hasRequestDecorator('startTime')) {
      fastify.decorateRequest('startTime', 0);
    }
    if (!fastify.hasRequestDecorator('requestId')) {
      fastify.decorateRequest('requestId', '');
    }

    fastify.addHook('onRequest', async (request) => {
      request.requestIdForLogging = randomUUID();
      request.startTime = Date.now();
    });

    fastify.addHook('onResponse', async (request, reply) => {
      const responseTime = Date.now() - request.startTime;
      outputLog(request, reply, 'response', {
        responseTime,
      });
    });
  }
);

//--------------------------------------------------------------------------

export const outputLog = (
  request: Fastify.FastifyRequest,
  reply: Fastify.FastifyReply,
  type: 'response' | 'audit' | 'error',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info: Record<string, any> | undefined = undefined
) => {
  if (request.method === 'OPTIONS') return;

  // ping は ALB からのログが大量になるので出力しない
  const api = `${request.method} ${request.url.replace(/\?.*$/, '')}`;
  if (api === 'GET /api/ping') return;

  const log = {
    timestamp: new Date(),
    type,
    api,
    remoteIp: request.remoteIp,
    serverVersion: Config.SERVER_VERSION,
    clientVersion: request.headers['x-client-version'],
    requestId: request.requestIdForLogging,
    deviceId: request.deviceId,
    tenantId: request.tenantId,
    userId: request.userId,
    statusCode: reply.statusCode,
    userAgent: request.headers['user-agent'],
    params: request.method === 'GET' ? request.query : request.body,
    info,
  };

  // log を再帰的に変換

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processLog = (obj: Record<string, any>) => {
    if (obj && typeof obj === 'object') {
      for (const key in obj) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const value = obj[key];

        // Date を JST 時刻に変換

        if (value instanceof Date) {
          const jstTime = value.toLocaleString('sv-SE', {
            timeZone: 'Asia/Tokyo',
          });
          const ms = value.getMilliseconds().toString().padStart(3, '0');
          obj[key] = `${jstTime.replace(' ', 'T')}.${ms}+09:00`;
        }

        // 再起処理

        if (value && typeof value === 'object') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          processLog(value as Record<string, any>);
        }

        // マスク処理

        if (key.match(/password/i) && typeof value === 'string') {
          obj[key] = value.replace(/./g, '*');
        }
      }
    }
  };
  processLog(log);

  try {
    console.log(JSON.stringify(log));
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_error) {
    delete log.info;
    console.log(JSON.stringify(log));
  }
};
