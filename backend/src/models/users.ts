import { ClientError } from '@/libs/appError.js';
import { randomString } from '@/libs/cryptoUtils.js';
import { passwordHashGenerate } from '@/libs/cryptoUtils.js';
import { NestablePrismaTransaction } from '@/libs/prisma-connection.js';
import { Prisma, Role, User } from '@/generated/prisma/client.js';

// users の参照実装。層構造の見本:
//   route(routes/api/private/users.*.ts)
//     → tx を受け取るモデル関数(このファイル)
//       → 純粋関数(このファイルの「純粋関数」セクション)

//=========================================================== 純粋関数

// 一覧検索の where 条件を組み立てる
export const buildUserSearchWhere = (
  tenantId: string,
  search: string | undefined
): Prisma.UserWhereInput => {
  if (!search) {
    return { tenantId };
  }
  return {
    tenantId,
    OR: [
      { userName: { contains: search } },
      { loginId: { contains: search } },
      { email: { contains: search } },
    ],
  };
};

// 更新パッチの認可チェック。違反があればエラーメッセージを返す
export const validateUserPatch = ({
  actorId,
  targetId,
  patch,
}: {
  actorId: string;
  targetId: string;
  patch: { role?: Role; isDisabled?: boolean };
}): string | null => {
  if (actorId === targetId && patch.role !== undefined) {
    return '自分自身のロールは変更できません';
  }
  if (actorId === targetId && patch.isDisabled === true) {
    return '自分自身を無効化することはできません';
  }
  return null;
};

//=========================================================== モデル関数(tx を受け取る)

// 操作者が ADMIN であることを保証する
export const requireAdmin = async (
  tx: NestablePrismaTransaction,
  { tenantId, userId }: { tenantId: string; userId: string }
): Promise<User> => {
  const actor = await tx.user.findFirst({ where: { tenantId, id: userId } });
  if (!actor || actor.role !== 'ADMIN') {
    throw new ClientError('この操作には管理者権限が必要です', 403);
  }
  return actor;
};

// 操作者そのものを取る。req に載っているのは tenantId / userId だけなので、
// ロール等の属性で分岐したいときはここを通す(見本: models/reports.ts の可視範囲)。
// 認証は済んでいる前提なので、見つからなければセッションが実体を失っている
export const requireActor = async (
  tx: NestablePrismaTransaction,
  { tenantId, userId }: { tenantId: string; userId: string }
): Promise<User> => {
  const actor = await tx.user.findFirst({ where: { tenantId, id: userId } });
  if (!actor) {
    throw new ClientError('ユーザが見つかりません', 401);
  }
  return actor;
};

export const listUsers = async (
  tx: NestablePrismaTransaction,
  {
    tenantId,
    page,
    perPage,
    search,
  }: { tenantId: string; page: number; perPage: number; search?: string }
): Promise<{ users: User[]; total: number }> => {
  const where = buildUserSearchWhere(tenantId, search);
  const [users, total] = await Promise.all([
    tx.user.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    tx.user.count({ where }),
  ]);
  return { users, total };
};

export const createUser = async (
  tx: NestablePrismaTransaction,
  {
    tenantId,
    userName,
    loginId,
    email,
    role,
  }: {
    tenantId: string;
    userName: string;
    loginId: string;
    email: string;
    role: Role;
  }
): Promise<{ user: User; initialPassword: string }> => {
  const existing = await tx.user.findFirst({ where: { tenantId, loginId } });
  if (existing) {
    throw new ClientError('このログインIDは既に使われています');
  }

  const initialPassword = randomString(12);
  const passwordHash = await passwordHashGenerate(initialPassword);

  const user = await tx.user.create({
    data: {
      tenantId,
      userName,
      loginId,
      email,
      role,
      passwordHash,
    },
  });
  return { user, initialPassword };
};

export const updateUser = async (
  tx: NestablePrismaTransaction,
  {
    tenantId,
    actorId,
    targetId,
    patch,
  }: {
    tenantId: string;
    actorId: string;
    targetId: string;
    patch: {
      userName?: string;
      email?: string;
      role?: Role;
      isDisabled?: boolean;
    };
  }
): Promise<User> => {
  const validationError = validateUserPatch({ actorId, targetId, patch });
  if (validationError) {
    throw new ClientError(validationError);
  }

  const target = await tx.user.findFirst({
    where: { tenantId, id: targetId },
  });
  if (!target) {
    throw new ClientError('ユーザが見つかりません', 404);
  }

  const user = await tx.user.update({
    where: { tenantId, id: targetId },
    data: patch,
  });

  // 無効化したユーザのセッションは失効させる
  if (patch.isDisabled === true) {
    await tx.loginSession.deleteMany({
      where: { tenantId, userId: targetId },
    });
  }

  return user;
};
