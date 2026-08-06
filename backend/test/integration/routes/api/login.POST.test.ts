import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { responseSchema } from '@/routes/api/login.POST.js';
import { createTenant, createUser } from '../../../factories.js';
import { PASSWORD, buildTestApp, login, parseResponse } from '../_helpers.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

describe('POST /api/login', () => {
  it('正しい認証情報でログインでき、セッションクッキーが発行される', async () => {
    const tenant = await createTenant();
    const user = await createUser(tenant.id, {
      role: 'ADMIN',
      password: PASSWORD,
    });

    const { res, cookies } = await login(
      app,
      tenant.tenantCode,
      user.loginId,
      PASSWORD
    );
    expect(res.statusCode).toBe(200);
    const body = parseResponse(responseSchema, res);
    expect(body.tenant.id).toBe(tenant.id);
    expect(body.user).toMatchObject({ id: user.id, role: 'ADMIN' });
    expect(cookies).toHaveProperty('sessionId');
  });

  it('誤ったパスワードは 401', async () => {
    const tenant = await createTenant();
    const user = await createUser(tenant.id, { password: PASSWORD });

    const { res } = await login(app, tenant.tenantCode, user.loginId, 'wrong');
    expect(res.statusCode).toBe(401);
  });

  it('存在しない施設IDは 401', async () => {
    const { res } = await login(app, 'no-such-tenant', 'someone', PASSWORD);
    expect(res.statusCode).toBe(401);
  });

  it('無効化されたユーザは 401', async () => {
    const tenant = await createTenant();
    const user = await createUser(tenant.id, {
      password: PASSWORD,
      isDisabled: true,
    });

    const { res } = await login(app, tenant.tenantCode, user.loginId, PASSWORD);
    expect(res.statusCode).toBe(401);
  });
});
