import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { responseSchema } from '@/routes/api/private/master.GET.js';
import { buildTestApp, parseResponse, setupMemberSession } from '../../_helpers.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

describe('GET /api/private/master', () => {
  it('ログイン済みなら tenantConfig が返る', async () => {
    const { cookies } = await setupMemberSession(app);

    const res = await app.inject({
      method: 'GET',
      url: '/api/private/master',
      cookies,
    });
    expect(res.statusCode).toBe(200);
    const body = parseResponse(responseSchema, res);
    expect(body.tenantConfig).toBeDefined();
  });
});
