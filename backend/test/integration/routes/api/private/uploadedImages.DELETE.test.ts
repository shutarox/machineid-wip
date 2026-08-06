import { nestableTransactionWithTenantId } from '@/libs/prisma-connection.js';
import { setStorageForTesting } from '@/libs/storage.js';
import { buildStorageKeys } from '@/models/uploadedImages.js';
import { responseSchema } from '@/routes/api/private/uploadedImages.DELETE.js';
import type { FastifyInstance } from 'fastify';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { createMemoryStorage, type MemoryStorage } from '../../../../fakes.js';
import { createReport, createUser } from '../../../../factories.js';
import {
  buildTestApp,
  login,
  parseResponse,
  PASSWORD,
  setupMemberSession,
  uploadTestImage,
} from '../../_helpers.js';

let app: FastifyInstance;
let storage: MemoryStorage;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  storage = createMemoryStorage();
  setStorageForTesting(storage);
});

afterEach(() => {
  setStorageForTesting(null);
});

const remove = async (cookies: Record<string, string>, id: string) =>
  await app.inject({
    method: 'DELETE',
    url: '/api/private/uploadedImages',
    cookies,
    query: { id },
  });

describe('DELETE /api/private/uploadedImages', () => {
  it('自分の未確定画像は DB からも S3 からも消える', async () => {
    const { tenant, cookies } = await setupMemberSession(app);
    const id = await uploadTestImage(app, cookies);
    expect(storage.objects.size).toBe(2);

    const res = await remove(cookies, id);
    expect(res.statusCode).toBe(200);
    expect(parseResponse(responseSchema, res).ok).toBe(true);

    expect(storage.objects.size).toBe(0);
    const row = await nestableTransactionWithTenantId(tenant.id, async (tx) =>
      tx.uploadedImage.findFirst({ where: { tenantId: tenant.id, id } })
    );
    expect(row).toBeNull();
  });

  it('他人の画像は 404 で、消えない', async () => {
    const { tenant, cookies } = await setupMemberSession(app);
    const id = await uploadTestImage(app, cookies);

    // 同じテナントの別メンバー
    const other = await createUser(tenant.id, {
      role: 'MEMBER',
      password: PASSWORD,
    });
    const { cookies: otherCookies } = await login(
      app,
      tenant.tenantCode,
      other.loginId,
      PASSWORD
    );

    const res = await remove(otherCookies, id);
    expect(res.statusCode).toBe(404);
    expect(storage.objects.size).toBe(2);
  });

  it('確定済み(報告書に紐づいた)画像は 404 で消せない', async () => {
    const { tenant, member, cookies } = await setupMemberSession(app);
    const id = await uploadTestImage(app, cookies);

    const report = await createReport(tenant.id, member.id);
    await nestableTransactionWithTenantId(tenant.id, async (tx) => {
      await tx.uploadedImage.updateMany({
        where: { tenantId: tenant.id, id },
        data: { reportId: report.id },
      });
    });

    const res = await remove(cookies, id);
    expect(res.statusCode).toBe(404);
    expect(storage.objects.size).toBe(2);
  });

  it('存在しない id は 404', async () => {
    const { cookies } = await setupMemberSession(app);
    const res = await remove(cookies, '01890000-0000-7000-8000-000000000000');
    expect(res.statusCode).toBe(404);
  });

  it('id が UUID でなければ 400', async () => {
    const { cookies } = await setupMemberSession(app);
    const res = await remove(cookies, 'not-a-uuid');
    expect(res.statusCode).toBe(400);
  });

  it('未ログインは 401', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/private/uploadedImages',
      query: { id: '01890000-0000-7000-8000-000000000000' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('S3 のキーは id から決まる(掃除スクリプトと同じ規則)', async () => {
    const { cookies } = await setupMemberSession(app);
    const id = await uploadTestImage(app, cookies);
    const { storageKey, thumbnailKey } = buildStorageKeys(id);
    expect([...storage.objects.keys()].sort()).toEqual(
      [storageKey, thumbnailKey].sort()
    );
  });
});
