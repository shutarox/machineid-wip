import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { responseSchema } from '@/routes/api/private/users.POST.js';
import { createUser } from '../../../../factories.js';
import {
  buildTestApp,
  login,
  parseResponse,
  setupAdminSession,
} from '../../_helpers.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

describe('POST /api/private/users', () => {
  it('作成すると初期パスワードが返り、そのパスワードでログインできる', async () => {
    const { tenant, cookies } = await setupAdminSession(app);

    const res = await app.inject({
      method: 'POST',
      url: '/api/private/users',
      cookies,
      payload: {
        userName: '新規ユーザ',
        loginId: 'created-by-route-test',
        email: '',
        role: 'MEMBER',
      },
    });
    expect(res.statusCode).toBe(200);
    const { initialPassword } = parseResponse(responseSchema, res);
    expect(initialPassword).toHaveLength(12);

    const { res: loginRes } = await login(
      app,
      tenant.tenantCode,
      'created-by-route-test',
      initialPassword
    );
    expect(loginRes.statusCode).toBe(200);
  });

  it('ログインID 重複の作成は 400', async () => {
    const { tenant, cookies } = await setupAdminSession(app);
    const existing = await createUser(tenant.id);

    const res = await app.inject({
      method: 'POST',
      url: '/api/private/users',
      cookies,
      payload: {
        userName: '重複',
        loginId: existing.loginId,
        email: '',
        role: 'MEMBER',
      },
    });
    expect(res.statusCode).toBe(400);
  });
});
