import { ClientError, ServerError, ValidationError } from '@/libs/appError.js';
import {
  commonErrorsSchema,
  commonRequestHeadersSchema,
} from '@/libs/commonSchemas.js';
import { passwordHashGenerate } from '@/libs/cryptoUtils.js';
import { nestableTransactionWithTenantId } from '@/libs/prisma-connection.js';
import { validateIpAddress } from '@/libs/validateIpAddress.js';
import {
  FastifyPluginAsyncZod,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { randomInt } from 'node:crypto';
import { z } from 'zod';

import { sendMail } from '@/libs/mailer.js';

import { parseRouteFromFileUrl } from '@/libs/routeTool.js';

const CODE_EXPIRE_TIME = 60 * 60 * 1000; // 60分間有効

const { method, url, tag } = parseRouteFromFileUrl(import.meta.url);

const requestSchema = z
  .object({
    mode: z.enum(['request', 'reset']),
    tenantCode: z.string().min(1, '施設IDを入力してください'),
    loginId: z.string().min(1, 'ログインIDを入力してください'),
    authCode: z.string().optional(),
    newPassword: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.mode === 'reset') {
      if (!data.authCode || data.authCode.length !== 6) {
        ctx.addIssue({
          code: 'custom',
          message: '認証コードを6文字で入力してください。',
          path: ['authCode'],
        });
      }
      if (
        !data.newPassword ||
        data.newPassword.length < 8 ||
        data.newPassword.length > 100
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'パスワードは8文字以上100文字以内で入力してください。',
          path: ['newPassword'],
        });
      }
      if (
        data.newPassword &&
        !/^(?=.*[a-zA-Z])(?=.*\d)/.test(data.newPassword)
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'パスワードは英字と数字を含む必要があります。',
          path: ['newPassword'],
        });
      }
    }
  });
const responseSchema = z.object({
  maskedEmail: z.string().optional(),
  authErrorMessage: z.string().optional(),
  backToRequestMode: z.boolean().optional(),
});

