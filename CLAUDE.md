# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

このファイルは**全体地図と判断基準**だけを持つ。**手順は `.claude/skills/` のスキル**に、**決定の根拠は `docs/decisions/`(ADR)** にある。

## プロジェクト概要

**`machineid`** — 雛形リポジトリ **`myapp`** から派生した案件用リポジトリ。AI エージェント駆動開発を前提としたマルチテナント Web アプリケーションで、認証・マルチテナント RLS・型生成パイプライン・users CRUD 参照実装を雛形から引き継いでいる。

**設計を変える提案をする前に、該当の ADR を読むこと。** 「却下した選択肢」に既出のことが多い。

### 現在のフェーズ: 初期カスタマイズ中(まっさら化の手前)

このリポジトリは作業用の `machineid-wip` で、**初期カスタマイズが終わったら git 履歴と GitHub Project を捨て、初期コミット 1 つだけの新リポジトリ `machineid` に移す**(= まっさら化)。段取りと現在地は **`docs/plans/20260806-derive-first-project.md`**。

**まっさら化の前に完了させるもの**: AWS 基本設定(terraform)/ アプリの要件そぎ落とし / **ドキュメントの案件化** / 痕跡・秘密情報の検査。

そのため、**docs には雛形(`myapp`)としての記述がまだ残っている**。「この雛形は」「案件で使うときは」という視点の文章を見つけたら、それは**書き換え対象の残骸**であって現行の方針ではない。特に `docs/template-repo-workplan.md` と `docs/plans/` の大半は雛形を作った経緯の記録で、まっさら化のときに削除する。

**雛形側の不備を見つけたら `docs/plans/20260806-derive-first-project.md` の「myapp に還元する項目」に追記すること。** 派生側の git 履歴は捨てるので、書き残さないと `myapp` に戻せない。

DB は **PostgreSQL**(ローカルは docker compose の postgres:18)。コンテナは `TZ=Asia/Tokyo` で動作する。パッケージマネージャーは **pnpm**(`only-allow pnpm` で強制)。ルートは pnpm workspace(`backend` + `frontend`)で、`pnpm check` / `lint` / `test` / `dev` / `stop` はルートから両パッケージに対して実行できる。

## 最初に見るところ

| やりたいこと | 参照先 |
|---|---|
| DB スキーマを変える | スキル **`db-schema-change`** |
| API を足す・変える | スキル **`add-api-endpoint`** |
| 変更を検証する / knip を読む | スキル **`verify`** |
| 計画・決定・保留を記録する | スキル **`record-docs`** |
| リソースを 1 つ追加する | **users CRUD を読んで写す**(下記「層構造と参照実装」) |
| ファイルをアップロードする / ロールで見える行を変える | **報告書 CRUD を読んで写す**(下記「層構造と参照実装」) |
| なぜこの構成なのか知る | `docs/decisions/`(索引は `docs/decisions/README.md`) |
| 環境を立ち上げる | `README.md` / `docs/dev-container.md` |
| 未対応と分かっている問題を知る | `docs/known-issues.md` |
| **過去にエージェントが踏んだ罠を知る** | `docs/template-repo-workplan.md` の**受け入れテスト実施記録**(前任者が詰まった箇所の一覧) |
| まっさら化までの段取り・現在地を知る | `docs/plans/20260806-derive-first-project.md` |
| AWS 本番環境を作る | `docs/plans/20260806-aws-prod-setup.md`(決定は `docs/decisions/20260806-aws-*.md`) |

スキル本体は `.claude/skills/<名前>/SKILL.md`。**スキル機構が使えない環境でも、このパスを直接読めばよい。**

**「`pnpm verify` を通せ」が全作業の完了条件。**

## 作業のルール

