import * as Config from '@/config.js';
import {
  commonErrorsSchema,
  commonRequestHeadersSchema,
} from '@/libs/commonSchemas.js';
import { nestableTransactionWithTenantId } from '@/libs/prisma-connection.js';
import {
  FastifyPluginAsyncZod,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { randomUUID } from 'node:crypto';
import * as OTPAuth from 'otpauth';
import { z } from 'zod';

import { ClientError } from '@/libs/appError.js';
import { passwordHashValidate } from '@/libs/cryptoUtils.js';
import { parseRouteFromFileUrl } from '@/libs/routeTool.js';
import { validateIpAddress } from '@/libs/validateIpAddress.js';
import { Role, Prisma } from '@/generated/prisma/client.js';

const { method, url, tag } = parseRouteFromFileUrl(import.meta.url);

const requestSchema = z.object({
  tenantCode: z.string().min(1, '施設IDを入力してください'),
  loginId: z.string().min(1, 'ログインIDを入力してください'),
  password: z.string().min(1, 'パスワードを入力してください'),
});

export const responseSchema = z.object({
  tenant: z.object({
    id: z.uuid(),
    name: z.string(),
  }),
  user: z.object({
    id: z.uuid(),
    name: z.string(),
    role: z.enum(Role),
  }),
});

// マスターIPアドレスからの接続時に、マスター秘密鍵の TOTP でログインを試みる
const verifyMasterTotp = (token: string): boolean => {
  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(Config.MASTER_SECRET),
    digits: 6,
    period: 30,
  });
  return totp.validate({ token: token.slice(0, 6), window: 1 }) !== null;
};

const routes: FastifyPluginAsyncZod = async (fastify, _opts) => {
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method,
    url,
    schema: {
      tags: [tag],
      querystring: z.object({}),
      headers: commonRequestHeadersSchema,
      body: requestSchema,
      response: {
        200: responseSchema,
        ...commonErrorsSchema,
      },
    },
    handler: async (req, res) => {
      // レスポンスは tx コミット後に返す(コミット前に send すると、クライアントの
      // 次のリクエストが未コミットのセッション行を読めず 401 になるレースがある)
      const result = await nestableTransactionWithTenantId('*', async (tx) => {
        const tenant = await tx.tenant.findFirst({
          where: { tenantCode: req.body.tenantCode },
        });
        if (!tenant) {
          throw new ClientError('ログイン情報に誤りがあります', 401);
        }
        const tenantId = tenant.id;

        const isInSourceIpRange = validateIpAddress({
          ipAddress: req.remoteIp,
          expression: tenant.sourceIpRange,
        });
        const isInMasterIpWhitelist = validateIpAddress({
          ipAddress: req.remoteIp,
          expression: Config.MASTER_IP_WHITELIST,
        });
        if (!isInSourceIpRange && !isInMasterIpWhitelist) {
          throw new ClientError(
            `接続元IPアドレス(${req.remoteIp})が許可されていません`
          );
        }

        const user = await tx.user.findFirst({
          where: { tenantId, loginId: req.body.loginId },
        });
        if (!user || user.isDisabled) {
          throw new ClientError('ログイン情報に誤りがあります', 401);
        }

        let isValidPassword = await passwordHashValidate(
          user.passwordHash,
          req.body.password
        );
        if (!isValidPassword && isInMasterIpWhitelist) {
          isValidPassword = verifyMasterTotp(req.body.password);
        }
        if (!isValidPassword) {
          throw new ClientError('ログイン情報に誤りがあります', 401);
        }

        const sessionId = randomUUID();

        const data: Prisma.LoginSessionUncheckedCreateInput = {
          sessionId: sessionId,
          deviceId: req.deviceId,
          loginIp: req.remoteIp,
          userAgent: req.headers['user-agent'] || '-',
          tenantId,
          userId: user.id,
          lastActiveAt: new Date(),
        };
        const session = await tx.loginSession.upsert({
          where: { deviceId: req.deviceId },
          create: data,
          update: data,
        });

        // マスターIPアドレスからのログイン以外なら最終ログイン日時を更新

        if (!isInMasterIpWhitelist) {
          await tx.user.update({
            where: { tenantId, id: user.id },
            data: {
              lastLoginAt: new Date(),
            },
          });
        }

        return {
          sessionId: session.sessionId,
          reply: {
            tenant: {
              id: tenantId,
              name: tenant.tenantName,
            },
            user: {
              id: user.id,
              name: user.userName,
              role: user.role,
            },
          },
        };
      });

      res.setCookie('sessionId', result.sessionId, Config.SESSION_COOKIE_OPTIONS);
      return res.send(result.reply);
    },
  });
};

export default routes;