const routes: FastifyPluginAsyncZod = async (fastify, _opts) => {
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method,
    url,
    schema: {
      tags: [tag],
      headers: commonRequestHeadersSchema,
      body: requestSchema,
      response: {
        200: responseSchema,
        ...commonErrorsSchema,
      },
    },
    handler: async (req, res) => {
      const { remoteIp } = req;
      const { mode, tenantCode, loginId, authCode, newPassword } = req.body;

      // メール送信は外部 I/O のため tx 内では行わない(assertNotInTransaction で強制)。
      // tx は送信すべきメールの内容を返し、コミット後に送信する
      const result = await nestableTransactionWithTenantId('*', async (tx) => {
        // テナント情報取得
        const tenant = await tx.tenant.findFirst({
          where: { tenantCode: tenantCode },
        });
        if (!tenant) {
          throw new ClientError('施設が見つかりません');
        }
        const tenantId = tenant.id;

        // 接続元IPチェック
        const isInSourceIpRange = validateIpAddress({
          ipAddress: remoteIp,
          expression: tenant.sourceIpRange,
        });
        if (!isInSourceIpRange) {
          throw new ClientError(
            `接続元IPアドレス(${remoteIp})は許可されていません`
          );
        }

        // ユーザ情報取得
        const user = await tx.user.findFirst({
          where: { tenantId, loginId },
        });
        if (!user) {
          throw new ClientError('ログインIDが見つかりません');
        }
        if (!user.email) {
          throw new ValidationError(
            'このログインIDにはメールアドレスが登録されていません'
          );
        }
        const userId = user.id;
        const maskedEmail = maskEmailAlternate(user.email);

        //==================== 認証コードの email 送信リクエスト

        if (mode === 'request') {
          const existingRequest = await tx.passwordResetRequest.findFirst({
            where: {
              tenantId,
              userId,
            },
          });
          if (existingRequest) {
            if (
              existingRequest.lastSentAt.getTime() >
              new Date(Date.now() - 58 * 1000).getTime()
            ) {
              throw new ClientError('前回の送信から60秒経つまで再送できません');
            }
            // 10分以内の再送信はコード変更なしの単なる再送
            if (
              existingRequest.requestedAt.getTime() + CODE_EXPIRE_TIME >
              new Date().getTime()
            ) {
              await tx.passwordResetRequest.updateMany({
                where: {
                  tenantId,
                  userId,
                },
                data: {
                  lastSentAt: new Date(),
                },
              });

              return {
                reply: { maskedEmail },
                authCodeMail: { email: user.email, authCode: existingRequest.authCode },
              };
            } else {
              await tx.passwordResetRequest.deleteMany({
                where: {
                  tenantId,
                  userId,
                },
              });
            }
          }
          // 新規／更新リクエスト
          const authCode = randomCode(6);
          await tx.passwordResetRequest.create({
            data: {
              tenantId,
              userId,
              requestedAt: new Date(),
              authCode,
              lastSentAt: new Date(),
            },
          });
          return {
            reply: { maskedEmail },
            authCodeMail: { email: user.email, authCode },
          };
        }

        //==================== パスワード再設定処理

        if (mode !== 'reset') {
          throw new ServerError('無効なモードです');
        }
        if (!authCode || !newPassword) {
          // バリデーションで弾いているはずなのでここには来ないはず
          throw new ServerError('認証コードと新しいパスワードが空です');
        }

        // 認証コードのチェック
        const existingRequest = await tx.passwordResetRequest.findFirst({
          where: {
            tenantId,
            userId,
          },
        });
        if (
          !existingRequest ||
          existingRequest.requestedAt.getTime() + CODE_EXPIRE_TIME <
            new Date().getTime()
        ) {
          return {
            reply: {
              authErrorMessage:
                '有効な再設定リスクエストがありません。認証コードを再送信してください。',
              backToRequestMode: true,
            },
          };
        }

        if (existingRequest.authCode !== authCode) {
          if (existingRequest.failCount >= 2) {
            await tx.passwordResetRequest.deleteMany({
              where: {
                tenantId,
                userId,
              },
            });

            return {
              reply: {
                authErrorMessage:
                  '３回認証コードを間違えたので現在の認証コードを無効にしました。認証コードを再発行してください。',
                backToRequestMode: true,
              },
            };
          }

          await tx.passwordResetRequest.updateMany({
            where: {
              tenantId,
              userId,
            },
            data: {
              failCount: {
                increment: 1,
              },
            },
          });
          return {
            reply: { authErrorMessage: '認証コードが違います' },
          };
        }

        // パスワード再設定

        await tx.passwordResetRequest.deleteMany({
          where: {
            tenantId,
            userId,
          },
        });
        const newPasswordHash = await passwordHashGenerate(newPassword);
        await tx.user.update({
          where: { tenantId, id: userId },
          data: {
            passwordHash: newPasswordHash,
            passwordChangedAt: new Date(),
          },
        });

        return { reply: {} };
      });

      if (result.authCodeMail) {
        await sendAuthCodeEmail(
          result.authCodeMail.email,
          result.authCodeMail.authCode
        );
      }
      return res.send(result.reply);
    },
  });
};

async function sendAuthCodeEmail(email: string, authCode: string) {
  await sendMail({
    to: email,
    subject: 'パスワード再設定用認証コード',
    text: `認証コード: ${authCode}

この認証コードを入力してパスワードを再設定してください。
認証コードは60分間有効です。
`,
  });
}

function maskEmailAlternate(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return email; // '@'が無い場合はそのまま返す

  const local = email.slice(0, at);
  const domain = email.slice(at);

  // ローカル部の最初と最後の文字以外を'*'に置き換える
  const maskedLocal =
    local[0] + '*'.repeat(local.length - 2) + local[local.length - 1];

  return maskedLocal + domain;
}

export function randomCode(len = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) {
    s += chars[randomInt(chars.length)];
  }
  return s;
}

export default routes;