- コミットメッセージは**日本語 1 行のみ**(本文や Co-Authored-By 等のトレーラーは付けない)
- まとまった作業(機能追加・リファクタ・複数コミットになる変更)は**ブランチを切って PR**。main への直コミットは docs 等の軽微な単発変更のみ
- **修正は commit 手前で終了してユーザーの確認をあおぐ**(verify を通した状態で差分を提示し、承認を得てから commit / push / PR)
- **まとまった削除やリファクタのあとは `pnpm knip` を流す**。CI では実行されない。報告は削除リストではなく点検リストとして扱う(読み方はスキル `verify`)
- **計画・決定・保留は必ず docs に残す。** 計画 → `docs/plans/`、決定 → `docs/decisions/`、保留 → `docs/known-issues.md`(書き方はスキル `record-docs`)。口頭の指摘は次のセッションに残らない
- 環境変更を伴う作業(system パッケージ・グローバル CLI・ブラウザ依存の追加インストール)は、**`docker/Dockerfile.local` にも同じ変更を反映する**。`/home/appuser`(永続ボリューム)以外のルート FS 上の変更はイメージに焼かないとコンテナ再作成でロールバックされる。実行時に `sudo apt` / `playwright install` で済ませず「イメージを唯一の真実」に保つ
- **`docker/` 配下(compose / Dockerfile.local / onstart)を変えたら、コンテナに反映するには「コミット → ホスト clone へ push」が要る。** コンテナ内 clone(`~/app`)の未コミットの変更はホスト clone に届かず、**compose を読むのはホスト clone のほう**なので、編集しただけでは何も変わらない。ホスト側で `docker compose` を叩く前に:

  ```bash
  # --- コンテナ内(~/app)---
  git add -A && git commit -m '...'          # push が送るのはコミットだけ
  git -C /host/app checkout -- .             # 一時上書きが残っていると push が拒否される
  git push -f host HEAD:docker-ops           # docker-ops は使い捨ての受け渡しチャンネル
  ```

  ```bash
  # --- ホスト側(ホスト clone のルート)---
  docker compose -f docker/docker-compose.local.yml up -d --force-recreate dev-local
  # 他サービスだけ作り直すなら(dev コンテナに触れずセッションを維持できる):
  docker compose -f docker/docker-compose.local.yml up -d --no-deps minio
  ```

  **コンテナ内からでも `sudo docker` は叩ける**(docker.sock は root 所有なので `sudo` が要る。パスワードなし sudo が使える)。イメージのビルドや `docker ps` はコンテナ内で完結する。**ただし dev コンテナ自身の再作成だけはユーザーに依頼する** — 実行したコマンドごと自分を殺すことになるため。試行錯誤中は push を挟まず `/host/app` へ直接 cp するショートカットもあるが、**その一時上書きを消さないと次の push が通らない**。詳細と背景は `docs/dev-container.md` の「手順 1」
- **Context7 の使いどころ**: 外部ライブラリ/API の仕様が不確かなとき、セットアップ手順やバージョン差を疑うときに、該当箇所だけ参照する。まずコードベースを見て判断し、必要なときだけ呼ぶ。取得した情報は要点と短いコード例に要約する。接続設定はリポジトリ直下の `.mcp.json`(HTTP transport / `https://mcp.context7.com/mcp`)。API キーなしの匿名利用で動くが、レート制限に当たるようなら各自の `~/.claude.json` 側でヘッダ付きの設定に差し替える

## アーキテクチャ

### 層構造と参照実装

**route → tx を受け取るモデル関数 → 純粋関数**、の 3 層。**service / repository 層は作らない**(ADR `20260710-server-layering.md`)。

見本は users CRUD。新しいリソースを足すときは**これを読んで写す**のが最短で、実際に受け入れテストでもそう機能している。

```
backend/src/routes/api/private/users.{GET,POST,PATCH}.ts   route(Zod スキーマ・認可)
  └ backend/src/models/users.ts                            モデル関数 → 純粋関数
backend/test/integration/routes/api/private/users.*.test.ts  ルートテスト(src と 1:1)
frontend/src/pages/UsersAdmin.tsx                          画面
```

