import { jobs, type JobName, jobNames } from '@/jobs/index.js';
import { nestableTransaction } from '@/libs/prisma-connection.js';

// 定期実行ジョブのスケジューラ。
//
// **API サーバのプロセス内で回す。**(ADR docs/decisions/20260806-deploy-and-scheduled-jobs.md 決定 4)
// 使い捨てタスクを起動すると Fargate の最小課金単位(1 分)と毎回のイメージ pull が
// かかるため、軽いジョブを高頻度で回すには割に合わない。
//
// ## 多重実行をどう防ぐか
//
// API タスクは autoscaling で複数動くので、**単純な setInterval では台数分だけ走る**。
// 排他は「条件付き updateMany を claim として使う」形で取る:
//
//   UPDATE scheduled_jobs SET next_run_at = <次回> WHERE name = ? AND next_run_at <= now()
//
// READ COMMITTED では、負けた側は勝った側のコミット後に WHERE が再評価されて 0 件になる。
// **行ロックも AsyncLocalStorage も要らない。**
//
// `getLock`(libs/prisma-connection.ts)を使わないのは、あれがブロッキング待ちで、
// かつ editLock がテナント単位の行を要求するため。全体ジョブには合わない。
//
// ## セマンティクス
//
// **at-most-once。** claim した後にタスクが落ちた回はスキップされ、次の窓で拾う。
// 冪等に書けるジョブ向け。取りこぼしが許されないものは EventBridge 側へ置く。

/** claim を試す間隔。ジョブの実行間隔ではない */
const TICK_INTERVAL_MS = 30 * 1000;

/** SIGTERM を受けてから実行中のジョブを待つ上限。ECS の既定猶予は 30 秒 */
const SHUTDOWN_TIMEOUT_MS = 25 * 1000;

let timer: NodeJS.Timeout | undefined;
let stopping = false;
/** 実行中のジョブ。停止時にこれを待つ */
const running = new Set<Promise<void>>();

/**
 * 実行権を取る。取れたら true。
 *
 * **ジョブ本体はこの外で実行する。** トランザクションは既定 5 秒で切れ、
 * `assertNotInTransaction` が tx 内の外部 I/O を禁止しているため。
 *
 * `intervalSec` を引数で受けるのは、**テストがレジストリに無い名前でも
 * この実装そのものを検証できるようにする**ため(排他制御を写経すると
 * 実装と乖離しても気づけない)。
 */
export const claim = async (
  name: string,
  now: Date,
  intervalSec: number
): Promise<boolean> => {
  const nextRunAt = new Date(now.getTime() + intervalSec * 1000);

  const result = await nestableTransaction(async (tx) =>
    tx.scheduledJob.updateMany({
      where: { name, nextRunAt: { lte: now } },
      data: { nextRunAt, lastStartedAt: now },
    })
  );

  return result.count === 1;
};

const finish = async (name: JobName, status: 'ok' | 'error') => {
  await nestableTransaction(async (tx) =>
    tx.scheduledJob.updateMany({
      where: { name },
      data: { lastEndedAt: new Date(), lastStatus: status },
    })
  );
};

const runOne = async (name: JobName) => {
  const started = Date.now();
  try {
    await jobs[name].run();
    await finish(name, 'ok');
    console.log(`[scheduler] ${name} 完了 (${Date.now() - started}ms)`);
  } catch (e) {
    // **落とさない。** 1 つのジョブの失敗で API プロセスを巻き込まない
    console.error(`[scheduler] ${name} 失敗:`, e);
    await finish(name, 'error').catch((e2) =>
      console.error(`[scheduler] ${name} の状態更新に失敗:`, e2)
    );
  }
};

const tick = async () => {
  if (stopping) {
    return;
  }
  const now = new Date();

  for (const name of jobNames) {
    if (stopping) {
      return;
    }
    try {
      if (!(await claim(name, now, jobs[name].intervalSec))) {
        continue;
      }
    } catch (e) {
      // DB が一時的に落ちている等。次の tick で拾う
      console.error(`[scheduler] ${name} の claim に失敗:`, e);
      continue;
    }

    const task = runOne(name).finally(() => running.delete(task));
    running.add(task);
  }
};

/**
 * レジストリにあるジョブの行を用意する。
 *
 * **既存行の nextRunAt と intervalSec は上書きしない。** デプロイのたびに
 * リセットすると、間隔の長いジョブが永久に実行されない。
 */
export const ensureJobRows = async () => {
  const now = new Date();
  await nestableTransaction(async (tx) => {
    for (const name of jobNames) {
      await tx.scheduledJob.upsert({
        where: { name },
        create: { name, intervalSec: jobs[name].intervalSec, nextRunAt: now },
        update: {},
      });
    }
  });
};

export const startScheduler = async () => {
  if (timer) {
    return;
  }
  await ensureJobRows();

  console.log(
    `[scheduler] 起動 (${jobNames.length} ジョブ / ${TICK_INTERVAL_MS / 1000}秒ごとに claim)`
  );
  timer = setInterval(() => {
    void tick();
  }, TICK_INTERVAL_MS);

  // **プロセスの終了を妨げない。** これが無いと SIGTERM 後に
  // イベントループが空にならず、SIGKILL を待つことになる
  timer.unref();
};

/** SIGTERM で呼ぶ。新規の claim を止め、実行中のジョブを待つ */
export const stopScheduler = async () => {
  stopping = true;
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
  if (running.size === 0) {
    return;
  }

  console.log(`[scheduler] 実行中の ${running.size} ジョブを待っています`);
  await Promise.race([
    Promise.allSettled([...running]),
    new Promise((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS).unref()),
  ]);
};
