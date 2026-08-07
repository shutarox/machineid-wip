import { cleanupUploads } from '@/jobs/cleanupUploads.js';

// 定期実行ジョブのレジストリ。
//
// **ジョブ本体はここ(`src/jobs/`)に置く。** `script/` に書くと
// スケジューラから呼べなくなり、実装が二重化する
// (ADR docs/decisions/20260806-deploy-and-scheduled-jobs.md「エージェント向けの注意」)。
//
// 4 つの起動経路がすべてこのレジストリに収束する:
//
//   1. API プロセス内のスケジューラ  … src/jobs/scheduler.ts(軽い・高頻度)
//   2. 手動の使い捨てタスク          … script/run_job.ts を deploy/run_task.sh から
//   3. EventBridge → run-task        … 重い・低頻度のものだけ
//   4. ローカル実行                  … pnpm script script/run_job.ts <name>
//
// **intervalSec の目安**: スケジューラで回してよいのは
// 「数秒で終わる / I/O 中心 / バッチサイズで区切れる」もの。
// CPU バウンドや長時間のジョブは、イベントループを止めて
// ALB のヘルスチェックを落とすので EventBridge 側へ置く。

export type JobDefinition = {
  /** 実行間隔(秒)。ScheduledJob の初期値として使う */
  intervalSec: number;
  /** ジョブ本体。例外を投げれば失敗として記録される */
  run: () => Promise<void>;
  /** 何をするジョブか。運用時に一覧を見て分かるように */
  description: string;
};

export const jobs = {
  cleanupUploads: {
    // 仮アップロードの回収は 3 日タイムアウトなので、1 時間おきで十分に間に合う
    intervalSec: 60 * 60,
    description: '確定されないまま放置された仮アップロード画像を S3 と DB から消す',
    run: async () => {
      await cleanupUploads();
    },
  },
} as const satisfies Record<string, JobDefinition>;

export type JobName = keyof typeof jobs;

export const jobNames = Object.keys(jobs) as JobName[];

export const isJobName = (name: string): name is JobName =>
  Object.hasOwn(jobs, name);