users CRUD が持っていない要素(**ファイルアップロード・DELETE ルート・ロールによる行レベルの可視範囲**)は、報告書 CRUD が見本になる。判断の経緯は `docs/plans/20260805-s3-image-upload.md`。

```
backend/src/routes/api/private/uploadedImages.{POST,DELETE}.ts  multipart 受け取り・仮アップロード
backend/src/routes/api/private/reports.{GET,POST,DELETE}.ts     ロールで可視範囲が変わる CRUD
  └ backend/src/models/reports.ts                               buildReportListWhere(可視範囲)
  └ backend/src/models/uploadedImages.ts                        sharp の加工・S3 操作
backend/src/libs/storage.ts                                     S3 の注入点(テストはフェイク)
backend/script/cleanup_uploads.ts                               仮アップロードの 3 日タイムアウト回収
frontend/src/pages/Reports.tsx / ReportNew.tsx                  一覧 / 送信フォーム
e2e/reports.spec.ts                                             **実 S3(MinIO)を通す唯一の経路**
```

判断が要る場面の既定:

- **ロールによって見える行を変えるとき**は、route で分岐せず**モデルの純粋関数(where ビルダー)に寄せる**(`buildUserSearchWhere` に倣う)。route は条件を渡すだけにする
- **操作者の属性(ロール等)が必要なとき**は、`req` に載っているのが `tenantId` / `userId` だけなので、`models/users.ts` に取得関数を足す(`requireAdmin` の隣に置く)
- **行レベルの可視範囲があるリソースでは、可視外の対象に 403 ではなく 404 を返す。** 403 は「その id は存在する」ことを漏らす。403 を使うのは**見えてはいるが操作は許されない**場合に限る(見本は `buildReportListWhere`。**一覧と単一取得に同じ where を通す**こと。分けると 403 と 404 が食い違う)
- **外部ストレージ(S3)の入出力は tx の外に出す。** `libs/storage.ts` の各入口が `assertNotInTransaction` で強制する。tx 内で書くとロールバック時にオブジェクトだけ残る。DB と S3 の順序は **DB を先**にする(逆順だと DB 失敗時にどこからも参照されないオブジェクトが残り、回収の手がかりが消える)

### バックエンド: ファイルベースのルート自動探索

`backend/src/routes/api/` 配下は `@fastify/autoload` が自動読み込みし、`parseRouteFromFileUrl()` がファイル名から URL とメソッドを解決する。

- ファイル名は **`<リソース>.<メソッド>.ts`**(例: `users.GET.ts`。GET/POST/PUT/PATCH/DELETE)
- `private/` 配下は認証済みセッションが必要
- リクエスト検証・レスポンスシリアライズは **Zod スキーマ**(`fastify-type-provider-zod`)
- **パスパラメータは使えない。** URL はファイル名から `/<リソース>` に決まるため `/users/:id` は表現できない。単一リソースの指定は **querystring か body の `id`**(PATCH は body、DELETE は querystring が扱いやすい)。**DELETE の参照実装は現時点で無い**

起動時(非本番環境)にバックエンドが Swagger から `openapi-schema.d.ts` を生成し、フロントエンドが直接インポートすることでエンドツーエンドの型安全性を実現している。

### バックエンド: lint で強制していること

文章のルールではなく **`pnpm lint` が error にする**もの。カスタムルールは `backend/eslint-rules/` に置き、`eslint.config.mjs` でローカルプラグイン(`local/`)として登録している(追加依存なし)。

