import * as Config from '@/config.js';
import { nestableTransactionWithTenantId } from '@/libs/prisma-connection.js';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildTestApp,
  setupAdminSession,
} from '../routes/_helpers.js';

// セッション寿命のリグレッションテスト。
// 「アイドル失効」と「活動による延長」の 2 つが、サーバ側の判定とセッションクッキーの
// 双方で同じ定数(SESSION_IDLE_TIMEOUT_MS)から導かれていることを固定する。
// 判断の経緯は docs/decisions/20260804-session-lifetime.md

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

// lastActiveAt を過去にずらす(時刻をモックせずに経過時間を再現する)
const setLastActiveAt = async (tenantId: string, at: Date) => {
  await nestableTransactionWithTenantId(
    '*',
    async (tx) =>
      await tx.loginSession.updateMany({
        where: { tenantId },
        data: { lastActiveAt: at },
      })
  );
};

const getLastActiveAt = async (tenantId: string) =>
  await nestableTransactionWithTenantId('*', async (tx) => {
    const session = await tx.loginSession.findFirst({ where: { tenantId } });
    return session!.lastActiveAt;
  });

describe('セッション寿命', () => {
  it('ログイン時のセッションクッキーは maxAge を持ち、アイドル失効と一致する', async () => {
    const { tenant, admin } = await setupAdminSession(app);
    expect(tenant).toBeTruthy();
    expect(admin).toBeTruthy();

    const ping = await app.inject({ method: 'GET', url: '/api/ping' });
    const deviceId = ping.cookies.find((c) => c.name === 'deviceId')!;
    const res = await app.inject({
      method: 'POST',
      url: '/api/login',
      cookies: { deviceId: deviceId.value },
      payload: {
        tenantCode: tenant.tenantCode,
        loginId: admin.loginId,
        password: 'RouteTestPass1',
      },
    });

    const cookie = res.cookies.find((c) => c.name === 'sessionId')!;
    expect(cookie.maxAge).toBe(Config.SESSION_IDLE_TIMEOUT_MS / 1000);
    // expires 固定をやめたことの回帰(起動時に 1 回計算される実装に戻さない)
    expect(cookie.expires).toBeUndefined();
  });

  it('アイドル失効を過ぎたセッションは 401 forceLogout になる', async () => {
    const { tenant, cookies } = await setupAdminSession(app);

    await setLastActiveAt(
      tenant.id,
      new Date(Date.now() - Config.SESSION_IDLE_TIMEOUT_MS - 60 * 1000)
    );

    const res = await app.inject({
      method: 'GET',
      url: '/api/private/master',
      cookies,
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ actions: ['forceLogout'] });
  });

  it('アイドル失効の手前なら通り、lastActiveAt とクッキーが延長される', async () => {
    const { tenant, cookies } = await setupAdminSession(app);

    // 失効はしていないが、延長間隔は超えている状態
    const stale = new Date(
      Date.now() - Config.SESSION_TOUCH_INTERVAL_MS - 60 * 1000
    );
    await setLastActiveAt(tenant.id, stale);

    const res = await app.inject({
      method: 'GET',
      url: '/api/private/master',
      cookies,
    });

    expect(res.statusCode).toBe(200);
    // サーバ側が延長されている
    expect((await getLastActiveAt(tenant.id)).getTime()).toBeGreaterThan(
      stale.getTime()
    );
    // クッキーも同時に再発行されている(サーバだけ延長される非対称に戻さない)
    const cookie = res.cookies.find((c) => c.name === 'sessionId');
    expect(cookie?.maxAge).toBe(Config.SESSION_IDLE_TIMEOUT_MS / 1000);
  });

  it('延長間隔より内側のリクエストではクッキーを再発行しない', async () => {
    const { cookies } = await setupAdminSession(app);

    // ログイン直後 = lastActiveAt は現在時刻なので、延長条件を満たさない
    const res = await app.inject({
      method: 'GET',
      url: '/api/private/master',
      cookies,
    });

    expect(res.statusCode).toBe(200);
    expect(res.cookies.find((c) => c.name === 'sessionId')).toBeUndefined();
  });
});
