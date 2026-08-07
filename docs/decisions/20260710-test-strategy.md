# ADR: DB はモックせず、実 PostgreSQL の統合テストを主軸にする

- 状態: **採用**(2026-07-10、Phase 2)
- 関連: `docs/agent-traps.md`(この方針で自走できるかを確かめた受け入れテストの記録)

## 背景

この雛形の中心にあるのは Prisma クライアント拡張(マルチテナント RLS 検査、`@db.Date` の JST 正規化、トランザクション制御)で、いずれも **DB の実挙動と噛み合って初めて意味を持つ**。DB をモックすると、これらの拡張が壊れていてもテストは緑のままになる。

実際、Phase 2 でテストを組む過程で **RLS 拡張が PostgreSQL 移行時から実質無効だった**(スキーマ照合のフィールド名齟齬)ことを含む 3 件の重大バグを検出した。モックしていたら発見できなかった。

## 決定

**DB はモックしない。実 PostgreSQL に対する統合テストを主軸にする。** モック注入点は SES(メール)/ SSM のような外部サービスに限る。

| 層 | 対象 | 場所 |
|---|---|---|
| ユニット | 純粋関数(DB 不要) | `backend/src/**/*.test.ts`(ソース併置) |
| 統合 | 実 PG。基盤のリグレッションとルートの `fastify.inject` | `backend/test/integration/` |
| E2E | ブラウザ経由の一巡 | `e2e/*.spec.ts`(Playwright) |

### 統合テストの隔離方式

worker ごとに **template database から専用 DB を複製**し、テストごとに TRUNCATE する。開発 DB には触れない。この方式で 1 テストあたり約 3 秒に収まっており、速度を理由にモックへ逃げる必要がない。

### 基盤のリグレッション網(`test/integration/framework/`)

雛形の目玉である拡張は、専用のテストで挙動を固定する。

| ファイル | 固定している挙動 |
|---|---|
| `rls.test.ts` | テナント分離の強制(where / data の tenantId 検査) |
| `dbDate.test.ts` | `@db.Date` の JST 正規化 |
| `txGuard.test.ts` | トランザクション内での外部 I/O 禁止(`assertNotInTransaction`) |
| `getLock.test.ts` | 行ロックによる排他制御 |
| `testPlacement.test.ts` | ルートテストの配置が `src/routes/` と 1:1 であること |

### ルートテストの配置強制

`test/integration/routes/` は `src/routes/` と**ディレクトリ階層・ファイル名とも 1:1 対応**させる(例: `src/routes/api/private/users.GET.ts` → `test/integration/routes/api/private/users.GET.test.ts`)。共通ヘルパーは `_` 始まりでミラー対象外。**ずれは `testPlacement.test.ts` が検出する**ので、規約ではなくテストが強制する。

## 検証

`pnpm verify`(check + lint + test + e2e)が CI と同一。**「verify を通せ」が全作業の完了条件**。

## 却下した選択肢

- **DB のモック / インメモリ実装**: 上記のとおり、この雛形で最も壊れると困る部分が検証されなくなる
- **PGlite(組み込み PG)**: 3a で community adapter を使って動作確認まで行ったが**採用見送り**。現行の実 PG worker ハーネスが約 3 秒と十分速く、依存を増やす利得がなかった
- **テストごとのロールバック**: TRUNCATE で足りており、ネストしたトランザクションの扱いが複雑になるだけだった

## エージェント向けの注意

「テストを速くするため」「CI で DB を用意しなくて済むように」といった理由で **DB のモック化を提案しないこと**。速度は worker ごと DB + template database で既に解決している。外部サービス(SES / SSM)以外にモックを足す必要がある場合は、まず設計を疑う。
