#!/usr/bin/env node
// リポジトリのブートストラップ:
//   ディレクトリ名から DB 名・ポートを導出 → .envrc 生成 → DB 作成 + migrate + seed
//
// 同一コンテナ内に複数の clone / worktree を置いて並列作業するための仕組み。
// PG コンテナは共有し、database をコピーごとに分離する。
//
// 導出規則:
//   - ディレクトリ名 'app'(主クローン)→ DB 'myapp'、ポート 8080/8800、PM2 名 backend/frontend
//   - 'app<N>' → DB 'myapp_app<N>'、ポート 8080+2N/8800+2N、PM2 名 backend-app<N>/frontend-app<N>
//   - その他 → DB 'myapp_<名前>'、ポートは名前のハッシュから導出
//
// Usage: pnpm bootstrap   (リポジトリルートで実行)

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const root = process.cwd();
if (!fs.existsSync(path.join(root, 'pnpm-workspace.yaml'))) {
  console.error('リポジトリルート(pnpm-workspace.yaml のある場所)で実行してください');
  process.exit(1);
}

const DB_HOST = 'pghost';
const DB_USER = 'appuser';
const DB_PASSWORD = 'testpass';

const dirName = path.basename(root);
const sanitized = dirName.toLowerCase().replace(/[^a-z0-9]/g, '_');

let dbName;
let offset;
if (dirName === 'app') {
  dbName = 'myapp';
  offset = 0;
} else {
  dbName = `myapp_${sanitized}`;
  const numMatch = dirName.match(/(\d+)$/);
  if (numMatch) {
    offset = Number(numMatch[1]) * 2;
  } else {
    // 名前から決定的にポートオフセットを導出(2〜98 の偶数)
    let hash = 0;
    for (const ch of sanitized) {
      hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    }
    offset = ((hash % 49) + 1) * 2;
  }
}

const backendPort = 8080 + offset;
const frontendPort = 8800 + offset;
const pm2Suffix = offset === 0 ? '' : `-${sanitized}`;
const dbUrl = `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}/${dbName}?connection_limit=20`;

console.log(`dir:      ${dirName}`);
console.log(`database: ${dbName}`);
console.log(`ports:    backend=${backendPort} frontend=${frontendPort}`);

// ---- .envrc 生成(direnv)

const envrc = `# pnpm bootstrap が生成したファイル(git 管理外)。手で編集してもよい
export DB_URL='${dbUrl}'
export BACKEND_PORT=${backendPort}
export FRONTEND_PORT=${frontendPort}
export PM2_BACKEND_NAME=backend${pm2Suffix}
export PM2_FRONTEND_NAME=frontend${pm2Suffix}
`;
fs.writeFileSync(path.join(root, '.envrc'), envrc);
console.log('generated: .envrc');
try {
  execFileSync('direnv', ['allow', root], { stdio: 'inherit' });
} catch {
  console.warn('direnv allow に失敗しました(手動で `direnv allow` を実行してください)');
}

// ---- DB 作成(存在しなければ)

const psqlEnv = { ...process.env, PGPASSWORD: DB_PASSWORD };
const dbExists = execFileSync(
  'psql',
  ['-h', DB_HOST, '-U', DB_USER, '-d', 'postgres', '-tAc',
    `SELECT 1 FROM pg_database WHERE datname = '${dbName}'`],
  { env: psqlEnv }
).toString().trim() === '1';

if (dbExists) {
  console.log(`database '${dbName}' は既に存在します`);
} else {
  execFileSync('createdb', ['-h', DB_HOST, '-U', DB_USER, dbName], {
    env: psqlEnv,
    stdio: 'inherit',
  });
  console.log(`database '${dbName}' を作成しました`);
}

// ---- マイグレーション + シード(このプロセスから DB_URL を明示して実行)

const childEnv = { ...process.env, DB_URL: dbUrl };
const backendDir = path.join(root, 'backend');

execFileSync('pnpm', ['db:migrate:deploy'], {
  cwd: backendDir,
  env: childEnv,
  stdio: 'inherit',
});

execFileSync('pnpm', ['exec', 'tsx', '-r', 'tsconfig-paths/register', 'script/seed.ts'], {
  cwd: backendDir,
  env: childEnv,
  stdio: 'inherit',
});

// 開発用サンプルデータ(一覧・検索・ページネーション・テナント分離を画面で確認するため)。
// パスワードが `pass` + loginId の推測可能なアカウントを作るので、
// seed_dev.ts 側で IS_LOCAL_DEVELOPMENT=true 以外は拒否している。
// bootstrap 自体がローカル専用ツール(ディレクトリ名から DB 名とポートを導出する)なので、
// ここから呼ぶのは安全
execFileSync(
  'pnpm',
  ['exec', 'tsx', '-r', 'tsconfig-paths/register', 'script/seed_dev.ts'],
  { cwd: backendDir, env: childEnv, stdio: 'inherit' }
);

console.log('');
console.log('bootstrap 完了。新しいシェルを開くか `direnv reload` で環境変数が反映されます');
