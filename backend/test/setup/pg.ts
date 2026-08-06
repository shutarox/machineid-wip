import { execFileSync } from 'node:child_process';

// テスト用 DB 名の導出と psql 実行ヘルパー。
// ベース接続情報は環境変数 DB_URL(bootstrap が生成する .envrc 由来)から取る。

const baseUrl = new URL(
  process.env.DB_URL ??
    'postgresql://appuser:testpass@pghost/machineid?connection_limit=20'
);

export const baseDbName = baseUrl.pathname.replace(/^\//, '');
export const templateDbName = `${baseDbName}_test_template`;

export const workerDbName = (): string =>
  `${baseDbName}_test_w${process.env.VITEST_POOL_ID ?? '0'}`;

export const dbUrlFor = (dbName: string): string => {
  const url = new URL(baseUrl);
  url.pathname = `/${dbName}`;
  return url.toString();
};

// 管理系 SQL(CREATE/DROP DATABASE 等)を postgres データベースに対して実行する
export const runAdminSql = (sql: string): string => {
  return execFileSync(
    'psql',
    [
      '-h',
      baseUrl.hostname,
      '-U',
      decodeURIComponent(baseUrl.username),
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-tAc',
      sql,
    ],
    {
      env: {
        ...process.env,
        PGPASSWORD: decodeURIComponent(baseUrl.password),
      },
      encoding: 'utf8',
    }
  );
};

// template からの複製は「template に接続がない瞬間」を要求するため、
// 並列 worker の起動タイミングによっては失敗する。リトライで吸収する
export const createDbFromTemplate = (dbName: string): void => {
  runAdminSql(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  let lastError: unknown;
  for (let i = 0; i < 20; i++) {
    try {
      runAdminSql(`CREATE DATABASE "${dbName}" TEMPLATE "${templateDbName}"`);
      return;
    } catch (e) {
      lastError = e;
      // 短い待ちで再試行(他 worker が template を複製中)
      execFileSync('sleep', [String(0.2 + Math.random() * 0.3)]);
    }
  }
  throw lastError;
};
