import * as Config from '@/config.js';
import * as Fastify from 'fastify';
import fastifyPlugin from 'fastify-plugin';

import { nestableTransactionWithTenantId } from '@/libs/prisma-connection.js';
import { validateIpAddress } from '@/libs/validateIpAddress.js';

declare module 'fastify' {
  interface FastifyRequest {
    sessionId: string;
    tenantId: string;
    userId: string;
  }
}
export const sessionRetrieve = fastifyPlugin(
  async (fastify: Fastify.FastifyInstance) => {
    ['sessionId', 'tenantId'].forEach((key) => {
      if (!fastify.hasRequestDecorator(key)) {
        fastify.decorateRequest(key, '');
      }
    });

    fastify.addHook('preValidation', async (request, reply) => {
      // 運用サポート用の IP ホワイトリスト(MASTER_IP_WHITELIST)からの接続フラグ
      const isInMasterIpWhitelist = validateIpAddress({
        ipAddress: request.remoteIp,
        expression: Config.MASTER_IP_WHITELIST,
      });

      // メンテナンスモード
      if (Config.MAINTENANCE_MODE) {
        if (!isInMasterIpWhitelist) {
          if (request.url.startsWith('/api/ping')) {
            return;
          }
          return reply
            .code(503)
            .header('Content-Type', 'application/json; charset=utf-8')
            .send({
              message: Config.MAINTENANCE_MESSAGE,
              actions: ['forceLogout'],
            });
        }
      }

      // アプリ強制バージョンアップ判定
      if (
        typeof request.headers['x-client-version'] === 'string' &&
        Number(
          // clientVersion 文字列の形式 ： YYYYMMDD.hhmm.HASH
          // 例 ：20251114.1517.12c90f33
          request.headers['x-client-version'].split('.').slice(0, 2).join('.')
        ) < Config.MINIMUM_CLIENT_VERSION
      ) {
        return reply.code(401).send({
          actions: ['reloadApp'],
        });
      }

      if (request.cookies.sessionId && request.deviceId) {
        // cookie の署名確認
        const result = fastify.unsignCookie(request.cookies.sessionId);
        if (!result.valid) {
          Object.keys(request.cookies).forEach((key) => {
            reply.clearCookie(key, Config.DEFAULT_COOKIE_OPTIONS);
          });
          return reply.code(401).send({
            message: 'Cookie が無効になりました',
            actions: ['forceLogout'],
          });
        }

        // 与えられたのが有効なセッションだったらテナントIDを取得
        // 無効ならログアウト要求

        const sessionId = result.value;
        const deviceId = request.deviceId;

        if (sessionId) {
          const result = await nestableTransactionWithTenantId(
            '*',
            async (tx) =>
              await tx.loginSession.findFirst({
                where: { sessionId, deviceId },
                include: {
                  tenant: {
                    select: {
                      sourceIpRange: true,
                    },
                  },
                },
              })
          );
          if (
            !result ||
            result.lastActiveAt <
              new Date(Date.now() - Config.SESSION_IDLE_TIMEOUT_MS)
          ) {
            reply.clearCookie('sessionId', Config.SESSION_COOKIE_OPTIONS);
            return reply.code(401).send({
              actions: ['forceLogout'],
            });
          }
          // 一定間隔で lastActiveAt を更新し、あわせてセッションクッキーも再発行する。
          // サーバ側の延命とクッキーの延命を同じ条件で動かすため、必ず一緒に行う
          if (
            result.lastActiveAt <
            new Date(Date.now() - Config.SESSION_TOUCH_INTERVAL_MS)
          ) {
            await nestableTransactionWithTenantId(
              '*',
              async (tx) =>
                await tx.loginSession.update({
                  where: { sessionId, deviceId },
                  data: { lastActiveAt: new Date() },
                })
            );
            reply.setCookie(
              'sessionId',
              sessionId,
              Config.SESSION_COOKIE_OPTIONS
            );
          }
          const isInSourceIpRange = validateIpAddress({
            ipAddress: request.remoteIp,
            expression: result.tenant.sourceIpRange,
          });
          if (!isInSourceIpRange && !isInMasterIpWhitelist) {
            return reply.code(400).send({
              message: `接続元IPアドレス(${request.remoteIp})が許可されていません`,
              actions: ['forceLogout'],
            });
          }
          request.sessionId = sessionId;
          request.tenantId = result.tenantId;
          request.userId = result.userId;
        } else {
          request.sessionId = '';
          request.tenantId = '';
          request.userId = '';
        }
      }

      if (
        request.headers['x-tenant-id'] &&
        (Array.isArray(request.headers['x-tenant-id'])
          ? request.headers['x-tenant-id']
          : [request.headers['x-tenant-id']])[0] !== request.tenantId
      ) {
        reply.clearCookie('sessionId', Config.SESSION_COOKIE_OPTIONS);
        return reply.code(401).send({
          actions: ['forceLogout'],
        });
      }

      if (request.url.match(/^\/api\/private\//)) {
        if (!request.sessionId || !request.tenantId) {
          return reply
            .code(401)
            .send({ message: 'ログインが必要です', actions: ['forceLogout'] });
        }
      }
    });
  }
);
