// 開発用サンプルデータ: 一覧の検索・ページネーション・テナント分離を
// 画面から確認できるだけのユーザとテナントを作る。
//
// Usage:
//   pnpm script script/seed_dev.ts
//   (backend/ で実行。`script` は tsconfig paths を解決するラッパー)
//
// **パスワードは `pass` + loginId**(例: loginId `demo-member-01` → `passdemo-member-01`)。
// 手で入力して試せることを優先した規則で、当然ながら推測可能。
// そのため **IS_LOCAL_DEVELOPMENT=true 以外では実行を拒否する**。
//
// 既に同じ loginId / tenantCode があれば作らない(冪等)。
// 本番相当の初期投入は script/seed.ts の担当で、こちらはそれを汚さないために分けている。

// 型だけの import は実行時に消えるので、下のガードより先に config.ts を走らせない
import type * as PrismaConnection from '@/libs/prisma-connection.js';

type Tx = Parameters<
  Parameters<typeof PrismaConnection.nestableTransactionWithTenantId>[1]
>[0];

// ---- ガードは「値の import より前」に置く。
// ESM の静的 import は巻き上げられるため、ここで static import を使うと
// config.ts が先に走って SSM 取得を 30 回リトライしてしまう(実測)。
// 値は下で動的 import する。
if (process.env.IS_LOCAL_DEVELOPMENT !== 'true') {
  console.error(
    'seed_dev.ts は開発用サンプルデータ(パスワードが `pass` + loginId)を作ります。' +
      'IS_LOCAL_DEVELOPMENT=true の環境でのみ実行できます。'
  );
  process.exit(1);
}

const { passwordHashGenerate, passwordHashValidate } = await import(
  '@/libs/cryptoUtils.js'
);
const { nestableTransactionWithTenantId } = await import(
  '@/libs/prisma-connection.js'
);

/** 開発用のパスワード規則: pass + loginId */
const devPassword = (loginId: string) => `pass${loginId}`;

const MEMBER_COUNT_DEMO = 25; // users 一覧の既定 perPage は 20 なので 2 ページになる
const MEMBER_COUNT_DEMO2 = 3;

type NewUser = {
  loginId: string;
  userName: string;
  role: 'ADMIN' | 'MEMBER';
};

const createUsers = async (tx: Tx, tenantId: string, users: NewUser[]) => {
  let created = 0;
  for (const u of users) {
    const existing = await tx.user.findFirst({
      where: { tenantId, loginId: u.loginId },
    });
    if (existing) {
      continue;
    }
    await tx.user.create({
      data: {
        tenantId,
        userName: u.userName,
        loginId: u.loginId,
        email: '',
        role: u.role,
        passwordHash: await passwordHashGenerate(devPassword(u.loginId)),
      },
    });
    created += 1;
  }
  return created;
};

await nestableTransactionWithTenantId('*', async (tx) => {
  // ---- 1. 既存の demo テナントに MEMBER を足す(一覧・検索・ページネーション用)
  const demo = await tx.tenant.findFirst({ where: { tenantCode: 'demo' } });
  if (!demo) {
    console.error(
      "tenant 'demo' がありません。先に script/seed.ts を実行してください。"
    );
    process.exit(1);
  }

  const demoMembers: NewUser[] = Array.from(
    { length: MEMBER_COUNT_DEMO },
    (_, i) => {
      const n = String(i + 1).padStart(2, '0');
      return {
        loginId: `demo-member-${n}`,
        userName: `デモ 太郎${n}`,
        role: 'MEMBER' as const,
      };
    }
  );
  const n1 = await createUsers(tx, demo.id, demoMembers);
  console.log(`tenant 'demo': ${n1} 名を追加(既存はスキップ)`);

  // seed.ts が作る admin だけはランダムな初期パスワードで、標準出力を
  // 遡らないと分からない(bootstrap をやり直すたびに変わる)。
  // 開発環境では全アカウントを同じ規則に揃えたいので、ここで上書きする。
  // seed.ts 側は本番の初期テナント投入にも使うため、あちらは変更しない
  const demoAdmin = await tx.user.findFirst({
    where: { tenantId: demo.id, loginId: 'admin' },
  });
  if (demoAdmin) {
    // 既に規則どおりなら何もしない。無条件に上書きすると、画面から変更した
    // パスワードが pnpm bootstrap のたびに黙って戻ってしまう
    const alreadyOk = await passwordHashValidate(
      demoAdmin.passwordHash,
      devPassword('admin')
    );
    if (!alreadyOk) {
      await tx.user.update({
        where: { tenantId: demo.id, id: demoAdmin.id },
        data: {
          passwordHash: await passwordHashGenerate(devPassword('admin')),
        },
      });
      console.log("tenant 'demo': admin のパスワードを規則どおりに上書き");
    }
  }

  // ---- 2. 2 つ目のテナント(テナント分離を画面から確認するため)
  let demo2 = await tx.tenant.findFirst({ where: { tenantCode: 'demo2' } });
  if (!demo2) {
    demo2 = await tx.tenant.create({
      data: { tenantName: 'デモテナント 2', tenantCode: 'demo2' },
    });
    console.log(`created tenant: ${demo2.tenantName} (${demo2.tenantCode})`);
  }

  const demo2Users: NewUser[] = [
    { loginId: 'demo2-admin', userName: '管理者(demo2)', role: 'ADMIN' },
    ...Array.from({ length: MEMBER_COUNT_DEMO2 }, (_, i) => {
      const n = String(i + 1).padStart(2, '0');
      return {
        loginId: `demo2-member-${n}`,
        userName: `デモ2 花子${n}`,
        role: 'MEMBER' as const,
      };
    }),
  ];
  const n2 = await createUsers(tx, demo2.id, demo2Users);
  console.log(`tenant 'demo2': ${n2} 名を追加(既存はスキップ)`);

  console.log('');
  console.log('パスワードはいずれも `pass` + loginId です');
  console.log('  demo  / admin          / passadmin');
  console.log('  demo  / demo-member-01 / passdemo-member-01');
  console.log('  demo2 / demo2-admin    / passdemo2-admin');
});

process.exit(0);
