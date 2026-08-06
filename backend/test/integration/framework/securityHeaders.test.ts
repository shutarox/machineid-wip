import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, setupAdminSession } from '../routes/_helpers.js';

// セキュリティヘッダのリグレッションテスト。
// アプリ層で付けるのは nosniff だけ(CSP / HSTS は TLS 終端の責務)。
// 判断の経緯は docs/decisions/20260804-security-headers.md

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

describe('セキュリティヘッダ', () => {
  it('正常応答に nosniff が付く', async () => {
    const { cookies } = await setupAdminSession(app);
    const res = await app.inject({
      method: 'GET',
      url: '/api/private/master',
      cookies,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('エラー応答にも nosniff が付く(onSend なのでステータスに依らない)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/private/master',
    });
    expect(res.statusCode).toBe(401);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('存在しないルートにも nosniff が付く', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/no-such-route' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
