import * as Config from '@/config.js';
import autoload from '@fastify/autoload';
import { fastifyCaching } from '@fastify/caching';
import type { FastifyCookieOptions } from '@fastify/cookie';
import { fastifyCookie } from '@fastify/cookie';
import { fastifyFormbody } from '@fastify/formbody';
import fastifyMultipart from '@fastify/multipart';
import * as Fastify from 'fastify';
import path from 'path';
import * as zlib from 'zlib';

import { cacheCleaner } from '@/plugins/cacheCleaner.js';
import { customSerializerCompiler } from '@/plugins/customSerializerCompiler.js';
import { validatorCompiler } from 'fastify-type-provider-zod';
import { handleDeviceIdCookie } from '@/plugins/handleDeviceIdCookie.js';
import { logger } from '@/plugins/logger.js';
import { sessionRetrieve } from '@/plugins/sessionRetrieve.js';

import { appErrorHandler } from '@/plugins/appErrorHandler.js';
import { corsSettings } from '@/plugins/cors-settings.js';
import { remoteIpSetter } from '@/plugins/remote-ip.js';
import { swagger } from '@/plugins/swagger.js';
import { UPLOAD_MAX_BYTES } from '@/models/uploadedImages.js';

const __dirname = import.meta.dirname;

// アプリケーション(fastify インスタンス)の構築。
// listen はしない: 起動は index.ts、テストは fastify.inject から使う

export const buildApp = (): Fastify.FastifyInstance => {
  const fastify = Fastify.fastify({
    logger: false,
  });

  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(customSerializerCompiler);

  // MIME sniffing の抑止。アプリ層で完結し害がないヘッダはここで付ける。
  // CSP / HSTS のように「SPA を配信するホスト」でこそ効くものは
  // TLS 終端(CloudFront / ALB)の責務とする(ADR 20260804-security-headers.md)
  fastify.addHook('onSend', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
  });

  // ALB 経由でくると、remoteAddress が ALB の IP になるので
  fastify.register(remoteIpSetter);
  fastify.register(appErrorHandler);

  fastify.register(logger);
  fastify.register(cacheCleaner);

  // 条件は index.ts の generateOpenApiSchema と必ず揃えること(生成が
  // fastify.swagger() に依存しているため)。開発環境以外では swagger UI を
  // 公開せず、OpenAPI 型の生成も行わない
  if (process.env.NODE_ENV === 'development') {
    fastify.register(swagger);
  }

  fastify.register(fastifyCookie, {
    secret: Config.COOKIE_SECRET, // for cookies signature
    // parseOptions: {}, // options for parsing cookies
  } as FastifyCookieOptions);

  fastify.register(fastifyFormbody);
  // 画像アップロード用。Zod は multipart の body を検証できないので、
  // ルート側は schema.body を書かず req.file() で読む(uploadedImages.POST.ts 参照)
  fastify.register(fastifyMultipart, {
    limits: {
      fileSize: UPLOAD_MAX_BYTES,
      files: 1, // 1 リクエスト 1 枚。複数枚はクライアントが繰り返し呼ぶ
    },
  });

  // gzip 圧縮を行う（@fastify/compress は不安定なので使わない）
  fastify.addHook('onSend', async (request, reply, payload) => {
    const acceptEncoding = request.headers['accept-encoding'] || '';
    if (
      acceptEncoding.includes('gzip') &&
      typeof payload === 'string' &&
      payload.length > 4096
    ) {
      const compressed = zlib.gzipSync(payload);
      reply.header('content-encoding', 'gzip');
      return compressed;
    }
    return payload;
  });

  fastify.register(autoload, {
    dir: path.join(__dirname, 'routes'),
    ignorePattern: Config.ENABLE_DEBUG_MODE ? undefined : /debug/,
  });

  fastify.register(corsSettings);
  fastify.register(fastifyCaching, { privacy: fastifyCaching.privacy.NOCACHE });

  // アクセスデバイスに deviceId を発行する (req.deviceId に値をセットする)
  fastify.register(handleDeviceIdCookie);
  // セッションを復元する (req.sessionId と req.tenantId に値をセットする)
  fastify.register(sessionRetrieve);

  return fastify;
};