| ルール | 内容 |
|---|---|
| `local/no-unused-tx-param` | **使っていない `tx` 引数を禁止**。純粋関数は tx を受け取らない、という層構造の強制。`@typescript-eslint/no-unused-vars` は既定が `args: 'after-used'` で先頭の未使用引数を見逃すため、その穴を埋める |
| `no-restricted-syntax` | **チェックアウト位置に依存する絶対パスのリテラルを禁止**(`/app/` `/home/` 等)。リポジトリ基準のパスは `repoRoot()`(`libs/repoRoot.ts`)経由で組み立てる。`/api/...` のような URL パスは対象外 |
| `no-restricted-globals` | ESM では使えない `__dirname` / `__filename` を禁止 |

ランタイム側の強制(RLS 検査、tx 内外部 I/O ガード、起動時の TZ / `COOKIE_DOMAIN` assert)は lint ではなく**実行時 assert と統合テスト**が担う。

**起動時 assert の一覧**:

| assert | 場所 | 止める理由 |
|---|---|---|
| `TZ` が `Asia/Tokyo` か | `src/index.ts` | 日時処理(`@db.Date` 正規化・JST シリアライズ)がプロセス TZ を前提にしている |
| `@db.Date` のカラム名が `date` か | `libs/prisma-connection.ts` | 正規化対象をフィールド名で判定しているため |
| セッションクッキーの domain が解決できるか | `libs/cookieDomain.ts` | 解決できないと **`secure` / `sameSite` が静かに外れる**。ローカル開発(`IS_LOCAL_DEVELOPMENT=true`)でのみ許す |

### マルチテナント / 行レベルセキュリティ

Prisma クライアント拡張(`backend/src/libs/prisma-connection.ts`)が、`tenantId` カラムを持つすべてのモデルへのクエリでテナント分離を強制する。クエリは `nestableTransactionWithTenantId` のコンテキスト(AsyncLocalStorage)内で実行する必要があり、`where` / `data` の `tenantId` が欠落またはコンテキストと不一致なら例外を投げる。バッチ処理等でテナント横断が必要な場合のみ `tenantId` に `'*'` を指定できる。

### 日時の扱い

実装は `backend/src/libs/prisma-connection.ts` に集約(ADR `20260713-datetime-design.md`)。

- **`@db.Date` の正規化**: PostgreSQL の `date` 型は TZ を持たないため、入力時は JST の年月日を UTC 同日に変換し、出力時は UTC midnight を JST midnight に補正する。**`@db.Date` を使えるカラム名は `date` のみ**(起動時にスキーマを検証)。裏返すと **1 モデルにつき事実上 1 本**で、日付が複数必要なら 2 本目以降は `DateTime` にする
- **`DateTime` カラム**: `@db.Timestamptz(3)` で保存。プロセスが `TZ=Asia/Tokyo` である前提で、レスポンスは replacer が `+09:00` 付き ISO 文字列にシリアライズする
- **ルートスキーマの日時**: `backend/src/libs/zDate.ts` の `zDateIn()`(入力: オフセット付き ISO 文字列 or 日付のみ → Date。オフセットなしは拒否)/ `zDateOut()`(出力: Date のまま返す)に集約する
- **フロントは日時を string のまま扱う**(Date への自動変換はしない。使用箇所で `new Date()` する)
- **トランザクション**: `nestableTransaction` / `nestableTransactionWithTenantId` は AsyncLocalStorage でネスト可能。分離レベルは READ COMMITTED(行ロックによる排他制御で、ロック取得後の read が最新のコミット済みデータを見る必要があるため)、タイムアウトは既定 5 秒(`opts.timeoutMs` で延長。3 秒超は警告ログ)

### セッション / 認証

