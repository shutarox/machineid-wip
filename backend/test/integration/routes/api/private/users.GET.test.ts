import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { responseSchema } from '@/routes/api/private/users.GET.js';
import { createUser } from '../../../../factories.js';
import {
  buildTestApp,
  parseResponse,
  setupAdminSession,
  setupMemberSession,
} from '../../_helpers.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

describe('GET /api/private/users', () => {
  it('セッションなしは 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/private/users?page=1&perPage=1',
    });
    expect(res.statusCode).toBe(401);
  });

  it('MEMBER は 403', async () => {
    const { cookies } = await setupMemberSession(app);

    const res = await app.inject({
      method: 'GET',
      url: '/api/private/users?page=1&perPage=1',
      cookies,
    });
    expect(res.statusCode).toBe(403);
  });

  it('一覧はページネーションと検索が効く', async () => {
    const { tenant, cookies } = await setupAdminSession(app);
    await createUser(tenant.id, { userName: '検索対象ユーザ' });
    await createUser(tenant.id);

    const res = await app.inject({
      method: 'GET',
      url: '/api/private/users?page=1&perPage=2',
      cookies,
    });
    expect(res.statusCode).toBe(200);
    const body = parseResponse(responseSchema, res);
    expect(body.users).toHaveLength(2);
    expect(body.total).toBe(3);

    const searched = await app.inject({
      method: 'GET',
      url: `/api/private/users?page=1&perPage=10&search=${encodeURIComponent('検索対象')}`,
      cookies,
    });
    const searchedBody = parseResponse(responseSchema, searched);
    expect(searchedBody.users).toHaveLength(1);
    expect(searchedBody.users[0]!.userName).toBe('検索対象ユーザ');
  });
});
