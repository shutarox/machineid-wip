// スケジューラを単体プロセスとして起動するエントリポイント。
//
// Usage:
//   ./deploy/run_task.sh 'node /app/backend/build/script/scheduler.js'
//
// **通常は使わない。** 定期実行は API サーバのプロセス内で回している
// (ADR docs/decisions/20260806-deploy-and-scheduled-jobs.md 決定 4)。
//
// ここにあるのは**将来の出口**。ジョブが重くなって API のイベントループを
// 圧迫し始めたら、専用の ECS サービスとして起動コマンドをこれに差し替えるだけで
// 移行できる(アプリのコードは 1 行も変わらない)。
// そのときは API 側の SCHEDULER_ENABLED を false にすること。

import { startScheduler, stopScheduler } from '@/jobs/scheduler.js';

await startScheduler();

const shutdown = async (signal: string) => {
  console.log(`${signal} を受信しました`);
  await stopScheduler();
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// unref した timer だけではプロセスが終わってしまうので、明示的に待つ
setInterval(() => {}, 1 << 30);
