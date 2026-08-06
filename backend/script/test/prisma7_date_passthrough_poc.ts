// Prisma 7 driver adapter での @db.Date 文字列パススルー PoC(workplan 3a)
//
// 目的: pg の型パーサをカスタムして DATE (oid 1082) を 'YYYY-MM-DD' 文字列のまま
// 返した場合、Prisma client がそれをパススルーするか(= 日時正規化拡張を
// 丸ごと削除できるか)を検証する。
//
// Usage: pnpm exec tsx -r tsconfig-paths/register script/test/prisma7_date_passthrough_poc.ts

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client.js';
import pg from 'pg';

const DATE_OID = 1082;

const connectionString = process.env.DB_URL!;

// --- 1. 素の pg で型パーサの効果を確認(ベースライン)

// DATE (oid 1082) だけ identity にした型パーサ
const types = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getTypeParser: ((oid: number, format?: any) =>
    oid === DATE_OID
      ? (value: string) => value
      : // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
        (pg.types.getTypeParser as any)(oid, format)) as pg.CustomTypesConfig['getTypeParser'],
};

const pool = new pg.Pool({ connectionString, types });

const raw = await pool.query(`SELECT '2026-07-10'::date AS d`);
console.log(
  `[pg 直接] typeof=${typeof raw.rows[0].d} value=${JSON.stringify(raw.rows[0].d)}`
);

// --- 2. その Pool を adapter として Prisma client に渡した場合

const adapter = new PrismaPg(pool);
const client = new PrismaClient({ adapter });

// RLS 拡張なしの素の client なのでテーブルへ直接アクセスできる
await client.dateExample.deleteMany({});
const tenant = await client.tenant.findFirst({});
if (!tenant) {
  console.log('tenant がないため中断(seed を先に実行してください)');
  process.exit(1);
}

// 書き込み: Prisma は Date しか受けない想定だが、文字列も試す
await client.dateExample.create({
  data: {
    tenantId: tenant.id,
    date: new Date('2026-07-10T00:00:00+09:00'),
  },
});

const viaPrisma = await client.dateExample.findFirst({});
console.log(
  `[Prisma 経由] typeof=${typeof viaPrisma!.date} instanceof Date=${viaPrisma!.date instanceof Date} value=${JSON.stringify(viaPrisma!.date)}`
);

// DB 上の生値
const rawStored = await pool.query(`SELECT date::text AS d FROM date_examples`);
console.log(`[DB 生値] ${rawStored.rows[0].d}`);

// 文字列での書き込みも試す(型は嘘になるが実行時に通るか)
try {
  await client.dateExample.create({
    data: {
      tenantId: tenant.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      date: '2026-07-11' as any,
    },
  });
  const stored = await pool.query(
    `SELECT date::text AS d FROM date_examples ORDER BY d`
  );
  console.log(
    `[文字列書き込み] 成功: ${stored.rows.map((r: { d: string }) => r.d).join(', ')}`
  );
} catch (e) {
  console.log(`[文字列書き込み] 失敗: ${(e as Error).message.slice(0, 120)}`);
}

await client.dateExample.deleteMany({});
await client.$disconnect();
process.exit(0);
