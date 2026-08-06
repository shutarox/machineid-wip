import { ClientError, ServerError } from '@/libs/appError.js';
import {
  commonErrorsSchema,
  commonRequestHeadersSchema,
} from '@/libs/commonSchemas.js';
import {
  passwordHashGenerate,
  passwordHashValidate,
} from '@/libs/cryptoUtils.js';
import { nestableTransactionWithTenantId } from '@/libs/prisma-connection.js';
import {
  FastifyPluginAsyncZod,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';

import { parseRouteFromFileUrl } from '@/libs/routeTool.js';

const { method, url, tag } = parseRouteFromFileUrl(import.meta.url);

const requestSchema = z.object({
  oldPassword: z.string(),
  newPassword: z.string(),
});
const responseSchema = z.object({});

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
      const { tenantId, userId } = req;
      const { oldPassword, newPassword } = req.body;

      await nestableTransactionWithTenantId(tenantId, async (tx) => {
        // ユーザ情報取得
        const user = await tx.user.findFirst({
          where: { tenantId, id: userId },
        });
        if (!user) {
          throw new ServerError('User not found');
        }

        // 現在のパスワードチェック
        const isValidPassword = await passwordHashValidate(
          user.passwordHash,
          oldPassword
        );
        if (!isValidPassword) {
          throw new ClientError('現在のパスワードが違います');
        }

        // 新パスワード設定
        const newPasswordHash = await passwordHashGenerate(newPassword);
        await tx.user.update({
          where: { tenantId, id: userId },
          data: {
            passwordHash: newPasswordHash,
            passwordChangedAt: new Date(),
          },
        });
      });
      // レスポンスは tx コミット後に返す(新パスワードでの再ログインの可視性レース対策)
      return res.send({});
    },
  });
};

export default routes;
