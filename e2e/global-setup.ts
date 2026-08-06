import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// E2E の事前準備: マイグレーション適用(冪等)+ E2E 用テナント/ユーザのシード

const backendDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../backend'
);

export default function globalSetup() {
  execSync('pnpm exec prisma migrate deploy', {
    cwd: backendDir,
    stdio: 'pipe',
  });
  execSync('pnpm exec tsx -r tsconfig-paths/register script/e2e_seed.ts', {
    cwd: backendDir,
    stdio: 'pipe',
  });
}
