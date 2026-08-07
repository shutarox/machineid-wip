// 仮アップロードの後始末を単発で流すエントリポイント。
//
// Usage:
//   ローカル: pnpm script script/cleanup_uploads.ts [--dry-run]
//   本番:     ./deploy/run_task.sh 'node /app/backend/build/script/cleanup_uploads.js --dry-run'
//
// **本体は src/jobs/cleanupUploads.ts にある。** ここはエントリポイントだけ。
// 通常は API プロセス内のスケジューラが 1 時間おきに回すので、これを叩くのは
// 「いま流したい」「dry-run で対象を見たい」ときだけ。

import { cleanupUploads } from '@/jobs/cleanupUploads.js';

await cleanupUploads({ dryRun: process.argv.includes('--dry-run') });
process.exit(0);
