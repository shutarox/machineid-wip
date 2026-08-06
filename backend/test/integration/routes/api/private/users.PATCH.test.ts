import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { responseSchema } from '@/routes/api/private/users.PATCH.js';
import { createUser } from '../../../../factories.js';
import { buildTestApp, parseResponse, setupAdminSession } from '../../_helpers.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

describe('PATCH /api/private/users', () => {
  it('自身のロール変更・無効化は 400', async () => {
    const { admin, cookies } = await setupAdminSession(app);

    const selfRole = await app.inject({
      method: 'PATCH',
      url: '/api/private/users',
      cookies,
      payload: { id: admin.id, role: 'MEMBER' },
    });
    expect(selfRole.statusCode).toBe(400);

    const selfDisable = await app.inject({
      method: 'PATCH',
      url: '/api/private/users',
      cookies,
      payload: { id: admin.id, isDisabled: true },
    });
    expect(selfDisable.statusCode).toBe(400);
  });

  it('他人のロール変更・無効化は適用できる', async () => {
    const { tenant, cookies } = await setupAdminSession(app);
    const other = await createUser(tenant.id);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/private/users',
      cookies,
      payload: { id: other.id, role: 'ADMIN', isDisabled: true },
    });
    expect(res.statusCode).toBe(200);
    const body = parseResponse(responseSchema, res);
    expect(body.user).toMatchObject({
      role: 'ADMIN',
      isDisabled: true,
    });
  });

  it('存在しないユーザは 404', async () => {
    const { cookies } = await setupAdminSession(app);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/private/users',
      cookies,
      // 形式は正しいが存在しない UUID。DB まで届いたうえで「見つからない」を返す経路
      payload: { id: '019fd06a-0000-7000-8000-000000000000', userName: 'x' },
    });
    expect(res.statusCode).toBe(404);
  });

  // id カラムはネイティブの uuid 型なので、形式の不正は DB に届く前に弾く必要がある。
  // 素通しすると PostgreSQL の `invalid input syntax for type uuid` で 500 になる
  it('id が UUID 形式でなければ 400(500 にしない)', async () => {
    const { cookies } = await setupAdminSession(app);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/private/users',
      cookies,
      payload: { id: 'no-such-user', userName: 'x' },
    });
    expect(res.statusCode).toBe(400);
  });
});
