# ADR: サーバは service / repository 層を作らず「route → tx を受け取るモデル関数 → 純粋関数」の 3 層にする

- 状態: **採用**(2026-07-10、Phase 1)
- 関連: `backend/eslint-rules/`(`local/no-unused-tx-param` がこの層構造を強制する)

## 背景

層を増やすほど「どこに書くべきか」の判断が増え、エージェントは既存コードから読み取れないルールを推測することになる。一方で「全部 route に書く」も破綻する。分ける軸を **1 本だけ**決めて、それ以外の階層を作らないのが本方針。

## 決定

### 分離軸は「純粋関数 vs IO」のみ

```
route(routes/api/**/<リソース>.<メソッド>.ts)
  → tx を受け取るモデル関数(models/*.ts)
    → 純粋関数(同ファイル内)
```

**service 層・repository 層は作らない。** 参照実装は users CRUD(`routes/api/private/users.*.ts` → `models/users.ts`)。

| 層 | 責務 | 見分け方 |
|---|---|---|
| route | HTTP の入出力、Zod スキーマ、認可 | ファイル名が URL とメソッドに対応 |
| モデル関数 | DB アクセス。**`tx` を引数で受け取る**(自分で開かない) | 第 1 引数が `tx: NestablePrismaTransaction` |
| 純粋関数 | 計算・組み立て・検証 | **`tx` を受け取らない** |

### リクエスト全体をトランザクションで包む

これは維持する。その代わり、**トランザクション内での外部 I/O を実行時に禁止**する(`assertNotInTransaction`)。tx 内でメール送信や SSM 取得を行うと、ロールバック時に取り消せない副作用が残り、tx を長時間保持することになるため。SES / SSM のクライアント入口で AsyncLocalStorage の tx コンテキストを検査して throw する。

### トランザクションはネスト可能にする

`nestableTransaction` / `nestableTransactionWithTenantId` は AsyncLocalStorage でネストを許す。分離レベルは READ COMMITTED、タイムアウトは既定 5 秒(`opts.timeoutMs` で延長可、3 秒超で警告ログ)。

**モデル関数が自分で tx を開くこと自体は禁止しない。** キャッシュ付きの取得(`models/debugParams.ts` / `models/tenantConfig.ts`)のように、route の tx の外から呼ばれるものがあるため。

### 層の取り違えを lint で検出する

`local/no-unused-tx-param`(`backend/eslint-rules/`)が **使っていない `tx` 引数を error** にする。「純粋関数なら tx を受け取らない」を機械的に強制する。`@typescript-eslint/no-unused-vars` は既定の `args: 'after-used'` で先頭の未使用引数を見逃すため、その穴を埋める。

## 却下した選択肢

- **service / repository 層の追加**: 判断点が増えるだけで、この規模では得るものがない
- **platform / app のディレクトリ分離**: 1-14 で **一度実装したうえで撤回**した(ESLint の境界ルールと編集禁止の CLAUDE.md まで作ったが、platform という概念階層を入れない方針にユーザー判断で転換)。基盤コードは通常の `libs` / `plugins` / `models` に置き、編集境界はディレクトリではなく運用とレビューで扱う

## エージェント向けの注意

- 「関心の分離のため」に **service 層 / repository 層 / usecase 層を新設しないこと**。分離軸は「純粋関数 vs IO」だけ
- DB に触る関数は **`tx` を引数で受け取る**。route が開いた tx を引き回すのが基本形
- トランザクション内でメール送信・外部 API 呼び出しをしない(実行時に落ちる)
- 純粋関数に `tx` を渡さない(lint が error にする)
