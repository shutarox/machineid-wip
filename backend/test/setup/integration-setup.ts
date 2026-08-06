import { afterAll, beforeAll, beforeEach } from 'vitest';
import { createDbFromTemplate, dbUrlFor, workerDbName } from './pg.js';

// 統合テストの setupFile(テストファイルごとに実行される)。
//
// - worker 専用 DB を template から複製し、DB_URL を差し替える。
//   ※ DB_URL の設定は prisma-connection の import より前である必要があるため、
//     このファイルでは prisma-connection を静的 import しない(動的 import のみ)
// - 各テストの前に全テーブルを TRUNCATE してテスト間の独立性を保つ

const dbName = workerDbName();
process.env.DB_URL = dbUrlFor(dbName);

let tableNames: string[] = [];

beforeAll(async () => {
  createDbFromTemplate(dbName);

  const { prisma } = await import('@/libs/prisma-connection.js');
  const rows = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  );
  tableNames = rows.map((r) => r.tablename);
});

beforeEach(async () => {
  const { prisma } = await import('@/libs/prisma-connection.js');
  const list = tableNames.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`
  );
});

afterAll(async () => {
  const { prisma } = await import('@/libs/prisma-connection.js');
  await prisma.$disconnect();
});
