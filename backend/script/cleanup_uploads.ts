// 仮アップロードの後始末: 確定されないまま放置された画像を S3 と DB から消す
//
// Usage:
//   pnpm script script/cleanup_uploads.ts [--dry-run]
//   (backend/ で実行。`script` は tsconfig paths を解決するラッパー)
//
// 「送信フォームで画像を選んだが報告書を送らずに離脱した」分がここで回収される。
// 本番は ECS scheduled task(terraform.example の 39_ecs-scheduled-task.tf)、
// ローカルは手動実行。
//
// テナント横断で走るので tx のコンテキストに '*' を渡す(RLS 拡張のバッチ用の逃げ道)。
// **'*' はコンテキストに渡すもので、where には書かない**(SQL に流れて uuid 型で落ちる)。

import { nestableTransactionWithTenantId } from '@/libs/prisma-connection.js';
import {
  removeImageObjects,
  uploadExpiryThreshold,
} from '@/models/uploadedImages.js';

const isDryRun = process.argv.includes('--dry-run');

// 一度に消す件数。S3 の DeleteObjects は 1 回 1000 キーまでで、画像 1 枚が
// 本体 + サムネの 2 キーなので、その半分に収まる粒度にしておく
const BATCH_SIZE = 200;

const threshold = uploadExpiryThreshold(new Date());
console.log(`仮アップロードの削除対象: createdAt < ${threshold.toISOString()}`);

let totalRemoved = 0;

for (;;) {
  // 対象の id を取る。**tx の外で S3 を消す**必要があるので、
  // 「読む → S3 を消す → DB を消す」を 1 バッチずつ回す
  const targets = await nestableTransactionWithTenantId('*', async (tx) =>
    tx.uploadedImage.findMany({
      where: { reportId: null, createdAt: { lt: threshold } },
      select: { id: true, tenantId: true },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
    })
  );

  if (targets.length === 0) {
    break;
  }

  const ids = targets.map((target) => target.id);
  if (isDryRun) {
    console.log(`[dry-run] ${ids.length} 件が対象: ${ids.join(', ')}`);
    break;
  }

  // 先に S3。DB を先に消すと、残ったオブジェクトを指す手がかりが無くなる
  await removeImageObjects(ids);
  await nestableTransactionWithTenantId('*', async (tx) => {
    await tx.uploadedImage.deleteMany({
      where: { id: { in: ids } },
    });
  });

  totalRemoved += ids.length;
  console.log(`${ids.length} 件削除(累計 ${totalRemoved} 件)`);
}

console.log(
  isDryRun ? 'dry-run のため削除していません' : `完了: ${totalRemoved} 件削除`
);
process.exit(0);
