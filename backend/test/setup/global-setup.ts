import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dbUrlFor, runAdminSql, templateDbName } from './pg.js';

// 統合テストの globalSetup(テストプロセス群の起動前に 1 回だけ実行)。
// template database を作り直してマイグレーションを適用する。
// 各 worker はここから CREATE DATABASE ... TEMPLATE で自分専用 DB を複製する。

const backendDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

export default function globalSetup() {
  runAdminSql(`DROP DATABASE IF EXISTS "${templateDbName}" WITH (FORCE)`);
  runAdminSql(`CREATE DATABASE "${templateDbName}"`);

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: backendDir,
    env: { ...process.env, DB_URL: dbUrlFor(templateDbName) },
    stdio: 'pipe',
  });
}
