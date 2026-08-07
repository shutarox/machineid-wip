// DB の初期化: アプリ用ロールとデータベースを作り直す
//
// Usage:
//   ローカル: pnpm script script/db_bootstrap.ts
//   本番:     ./deploy/run_task.sh 'node /app/backend/build/script/db_bootstrap.js'
//
// **移行ではなく作り直す。** 既存のデータベースとロールを DROP してから CREATE する。
// 手順の再現性を優先しているため、**データは失われる**。
//
// なぜ必要か:
//   RDS は作成時にマスターユーザ(postgres)所有のデータベースを作る。そのまま使うと
//   アプリが rds_superuser 相当の権限で動くことになる。アプリ用のロール(appuser)を
//   作り、そのロースが所有するデータベースに作り直すことで最小権限に寄せる。
//   ローカル / CI も appuser なので、環境差も減る。
//
// 秘密情報の扱い:
//   マスターとアプリのパスワードは **SSM から直接読む**(タスクロールの権限)。
//   run-task の containerOverrides に載せると describe-tasks で読めてしまうため。
//
// 実行前に:
//   **サービスを停止しておくこと**(`aws ecs update-service --desired-count 0`)。
//   DROP DATABASE は WITH (FORCE) で接続を切るが、動いているアプリが即座に
//   再接続してくるとロールの作り直しに失敗しうる。

import { getParameters } from '@/libs/ssmClient.js';
import { Client } from 'pg';
import { exit } from 'process';

const SSM_PREFIX = (process.env.SSM_KEY_PREFIX ?? '/machineid-keys').replace(
  /\/+$/,
  ''
);
const MASTER_PASSWORD_KEY = `${SSM_PREFIX}/DB_MASTER_PASSWORD`;
const APP_PASSWORD_KEY = `${SSM_PREFIX}/DB_PASSWORD`;

const APP_USER = 'appuser';
const MASTER_USER = 'postgres';

// 接続先(ホスト・ポート・データベース名)は DB_URL から借りる。
// **このデータベースはこれから作り直すので、まだ存在していなくてよい**
if (!process.env.DB_URL) {
  throw new Error('DB_URL が設定されていません');
}
const target = new URL(process.env.DB_URL);
const dbName = target.pathname.replace(/^\//, '');
if (!dbName) {
  throw new Error(`DB_URL からデータベース名を取り出せません: ${target.host}`);
}

const params = await getParameters([MASTER_PASSWORD_KEY, APP_PASSWORD_KEY]);
const masterPassword = params[MASTER_PASSWORD_KEY];
const appPassword = params[APP_PASSWORD_KEY];

if (!masterPassword) {
  throw new Error(`${MASTER_PASSWORD_KEY} が SSM にありません`);
}
if (!appPassword) {
  throw new Error(`${APP_PASSWORD_KEY} が SSM にありません`);
}

// 管理接続はメンテナンス用の postgres データベースへ。
// 対象データベースに繋いだままでは DROP できないため
const admin = new Client({
  host: target.hostname,
  port: Number(target.port || 5432),
  user: MASTER_USER,
  password: masterPassword,
  database: 'postgres',
  // RDS は SSL 必須(rds.force_ssl=1)。CA はイメージに同梱していて
  // NODE_EXTRA_CA_CERTS で信頼させているので、既定の検証で通る
  ssl: process.env.NODE_EXTRA_CA_CERTS ? {} : undefined,
});

await admin.connect();
console.log(`接続しました: ${MASTER_USER}@${target.hostname}/postgres`);

try {
  // WITH (FORCE) は接続中のセッションを切ってから削除する(PostgreSQL 13 以降)
  console.log(`DROP DATABASE IF EXISTS ${dbName} ...`);
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);

  console.log(`DROP ROLE IF EXISTS ${APP_USER} ...`);
  await admin.query(`DROP ROLE IF EXISTS "${APP_USER}"`);

  console.log(`CREATE ROLE ${APP_USER} ...`);
  // パスワードは SQL 文字列に入れず、パラメータ化もできない(CREATE ROLE の制約)ため
  // format() 相当の安全なクォートを自前で行う
  const quoted = `'${appPassword.replace(/'/g, "''")}'`;
  await admin.query(`CREATE ROLE "${APP_USER}" LOGIN PASSWORD ${quoted}`);

  // **RDS のマスターは真の superuser ではない**(rds_superuser)。
  // 他ロールが所有するオブジェクトを作るには、そのロールのメンバーである必要がある。
  // これが無いと `must be able to SET ROLE "appuser"` で失敗する(実測)
  console.log(`GRANT ${APP_USER} TO ${MASTER_USER} ...`);
  await admin.query(`GRANT "${APP_USER}" TO "${MASTER_USER}"`);

  console.log(`CREATE DATABASE ${dbName} OWNER ${APP_USER} ...`);
  await admin.query(`CREATE DATABASE "${dbName}" OWNER "${APP_USER}"`);
} finally {
  await admin.end();
}

// public スキーマの所有権も移す。
// PostgreSQL 15 以降、public スキーマの既定の所有者は pg_database_owner だが、
// prisma migrate が CREATE TABLE できるよう明示的に付け替えておく
const created = new Client({
  host: target.hostname,
  port: Number(target.port || 5432),
  user: MASTER_USER,
  password: masterPassword,
  database: dbName,
  ssl: process.env.NODE_EXTRA_CA_CERTS ? {} : undefined,
});

await created.connect();
try {
  await created.query(`ALTER SCHEMA public OWNER TO "${APP_USER}"`);
  console.log(`ALTER SCHEMA public OWNER TO ${APP_USER}`);
} finally {
  await created.end();
}

console.log('');
console.log('完了しました。続けて次を実行してください:');
console.log('  1. マイグレーション: prisma migrate deploy');
console.log('  2. 初期シード:       node build/script/seed.js');
exit(0);
