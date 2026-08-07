// 定期実行ジョブを名前指定で 1 回だけ流すエントリポイント。
//
// Usage:
//   ローカル: pnpm script script/run_job.ts <name>
//   本番:     ./deploy/run_task.sh 'node /app/backend/build/script/run_job.js <name>'
//
// **スケジューラの claim を経由しない。** 「いま流したい」ための入口なので、
// nextRunAt に関係なく即座に実行する(次回の予定もずらさない)。

import { isJobName, jobNames, jobs } from '@/jobs/index.js';
import { exit } from 'process';

const name = process.argv[2];

if (!name || !isJobName(name)) {
  console.error(`Usage: run_job <name>`);
  console.error('');
  console.error('実行できるジョブ:');
  for (const jobName of jobNames) {
    console.error(`  ${jobName}  (${jobs[jobName].intervalSec}秒ごと)`);
    console.error(`    ${jobs[jobName].description}`);
  }
  exit(1);
}

console.log(`${name} を実行します`);
await jobs[name].run();
console.log(`${name} 完了`);
exit(0);
