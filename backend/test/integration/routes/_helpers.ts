import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { z } from 'zod';
import { createTenant, createUser } from '../../factories.js';

// ルートテスト共通ヘルパー。
// ファイル名を _ 始まりにして vitest のテスト対象から外している

export const PASSWORD = 'RouteTestPass1';

// ワイヤー上の日時(+09:00 オフセット付き ISO 文字列)を Date に復元する。
// レスポンススキーマの日時は zDateOut()(= z.date() + replacer で JST 文字列化)で
// 書かれているため、スキーマで parse する前に文字列から Date に戻す必要がある
const reviveDates = (obj: unknown): unknown => {
  if (
    typeof obj === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?\+09:00$/.test(obj)
  ) {
    return new Date(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(reviveDates);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [key, reviveDates(value)])
    );
  }
  return obj;
};

// レスポンスをルートの Zod スキーマ(源泉)で parse して型付きで返す。
// 型が付くと同時に、実行時にもスキーマ適合を検証する
export const parseResponse = <S extends z.ZodType<unknown>>(
  schema: S,
  res: LightMyRequestResponse
): z.infer<S> => {
  const body: unknown = reviveDates(res.json());
  return schema.parse(body);
};

// multipart/form-data の body を組み立てる(fastify.inject 用)。
// inject は FormData を解釈しないので、境界文字列を含む生のバイト列を作る
export const multipartPayload = (
  file: { fieldName?: string; fileName: string; contentType: string; body: Buffer }
): { payload: Buffer; headers: Record<string, string> } => {
  const boundary = '----RouteTestBoundary0123456789';
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${file.fieldName ?? 'file'}"; ` +
      `filename="${file.fileName}"\r\n` +
      `Content-Type: ${file.contentType}\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, file.body, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
};

// 画像を 1 枚アップロードして id を返す。報告書系のテストは「確定済みの画像」を
// 用意するのに必ずこれを通るので、共通ヘルパーに置く。
// **呼ぶ前に setStorageForTesting でフェイクを差し込んでおくこと**
export const uploadTestImage = async (
  app: FastifyInstance,
  cookies: Record<string, string>
): Promise<string> => {
  const sharp = (await import('sharp')).default;
  const body = await sharp({
    create: { width: 60, height: 40, channels: 3, background: '#123456' },
  })
    .jpeg()
    .toBuffer();
  const { payload, headers } = multipartPayload({
    fileName: 'photo.jpg',
    contentType: 'image/jpeg',
    body,
  });
  const res = await app.inject({
    method: 'POST',
    url: '/api/private/uploadedImages',
    cookies,
    headers,
    payload,
  });
  if (res.statusCode !== 200) {
    throw new Error(`画像アップロードに失敗しました: ${res.statusCode} ${res.body}`);
  }
  return res.json<{ uploadedImage: { id: string } }>().uploadedImage.id;
};

// listen しないアプリを組み立てる(fastify.inject 用)
export const buildTestApp = async (): Promise<FastifyInstance> => {
  // prisma-connection の import は setup の DB_URL 差し替え後である必要が
  // あるため動的 import にしている
  const { buildApp } = await import('@/app.js');
  const app = buildApp();
  await app.ready();
  return app;
};

// ログインしてセッション/デバイスクッキーを取り出す
export const login = async (
  app: FastifyInstance,
  tenantCode: string,
  loginId: string,
  password: string
) => {
  // 初回リクエストで deviceId クッキーを得る
  const ping = await app.inject({ method: 'GET', url: '/api/ping' });
  const deviceId = ping.cookies.find((c) => c.name === 'deviceId')!;

  const res = await app.inject({
    method: 'POST',
    url: '/api/login',
    cookies: { [deviceId.name]: deviceId.value },
    payload: { tenantCode, loginId, password },
  });

  const sessionId = res.cookies.find((c) => c.name === 'sessionId');
  const cookies: Record<string, string> = { deviceId: deviceId.value };
  if (sessionId) {
    cookies.sessionId = sessionId.value;
  }
  return { res, cookies };
};

// テナント + 管理者を作ってログイン済みセッションを返す
export const setupAdminSession = async (app: FastifyInstance) => {
  const tenant = await createTenant();
  const admin = await createUser(tenant.id, {
    role: 'ADMIN',
    password: PASSWORD,
  });
  const { cookies } = await login(app, tenant.tenantCode, admin.loginId, PASSWORD);
  return { tenant, admin, cookies };
};

// テナント + 一般メンバーを作ってログイン済みセッションを返す
export const setupMemberSession = async (app: FastifyInstance) => {
  const tenant = await createTenant();
  const member = await createUser(tenant.id, {
    role: 'MEMBER',
    password: PASSWORD,
  });
  const { cookies } = await login(
    app,
    tenant.tenantCode,
    member.loginId,
    PASSWORD
  );
  return { tenant, member, cookies };
};
