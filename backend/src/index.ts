import { buildApp } from '@/app.js';
import { generateOpenApiSchema } from '@/libs/generateOpenApiSchema.js';

// 起動時 assert: 日時処理(@db.Date 正規化・JST シリアライズ)は
// プロセスが JST で動作している前提のため、TZ を起動時に検証する
if (new Date().getTimezoneOffset() !== -540) {
  throw new Error(
    `TZ が Asia/Tokyo ではありません (TZ=${process.env.TZ ?? '(未設定)'})。日時処理の前提が崩れるため起動を中止します`
  );
}

const fastify = buildApp();

fastify.server.setTimeout(10000); // 10s
fastify.server.keepAliveTimeout = 10000; // keep-aliveタイムアウトを設定
fastify.server.headersTimeout = 11000; // ヘッダータイムアウトを設定

fastify.ready(async (err) => {
  if (err) {
    fastify.log.error(err);
    throw err;
  }

  // openapi.yaml の生成をバイパスして、openapi-schema.d.ts を生成する
  // https://openapi-ts.dev/node
  // しかし、型情報がないので @types/openapi-typescript.d.ts を作って強引に処理している

  // 条件は app.ts の swagger プラグイン登録と必ず揃えること。
  // 生成は fastify.swagger() に依存しており、片方だけ有効だと
  // `fastify.swagger is not a function` で落ちる(CI のように NODE_ENV
  // 未設定の環境で実際に起きていた)
  if (process.env.NODE_ENV === 'development') {
    generateOpenApiSchema(fastify).catch((e) => {
      console.error('OpenAPI schema generation failed:', e);
    });
  }

  console.log('listen...');
  await fastify.listen({
    host: '0.0.0.0',
    port: Number(process.env.BACKEND_PORT ?? 8080),
  });
});