1. `POST /api/login`(tenantCode + loginId + password)→ 署名済み httpOnly セッションクッキーを発行
2. `sessionRetrieve` プラグインが認証済みリクエストごとに `tenantId`・`userId` を解決
3. デバイス ID クッキーによるデバイスバインドセッション(1 端末 1 セッション)。照合は `where: { sessionId, deviceId }` で、**2 つのクッキーが揃わないと通らない**
4. **セッション寿命は「アイドル失効 + 活動による延長」**。`config.ts` の **`SESSION_IDLE_TIMEOUT_MS`(既定 7 日)から、サーバ側の失効判定とセッションクッキーの `maxAge` の両方が導かれる**ので、変えるときはこの定数だけを変える。**絶対失効は意図的に入れていない**(ADR `20260804-session-lifetime.md`)。`sessionId` には `SESSION_COOKIE_OPTIONS`、`deviceId` など長寿命のものには `DEFAULT_COOKIE_OPTIONS` を使う
5. ロールは `schema.prisma` の `enum Role`(ADMIN / MEMBER)。ロール追加はスキーマ変更 + マイグレーションで行い、ルートのスキーマでは `z.enum(Role)` を使う
6. マスターログイン: `MASTER_IP_WHITELIST` からの接続時のみ、パスワード欄に `MASTER_SECRET` ベースの TOTP コード(otpauth)で任意アカウントにログイン可能(運用サポート用)

パスワードのハッシュ化は bcrypt(`backend/src/libs/cryptoUtils.ts`)を各ルートで明示的に使う。

**クライアントバージョン管理**: `backend/src/config.ts` の `MINIMUM_CLIENT_VERSION` を起点に、フロントは全リクエストへ `x-client-version` を付与する。古いと判定されるとバックエンドが `actions: ['reloadApp']` を返し、UI のリロードダイアログが起動する。

### TypeScript は 7 と 6 の二段構え

型チェックは **TypeScript 7**(Go ネイティブ)、TypeScript の API を使うツール(typescript-eslint)は **TypeScript 6**。TS 7 は安定した programmatic API を持たず(7.1 で提供予定)typescript-eslint が動かないため。Microsoft 公式が案内する構成で、`package.json` の別名指定で実現している。

```jsonc
"@typescript/native": "npm:typescript@^7.0.2",      // tsc = TS7(型チェック・emit)
"typescript": "npm:@typescript/typescript6@^6.0.2"  // import 'typescript' = TS6(lint)
```

- `pnpm check` / `pnpm build` の `tsc` は **TS7**。TS6 で実行したいときは `tsc6`
- **`baseUrl` は TS7 で削除された**ので使わない。パスは `paths` の相対指定で書く(他に `target: es5` / `moduleResolution: node` / `module: amd|umd|systemjs` も削除済み)
- typescript-eslint が TS7 に対応したら(7.1 以降)二段構えを解消して `typescript` を 7 に戻す
- エディタは TS7 パッケージに tsserver が含まれないため、ワークスペースの TS6 かエディタ同梱版を使う

### フロントエンド: React 19 + React Compiler

Vite 8(Rolldown)+ `@vitejs/plugin-react` で、React Compiler が全コンポーネントを自動メモ化する(`vite.config.ts` の `reactCompilerPreset`)。**手動の `useMemo` / `useCallback` / `React.memo` は原則不要**(既存コードの分は残置)。最適化できないコードは ESLint の `react-compiler/react-compiler` が error にする。

**フォームは react-hook-form**。Compiler と併用するため、**RHF が推奨するフック経由の購読 API だけを使う**(`'use no memo'` はリポジトリ内に 1 つもない状態を維持する)。

- `formState` は `useForm()` の戻り値から分割代入せず **`useFormState({ control })`** で購読する
- 値の購読は `watch()` ではなく **`useWatch({ name, control })`**
- **`reset()` で値を書き換えるフィールドは `register` ではなく `useController` / `Controller`** でバインドする(`register` は Compiler 下で内部 `_reset` を越えられない)

この 3 つは **lint では検出できない**。唯一の検出装置が `e2e/formState.spec.ts` なので、**フォームを追加・変更したら必ず流す**(経緯は ADR `20260803-ui-stack.md`)。

サーバから取った値をフォームの初期値にするときは、**取得完了までフォームをマウントせず `defaultValues` に渡す**。effect で `reset(data)` して後から同期すると、入力が消える / 空欄になる競合を踏む。

