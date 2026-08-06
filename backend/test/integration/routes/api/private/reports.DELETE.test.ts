import { nestableTransactionWithTenantId } from '@/libs/prisma-connection.js';
import { setStorageForTesting } from '@/libs/storage.js';
import { responseSchema } from '@/routes/api/private/reports.DELETE.js';
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
import { createUser } from '../../../../factories.js';
import {
  buildTestApp,
  login,
  parseResponse,
  PASSWORD,
  setupAdminSession,
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

const createReportAs = async (cookies: Record<string, string>) => {
  const imageId = await uploadTestImage(app, cookies);
  const res = await app.inject({
    method: 'POST',
    url: '/api/private/reports',
    cookies,
    payload: { title: '報告書', comment: '本文', imageIds: [imageId] },
  });
  if (res.statusCode !== 200) {
    throw new Error(`報告書の作成に失敗しました: ${res.statusCode} ${res.body}`);
  }
  return {
    reportId: res.json<{ report: { id: string } }>().report.id,
    imageId,
  };
};

const remove = async (cookies: Record<string, string>, id: string) =>
  await app.inject({
    method: 'DELETE',
    url: '/api/private/reports',
    cookies,
    query: { id },
  });

describe('DELETE /api/private/reports', () => {
  it('自分の報告書は添付画像ごと DB からも S3 からも消える', async () => {
    const { tenant, cookies } = await setupMemberSession(app);
    const { reportId, imageId } = await createReportAs(cookies);
    expect(storage.objects.size).toBe(2);

    const res = await remove(cookies, reportId);
    expect(res.statusCode).toBe(200);
    expect(parseResponse(responseSchema, res).ok).toBe(true);

    expect(storage.objects.size).toBe(0);
    await nestableTransactionWithTenantId(tenant.id, async (tx) => {
      expect(
        await tx.report.findFirst({ where: { tenantId: tenant.id, id: reportId } })
      ).toBeNull();
      expect(
        await tx.uploadedImage.findFirst({
          where: { tenantId: tenant.id, id: imageId },
        })
      ).toBeNull();
    });
  });

  it('MEMBER は他人の報告書を消せず 404(存在は漏らさない)', async () => {
    const { tenant, cookies } = await setupMemberSession(app);
    const { reportId } = await createReportAs(cookies);

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

    const res = await remove(otherCookies, reportId);
    expect(res.statusCode).toBe(404);
    expect(storage.objects.size).toBe(2);
  });

  it('ADMIN は同じテナントの他人の報告書を消せる', async () => {
    const { tenant, cookies: adminCookies } = await setupAdminSession(app);
    const member = await createUser(tenant.id, {
      role: 'MEMBER',
      password: PASSWORD,
    });
    const { cookies: memberCookies } = await login(
      app,
      tenant.tenantCode,
      member.loginId,
      PASSWORD
    );
    const { reportId } = await createReportAs(memberCookies);

    const res = await remove(adminCookies, reportId);
    expect(res.statusCode).toBe(200);
    expect(storage.objects.size).toBe(0);
  });

  it('他テナントの ADMIN からは 404', async () => {
    const { cookies: ownerCookies } = await setupMemberSession(app);
    const { reportId } = await createReportAs(ownerCookies);

    const { cookies: outsiderCookies } = await setupAdminSession(app);

    const res = await remove(outsiderCookies, reportId);
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
      url: '/api/private/reports',
      query: { id: '01890000-0000-7000-8000-000000000000' },
    });
    expect(res.statusCode).toBe(401);
  });
});
