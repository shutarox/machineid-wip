import { setStorageForTesting } from '@/libs/storage.js';
import { responseSchema } from '@/routes/api/private/reports.GET.js';
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
import { createMemoryStorage } from '../../../../fakes.js';
import { createUser } from '../../../../factories.js';
import {
  buildTestApp,
  login,
  parseResponse,
  PASSWORD,
  setupAdminSession,
  uploadTestImage,
} from '../../_helpers.js';

// **ロールで見える行が変わる**リソースの参照実装なので、可視範囲がこのファイルの主題。
// where ビルダー自体のテストは src/models/reports.test.ts(純粋関数)にある

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  setStorageForTesting(createMemoryStorage());
});

afterEach(() => {
  setStorageForTesting(null);
});

const createReportAs = async (
  cookies: Record<string, string>,
  title: string
) => {
  const imageId = await uploadTestImage(app, cookies);
  const res = await app.inject({
    method: 'POST',
    url: '/api/private/reports',
    cookies,
    payload: { title, comment: `${title} の本文`, imageIds: [imageId] },
  });
  if (res.statusCode !== 200) {
    throw new Error(`報告書の作成に失敗しました: ${res.statusCode} ${res.body}`);
  }
  return res.json<{ report: { id: string } }>().report.id;
};

const list = async (cookies: Record<string, string>, query = {}) =>
  await app.inject({
    method: 'GET',
    url: '/api/private/reports',
    cookies,
    query,
  });

/** ADMIN 1 人 + MEMBER 2 人が、それぞれ 1 件ずつ報告書を持つ状態を作る */
const setupTenantWithReports = async () => {
  const { tenant, admin, cookies: adminCookies } = await setupAdminSession(app);

  const memberA = await createUser(tenant.id, {
    role: 'MEMBER',
    password: PASSWORD,
  });
  const memberB = await createUser(tenant.id, {
    role: 'MEMBER',
    password: PASSWORD,
  });
  const { cookies: aCookies } = await login(
    app,
    tenant.tenantCode,
    memberA.loginId,
    PASSWORD
  );
  const { cookies: bCookies } = await login(
    app,
    tenant.tenantCode,
    memberB.loginId,
    PASSWORD
  );

  await createReportAs(adminCookies, '管理者の報告書');
  await createReportAs(aCookies, 'A の報告書');
  await createReportAs(bCookies, 'B の報告書');

  return { tenant, admin, adminCookies, memberA, aCookies, memberB, bCookies };
};

describe('GET /api/private/reports', () => {
  it('ADMIN はテナント内全員の報告書が見える', async () => {
    const { adminCookies } = await setupTenantWithReports();

    const res = await list(adminCookies);
    expect(res.statusCode).toBe(200);
    const { reports, total } = parseResponse(responseSchema, res);

    expect(total).toBe(3);
    expect(reports.map((r) => r.title).sort()).toEqual(
      ['A の報告書', 'B の報告書', '管理者の報告書'].sort()
    );
  });

  it('MEMBER は自分の報告書だけが見える', async () => {
    const { aCookies, memberA } = await setupTenantWithReports();

    const res = await list(aCookies);
    const { reports, total } = parseResponse(responseSchema, res);

    expect(total).toBe(1);
    expect(reports).toHaveLength(1);
    expect(reports[0]!.title).toBe('A の報告書');
    expect(reports[0]!.userId).toBe(memberA.id);
  });

  it('他テナントの報告書は ADMIN にも見えない', async () => {
    const { adminCookies } = await setupTenantWithReports();
    // 別テナントを丸ごと作る
    await setupTenantWithReports();

    const { total } = parseResponse(responseSchema, await list(adminCookies));
    expect(total).toBe(3);
  });

  it('作成者の名前と添付画像のサムネ URL が返る', async () => {
    const { aCookies, memberA } = await setupTenantWithReports();

    const { reports } = parseResponse(responseSchema, await list(aCookies));
    const report = reports[0]!;

    expect(report.userName).toBe(memberA.userName);
    expect(report.images).toHaveLength(1);
    expect(report.images[0]!.thumbnailUrl).toContain(report.images[0]!.id);
    expect(report.images[0]!.width).toBe(60);
    expect(report.images[0]!.height).toBe(40);
  });

  it('新しい順に並ぶ', async () => {
    const { cookies: adminCookies } = await setupAdminSession(app);
    await createReportAs(adminCookies, '古い');
    await createReportAs(adminCookies, '新しい');

    const { reports } = parseResponse(
      responseSchema,
      await list(adminCookies)
    );
    expect(reports.map((r) => r.title)).toEqual(['新しい', '古い']);
  });

  it('ページネーションが効く', async () => {
    const { adminCookies } = await setupTenantWithReports();

    const { reports, total } = parseResponse(
      responseSchema,
      await list(adminCookies, { page: '2', perPage: '2' })
    );
    expect(total).toBe(3);
    expect(reports).toHaveLength(1);
  });

  it('未ログインは 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/private/reports' });
    expect(res.statusCode).toBe(401);
  });
});
