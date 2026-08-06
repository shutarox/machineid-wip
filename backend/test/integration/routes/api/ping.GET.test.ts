import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { responseSchema } from '@/routes/api/ping.GET.js';
import { createTenant } from '../../../factories.js';
import { buildTestApp, parseResponse } from '../_helpers.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

describe('GET /api/ping', () => {
  it('200 でステータスとデバイス ID が返る', async () => {
    await createTenant(); // ping は DB 疎通確認でテナント 1 件の存在を要求する
    const res = await app.inject({ method: 'GET', url: '/api/ping' });
    expect(res.statusCode).toBe(200);
    const body = parseResponse(responseSchema, res);
    expect(body.status).toBe('OK');
  });
});
