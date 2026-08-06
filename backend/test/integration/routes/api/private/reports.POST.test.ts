import { nestableTransactionWithTenantId } from '@/libs/prisma-connection.js';
import { setStorageForTesting } from '@/libs/storage.js';
import { responseSchema } from '@/routes/api/private/reports.POST.js';
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

const post = async (cookies: Record<string, string>, payload: unknown) =>
  await app.inject({
    method: 'POST',
    url: '/api/private/reports',
    cookies,
    payload: payload as Record<string, unknown>,
  });

describe('POST /api/private/reports', () => {
  it('作成すると画像が確定し、報告書が返る', async () => {
    const { tenant, member, cookies } = await setupMemberSession(app);
    const imageId = await uploadTestImage(app, cookies);

    const res = await post(cookies, {
      title: '点検報告',
      comment: '異常なし',
      imageIds: [imageId],
    });
    expect(res.statusCode).toBe(200);

    const { report } = parseResponse(responseSchema, res);
    expect(report.title).toBe('点検報告');
    expect(report.userName).toBe(member.userName);
    expect(report.images.map((i) => i.id)).toEqual([imageId]);

    // 画像が確定済み(reportId が入った)になっている
    const image = await nestableTransactionWithTenantId(tenant.id, async (tx) =>
      tx.uploadedImage.findFirstOrThrow({
        where: { tenantId: tenant.id, id: imageId },
      })
    );
    expect(image.reportId).toBe(report.id);

    // S3 は動かさない(確定してもキーは変えない)
    expect(storage.objects.size).toBe(2);
  });

  it('画像 0 枚は 400', async () => {
    const { cookies } = await setupMemberSession(app);

    const res = await post(cookies, {
      title: '点検報告',
      comment: '異常なし',
      imageIds: [],
    });
    expect(res.statusCode).toBe(400);
  });

  it('画像 11 枚は 400', async () => {
    const { cookies } = await setupMemberSession(app);
    const imageIds = [];
    for (let i = 0; i < 11; i++) {
      imageIds.push(await uploadTestImage(app, cookies));
    }

    const res = await post(cookies, {
      title: '点検報告',
      comment: '異常なし',
      imageIds,
    });
    expect(res.statusCode).toBe(400);
  });

  it('画像 10 枚ちょうどは通る', async () => {
    const { cookies } = await setupMemberSession(app);
    const imageIds = [];
    for (let i = 0; i < 10; i++) {
      imageIds.push(await uploadTestImage(app, cookies));
    }

    const res = await post(cookies, {
      title: '点検報告',
      comment: '異常なし',
      imageIds,
    });
    expect(res.statusCode).toBe(200);
    expect(parseResponse(responseSchema, res).report.images).toHaveLength(10);
  });

  it('他人の画像を指定すると 400 で、報告書は作られない', async () => {
    const { tenant, cookies } = await setupMemberSession(app);
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
    const othersImageId = await uploadTestImage(app, otherCookies);

    const res = await post(cookies, {
      title: '横取り',
      comment: '他人の画像',
      imageIds: [othersImageId],
    });
    expect(res.statusCode).toBe(400);

    const count = await nestableTransactionWithTenantId(tenant.id, async (tx) =>
      tx.report.count({ where: { tenantId: tenant.id } })
    );
    expect(count).toBe(0);
  });

  it('既に別の報告書で確定済みの画像は使い回せない', async () => {
    const { cookies } = await setupMemberSession(app);
    const imageId = await uploadTestImage(app, cookies);

    const first = await post(cookies, {
      title: '1 件目',
      comment: '本文',
      imageIds: [imageId],
    });
    expect(first.statusCode).toBe(200);

    const second = await post(cookies, {
      title: '2 件目',
      comment: '本文',
      imageIds: [imageId],
    });
    expect(second.statusCode).toBe(400);
  });

  it('同じ画像を重複指定すると 400', async () => {
    const { cookies } = await setupMemberSession(app);
    const imageId = await uploadTestImage(app, cookies);

    const res = await post(cookies, {
      title: '重複',
      comment: '本文',
      imageIds: [imageId, imageId],
    });
    expect(res.statusCode).toBe(400);
  });

  it('存在しない画像 id は 400', async () => {
    const { cookies } = await setupMemberSession(app);

    const res = await post(cookies, {
      title: '存在しない',
      comment: '本文',
      imageIds: ['01890000-0000-7000-8000-000000000000'],
    });
    expect(res.statusCode).toBe(400);
  });

  it('タイトル・本文が空なら 400', async () => {
    const { cookies } = await setupMemberSession(app);
    const imageId = await uploadTestImage(app, cookies);

    expect(
      (await post(cookies, { title: '', comment: '本文', imageIds: [imageId] }))
        .statusCode
    ).toBe(400);
    expect(
      (await post(cookies, { title: 'タイトル', comment: '', imageIds: [imageId] }))
        .statusCode
    ).toBe(400);
  });

  it('未ログインは 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/private/reports',
      payload: {
        title: 'タイトル',
        comment: '本文',
        imageIds: ['01890000-0000-7000-8000-000000000000'],
      },
    });
    expect(res.statusCode).toBe(401);
  });
});