### フロントエンド: UI(Tailwind + shadcn/ui)

スタイルは **Tailwind CSS v4** を tsx に直書きする。**CSS ファイルは `src/index.css` 1 本のみ**(テーマ変数と Tailwind の読み込み)で、コンポーネント単位の CSS/SCSS は作らない。

- コンポーネントは **shadcn/ui**(プリミティブは **Base UI**)。`pnpm dlx shadcn@latest add <name>` を `frontend/` で実行すると `src/components/ui/` にソースが生成される。生成物はプロジェクトのコードなので**そのまま編集してよい**(shadcn 既定から意図的に外した箇所はファイル冒頭にコメントを残す)
- **雛形には最小限しか生成していない**(checkbox / textarea 等は未生成)。`shadcn add` はネットワークを要するので、**素の HTML 要素で足りるものは無理に shadcn 化しない**。素の `<input type="checkbox">` のほうが E2E のロケータも素直に取れる(Base UI 由来の部品は hidden input を伴う)
- **注意**: shadcn CLI はルート `tsconfig.json` の `compilerOptions.paths` を見る。本リポジトリは project references 構成なのでここに `paths` が必要(`baseUrl` は不要)
- バリアントは **cva**、class 合成は `libs/utils.ts` の `cn()`
- クラス名は ESLint(`eslint-plugin-better-tailwindcss` の correctness 群)で検査する。存在しないクラス・競合するクラスは **error**
- トーストは **sonner**。React ツリー外(`queryClient.ts` の `onError`)から呼べることが要件で、`<Toaster />` は `App.tsx` に 1 つだけ置く
- DatePicker / 時刻入力は既製品がないため自前実装(`components/ui/DatePicker.tsx` / `TimeInput.tsx`)。日付の純粋関数は `libs/dateParts.ts` に置き、**`Date.toISOString()` は使わない**(JST でずれるため、ローカル年月日で扱う)

### フロントエンド: API クライアント

ADR `20260803-api-client.md`。

- `frontend/src/generated/` は自動生成の OpenAPI 型(手動編集禁止)
- API 呼び出しは **TanStack Query + openapi-react-query**。`libs/api.ts` の `$api.useQuery` / `$api.useMutation` を使う(パスとメソッドが生成型で補完される)
  - `libs/api.ts`: openapi-fetch クライアント本体。Date → JST 正準形(`+09:00`・秒精度)の直列化は body/query serializer、`x-client-version` 等のヘッダ付与とエラーボディ正規化は Middleware
  - `libs/queryClient.ts`: QueryCache / MutationCache の `onError` にトースト・`actions` 処理(forceLogout / historyBack / reloadApp)・リトライ登録を集約。**ノーキャッシュ方針**(`staleTime: 0` / `gcTime: 0` / `retry: false` / refetch 系 off)= 取得状態管理と再取得トリガーとしてのみ使い、キャッシュ配信はしない
  - ブロッキング表示(`blocking`)とリトライダイアログ対象か(`askRetryOnServerError`)は query / mutation の `meta` で指定する(型は `ApiMeta`)
  - 更新後の再取得は `invalidateQueries`
- **Jotai** アトム(`frontend/src/stores.ts`)でグローバル状態を管理。`atomWithStorage` でキーとなるアトムを localStorage に永続化
- パスエイリアス: `@` → `./src`

## テスト

Vitest + 実 PG 統合テスト + Playwright E2E(ADR `20260710-test-strategy.md`)。**DB はモックしない。** 実行手順と切り分けはスキル `verify`。

