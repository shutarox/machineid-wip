import { jobs, jobNames } from '@/jobs/index.js';
import { claim, ensureJobRows } from '@/jobs/scheduler.js';
import { nestableTransaction } from '@/libs/prisma-connection.js';
import { beforeEach, describe, expect, test } from 'vitest';

// スケジューラの排他制御が壊れていないことを固定する。
//
// **API タスクは autoscaling で複数動く。** claim が効かないとジョブが台数分だけ走る。
// これは本番でしか顕在化せず、しかも「二重に消える」「二重に送る」という形で出るため、
// ここで押さえておく(ADR docs/decisions/20260806-deploy-and-scheduled-jobs.md 決定 4)。

describe('定期実行ジョブの claim', () => {
  beforeEach(async () => {
    await nestableTransaction(async (tx) => {
      await tx.scheduledJob.deleteMany({});
    });
  });

  test('同時に走らせても 1 つしか実行権を取れない', async () => {
    const now = new Date();
    await nestableTransaction(async (tx) => {
      await tx.scheduledJob.create({
        data: { name: 'testJob', intervalSec: 3600, nextRunAt: now },
      });
    });

    // **本番の複数タスクを模す。** 同じ瞬間に 5 つが claim を試みる
    const results = await Promise.all(
      Array.from({ length: 5 }, () => claim('testJob', now, 3600))
    );

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  test('nextRunAt が未来なら実行権を取れない', async () => {
    const now = new Date();
    const future = new Date(now.getTime() + 60 * 1000);
    await nestableTransaction(async (tx) => {
      await tx.scheduledJob.create({
        data: { name: 'testJob', intervalSec: 3600, nextRunAt: future },
      });
    });

    expect(await claim('testJob', now, 3600)).toBe(false);
  });

  test('claim すると nextRunAt が intervalSec ぶん先へ進む', async () => {
    const now = new Date();
    await nestableTransaction(async (tx) => {
      await tx.scheduledJob.create({
        data: { name: 'testJob', intervalSec: 600, nextRunAt: now },
      });
    });

    expect(await claim('testJob', now, 600)).toBe(true);

    const row = await nestableTransaction(async (tx) =>
      tx.scheduledJob.findUniqueOrThrow({ where: { name: 'testJob' } })
    );
    expect(row.nextRunAt.getTime()).toBe(now.getTime() + 600 * 1000);
    expect(row.lastStartedAt?.getTime()).toBe(now.getTime());
  });

  test('行が無ければ実行権を取れない(例外にはしない)', async () => {
    expect(await claim('存在しないジョブ', new Date(), 3600)).toBe(false);
  });
});

describe('ScheduledJob と RLS 拡張', () => {
  beforeEach(async () => {
    await nestableTransaction(async (tx) => {
      await tx.scheduledJob.deleteMany({});
    });
  });

  // **tenantId を持たないモデルは RLS 検査の対象外**という前提に乗っている。
  // ここが変わると、テナント指定なしの nestableTransaction で例外になり
  // スケジューラが一切動かなくなる
  test('tenantId のコンテキスト無しで読み書きできる', async () => {
    const now = new Date();
    await expect(
      nestableTransaction(async (tx) => {
        await tx.scheduledJob.create({
          data: { name: 'noTenant', intervalSec: 60, nextRunAt: now },
        });
        return tx.scheduledJob.findMany({});
      })
    ).resolves.toHaveLength(1);
  });
});

describe('ensureJobRows', () => {
  beforeEach(async () => {
    await nestableTransaction(async (tx) => {
      await tx.scheduledJob.deleteMany({});
    });
  });

  test('レジストリの全ジョブぶんの行を作る', async () => {
    await ensureJobRows();

    const rows = await nestableTransaction(async (tx) =>
      tx.scheduledJob.findMany({ orderBy: { name: 'asc' } })
    );
    expect(rows.map((row) => row.name).sort()).toEqual([...jobNames].sort());
    for (const row of rows) {
      expect(row.intervalSec).toBe(jobs[row.name as keyof typeof jobs].intervalSec);
    }
  });

  // **デプロイのたびに nextRunAt がリセットされると、間隔の長いジョブが永久に走らない。**
  // ensureJobRows は upsert の update を空にすることでこれを避けている
  test('既存行の nextRunAt を上書きしない', async () => {
    const future = new Date(Date.now() + 12 * 60 * 60 * 1000);
    await nestableTransaction(async (tx) => {
      await tx.scheduledJob.create({
        data: { name: jobNames[0]!, intervalSec: 1, nextRunAt: future },
      });
    });

    await ensureJobRows();

    const row = await nestableTransaction(async (tx) =>
      tx.scheduledJob.findUniqueOrThrow({ where: { name: jobNames[0]! } })
    );
    expect(row.nextRunAt.getTime()).toBe(future.getTime());
    expect(row.intervalSec).toBe(1);
  });
});
