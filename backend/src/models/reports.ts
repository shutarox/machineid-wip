import { Prisma, Report, Role, UploadedImage } from '@/generated/prisma/client.js';
import { ClientError } from '@/libs/appError.js';
import type { NestablePrismaTransaction } from '@/libs/prisma-connection.js';
import { MAX_IMAGES_PER_REPORT } from '@/models/uploadedImages.js';

// 報告書のモデル。
//
// users CRUD との違いは「**ロールで見える行が変わる**」ところ。その判断は
// route に書かず、この下の純粋関数(where ビルダー)に寄せる。route は
// 操作者を渡すだけにする(CLAUDE.md「判断が要る場面の既定」)。

/** 一覧・単一取得に共通で使う操作者。`User` をそのまま渡せる形にしてある */
export type ReportActor = { role: Role; id: string };

//=========================================================== 純粋関数

/**
 * 報告書の可視範囲。
 * ADMIN はテナント内全員、MEMBER は自分が作ったものだけ。
 *
 * **単一取得にも同じ where を通す**こと。可視外を 404 にするのがこのリソースの
 * 約束で、where を分けると 403 と 404 が食い違う
 */
export const buildReportListWhere = (
  tenantId: string,
  actor: ReportActor
): Prisma.ReportWhereInput =>
  actor.role === 'ADMIN' ? { tenantId } : { tenantId, userId: actor.id };

/** 添付画像の枚数の検証。違反があればメッセージを返す */
export const validateImageIds = (imageIds: string[]): string | null => {
  if (imageIds.length === 0) {
    return '画像を 1 枚以上添付してください';
  }
  if (imageIds.length > MAX_IMAGES_PER_REPORT) {
    return `画像は ${MAX_IMAGES_PER_REPORT} 枚までです`;
  }
  if (new Set(imageIds).size !== imageIds.length) {
    return '同じ画像が重複して指定されています';
  }
  return null;
};

//=========================================================== モデル関数

export type ReportWithImages = Report & {
  user: { userName: string };
  uploadedImages: UploadedImage[];
};

export const listReports = async (
  tx: NestablePrismaTransaction,
  {
    tenantId,
    actor,
    page,
    perPage,
  }: { tenantId: string; actor: ReportActor; page: number; perPage: number }
): Promise<{ reports: ReportWithImages[]; total: number }> => {
  const where = buildReportListWhere(tenantId, actor);
  const [reports, total] = await Promise.all([
    tx.report.findMany({
      where,
      include: {
        user: { select: { userName: true } },
        uploadedImages: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    tx.report.count({ where }),
  ]);
  return { reports, total };
};

/**
 * 可視範囲内の報告書を 1 件取得する(このファイル内専用)。
 * **見えない報告書は 404**(403 だと「その id は存在する」ことが漏れる)
 */
const requireVisibleReport = async (
  tx: NestablePrismaTransaction,
  {
    tenantId,
    actor,
    id,
  }: { tenantId: string; actor: ReportActor; id: string }
): Promise<ReportWithImages> => {
  const report = await tx.report.findFirst({
    where: { ...buildReportListWhere(tenantId, actor), id },
    include: {
      user: { select: { userName: true } },
      uploadedImages: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
    },
  });
  if (!report) {
    throw new ClientError('報告書が見つかりません', 404);
  }
  return report;
};

/**
 * 報告書を作り、指定された仮アップロード画像を確定させる。
 *
 * 確定 = `reportId` を入れること。S3 側は何も動かさない(キーは id で決まり、
 * 確定してもパスは変えない — 移動を挟むと失敗経路が増えるため)
 */
export const createReport = async (
  tx: NestablePrismaTransaction,
  {
    tenantId,
    userId,
    title,
    comment,
    imageIds,
  }: {
    tenantId: string;
    userId: string;
    title: string;
    comment: string;
    imageIds: string[];
  }
): Promise<ReportWithImages> => {
  const violation = validateImageIds(imageIds);
  if (violation) {
    throw new ClientError(violation);
  }

  // 指定された画像が全部「自分の・未確定の」画像であることを確かめる。
  // 他人のもの / 既に別の報告書で使われたもの / 存在しないものが混ざったら弾く。
  // 個別に理由を返すと他人の画像 id の存在が漏れるので、まとめて 400 にする
  const pending = await tx.uploadedImage.findMany({
    where: { tenantId, userId, reportId: null, id: { in: imageIds } },
    select: { id: true },
  });
  if (pending.length !== imageIds.length) {
    throw new ClientError('指定された画像が見つかりません');
  }

  const report = await tx.report.create({
    data: { tenantId, userId, title, comment },
  });
  await tx.uploadedImage.updateMany({
    where: { tenantId, id: { in: imageIds } },
    data: { reportId: report.id },
  });

  return await requireVisibleReport(tx, {
    tenantId,
    // 作成直後は本人が必ず見えるので、可視範囲の判定は MEMBER 相当で足りる
    actor: { role: 'MEMBER', id: userId },
    id: report.id,
  });
};

/**
 * 報告書と添付画像を削除し、**S3 から消すべき画像 id** を返す。
 *
 * S3 の削除は tx の外(呼び出し側)。ここで返した id をそのまま渡す
 */
export const deleteReport = async (
  tx: NestablePrismaTransaction,
  {
    tenantId,
    actor,
    id,
  }: { tenantId: string; actor: ReportActor; id: string }
): Promise<string[]> => {
  const report = await requireVisibleReport(tx, { tenantId, actor, id });
  const imageIds = report.uploadedImages.map((image) => image.id);

  // 画像 → 報告書 の順。relation が onDelete: Restrict なので逆順だと落ちる
  await tx.uploadedImage.deleteMany({
    where: { tenantId, reportId: report.id },
  });
  await tx.report.deleteMany({ where: { tenantId, id: report.id } });

  return imageIds;
};
