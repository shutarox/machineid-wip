# Phase 4-1: custom ESLint rules 実装計画

作成: 2026-08-04

## 背景と目標

workplan の 4-1。基本原則 1「機械的に強制できるものはコード(型・lint・実行時 assert・CI)に、判断が要るものだけルール(CLAUDE.md)に」に沿って、これまで文章でしか書かれていない規約を lint で強制する。

workplan の 4-1 は 3 項目を挙げているが、**getLock の項目はユーザー判断で取り下げる**(ルール化しない)。残る 2 項目を実装する。

## 確定した方針(2026-08-04、ユーザー判断)

| 論点 | 決定 |
|---|---|
| getLock は最外 tx 先頭 | **ルール化しない**。機能とテストは残すが、CLAUDE.md の言及 2 箇所は一般的な表現に書き換える |
| models の純粋関数は tx 禁止 | **未使用の `tx` 引数を禁止**する形で実装(= 純粋関数なら tx を受け取るな) |
| 絶対パスリテラル禁止 | **backend のみ**に適用 |

## 現状の把握

- backend の ESLint は `backend/eslint.config.mjs`(FlatCompat 経由の旧スタイル)。カスタムルールは未使用
- `@typescript-eslint/no-unused-vars` は既定の `args: 'after-used'` で動くため、**先頭の未使用 `tx` を見逃す**。ここに custom rule の価値がある
- 絶対パスリテラルは**現状 0 件**。`backend/src/libs/repoRoot.ts` にヘルパーがあり、コメントで「絶対パスのリテラルではなく必ずこのヘルパーを経由すること」と明記済み。lint は将来の混入を防ぐガードになる
- models は `tx` を受け取る関数(`users.ts` の `listUsers` 等)と、自分で `nestableTransactionWithTenantId` を開く関数(`debugParams.ts` / `tenantConfig.ts` のキャッシュ付き取得)が併存する。**後者を壊さないため、DB アクセス自体は禁止しない**

## 実装

### 1. `local/no-unused-tx-param`(custom rule)

`backend/eslint-rules/no-unused-tx-param.mjs` に新規作成し、`eslint.config.mjs` で `plugins: { local: { rules: { ... } } }` として登録する(flat config はローカルプラグインをインラインで持てるので追加依存は不要)。

- 対象: `FunctionDeclaration` / `FunctionExpression` / `ArrowFunctionExpression`
- 検出: 引数に `tx` という Identifier があり、**関数内から一度も参照されていない**場合に error
- 判定はスコープ解析で行う(`context.sourceCode.getScope(node)` から変数 `tx` を引き、`references` が空か)
- メッセージ: 純粋関数は `tx` を受け取らないこと(使わない `tx` は層の取り違えのサイン)

### 2. 絶対パスリテラル禁止(core ルールで実装)

custom rule は書かず、**`no-restricted-syntax`** で実装する。維持するコードが減り、雛形として読みやすいため。

- セレクタで `Literal` の値がファイルシステムの絶対パスに見えるもの(`/app/` `/home/` `/Users/` `/workspace/` 始まり)を検出する
- **`/api/...` のような URL パスは対象外**にする(backend には多数あるため、`^/` の一括禁止は不可)
- メッセージで `repoRoot()`(`backend/src/libs/repoRoot.ts`)へ誘導する

### 3. 既存 lint 設定の掃除(同 PR で)

`eslint.config.mjs` の `no-restricted-globals` のメッセージが、**存在しないファイル `@/utils/globalsCompat` を案内している**(1-12 の位置非依存化で消えたまま残った)。メッセージを実態に合わせる。

### 4. ドキュメント

- **`CLAUDE.md`**
  - テスト節の `(RLS / @db.Date 正規化 / getLock / tx 内 I/O ガード)` → getLock を一般的な表現(排他制御)に
  - トランザクション節の「分離レベルは READ COMMITTED(`getLock` の排他制御を機能させるため)」→「行ロックによる排他制御を機能させるため」。**根拠の説明自体は残す**(消すと分離レベル選定の理由が失われるため)
  - 新しく強制される 2 ルールを「機械的に強制されていること」として明記する
- 雛形化の作業計画(**当時のファイル。まっさら化に伴い削除済み**)にも、getLock 項目を取り下げた旨と理由を残す

## 検証

- ルールが**実際に発火すること**を確認する(設定しただけで効いていない事故を防ぐ)。使い捨ての fixture を作って `pnpm exec eslint` にかけ、確認後に削除する

| fixture | 期待 |
|---|---|
| 未使用 `tx` を持つ関数 | `local/no-unused-tx-param` が error |
| `tx` を使っている既存コード | 発火しない |
| `'/app/foo'` のような絶対パスリテラル | `no-restricted-syntax` が error |
| `'/api/private/users'` のような URL パス | 発火しない |

- `pnpm verify` 緑(既存コードが 1 件も新ルールに引っかからないこと = 現状の実装が規約どおりであることの確認も兼ねる)

## このスコープに含めないもの

- getLock 機能そのものの削除(ユーザー判断で温存)
- frontend / e2e / tools への絶対パスルール適用
- 4-2 以降(CLAUDE.md 再構成、ADR 整理、knip 導入、雛形 README)