- **ユニットテスト**(DB 不要): 純粋関数のテスト。`backend/src/**/*.test.ts` にソース併置
- **統合テスト**(実 PG): `backend/test/integration/` 配下。worker ごとに template database から専用 DB を複製し、テストごとに TRUNCATE(開発 DB には触れない)。データは `backend/test/factories.ts` で作り、セッション用のヘルパーは `backend/test/integration/routes/_helpers.ts` にある
  - `framework/` — 基盤のリグレッションテスト(RLS / `@db.Date` 正規化 / 行ロックによる排他制御 / tx 内 I/O ガード / セッション寿命 / セキュリティヘッダ)。**CI のジョブ分割が `pnpm verify` と同等であることもここで検証している**(`ciStages.test.ts`)
  - `routes/` — ルートごとの fastify.inject テスト。**`src/routes/` とディレクトリ階層・ファイル名とも 1:1 対応**(例: `src/routes/api/private/users.GET.ts` → `test/integration/routes/api/private/users.GET.test.ts`)。共通ヘルパーは `_` 始まり(`_helpers.ts`)でミラー対象外。配置ずれは `framework/testPlacement.test.ts` が検出する
- **E2E**(Playwright): `e2e/` 配下。エージェントは実行して結果を読むだけの運用(ブラウザ操作 MCP は目視確認専用)
- dev サーバは `tsx watch` + `tsc --watch --noEmit` の 2 プロセス(`backend/script/dev-watch.sh`)。E2E も同じ `tsx` 起動を使うため両者は食い違わない(ADR `20260804-dev-server.md`)

## ドメイン概念

| 用語 | 説明 |
|---|---|
| テナント | 契約単位(組織)。`tenantCode` でログイン時に指定 |
| ユーザ | テナント内のログイン主体(ロール: ADMIN / MEMBER、案件で拡張可) |
| tenantConfig | テナントごとの JSON 設定(`tenants.configurations`)。`models/tenantConfig.ts` の Zod スキーマに案件固有フィールドを追加する |

## 主要ファイルの場所

| 用途 | パス |
|---|---|
| DB スキーマ | `backend/prisma/schema.prisma` |
| Prisma CLI 設定 | `backend/prisma.config.ts` |
| サーバー設定(SSM・クッキー・バージョン) | `backend/src/config.ts` |
| クライアント設定(API URL・バージョン) | `frontend/src/config.ts` |
| Prisma クライアント・拡張(RLS / `@db.Date` / tx) | `backend/src/libs/prisma-connection.ts` |
| リポジトリルート解決 | `backend/src/libs/repoRoot.ts` |
| オブジェクトストレージ(S3 / MinIO)の注入点 | `backend/src/libs/storage.ts` |
| 報告書 + 画像アップロードの参照実装 | `backend/src/{routes/api/private/{reports,uploadedImages}.*.ts,models/{reports,uploadedImages}.ts}`・`frontend/src/pages/{Reports,ReportNew}.tsx` |
| users CRUD 参照実装 | `backend/src/routes/api/private/users.*.ts`・`backend/src/models/users.ts`・`frontend/src/pages/UsersAdmin.tsx` |
| 初期シード | `backend/script/seed.ts` |
| Fastify プラグイン | `backend/src/plugins/` |
| グローバル状態アトム | `frontend/src/stores.ts` |
| 型付き API クライアント($api / Middleware) | `frontend/src/libs/api.ts` |
| QueryClient(エラー処理・actions・リトライ登録) | `frontend/src/libs/queryClient.ts` |
| 自動生成 OpenAPI 型 | `frontend/src/generated/` |
| 自動生成 Prisma クライアント | `backend/src/generated/prisma/`(コミット運用・手動編集禁止) |
| 手順のスキル | `.claude/skills/` |
| 設計判断の記録(ADR) | `docs/decisions/`(索引は `docs/decisions/README.md`) |
| 個別フェーズの実装計画 | `docs/plans/` |
| 把握済みだが未対応の論点 | `docs/known-issues.md` |
| 雛形化の作業計画 | `docs/template-repo-workplan.md` |
| ローカル開発用 docker compose | `docker/docker-compose.local.yml` |
| 開発コンテナの構成・運用手順 | `docs/dev-container.md` |
