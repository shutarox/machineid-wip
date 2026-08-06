import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, setupAdminSession } from '../../_helpers.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

describe('POST /api/private/logout', () => {
  it('logout でセッションが失効する', async () => {
    const { cookies } = await setupAdminSession(app);

    const logout = await app.inject({
      method: 'POST',
      url: '/api/private/logout',
      cookies,
    });
    expect(logout.statusCode).toBe(200);

    const after = await app.inject({
      method: 'GET',
      url: '/api/private/master',
      cookies,
    });
    expect(after.statusCode).toBe(401);
  });
});
