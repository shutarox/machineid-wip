# myapp — マルチテナント Web アプリケーションの雛形

AI エージェント駆動開発を前提とした、新規案件用のテンプレートリポジトリ。

認証・マルチテナント RLS・型生成パイプライン・users CRUD の参照実装を備えた状態から始められる。**エージェントが参照実装を模倣するだけで機能追加できること**を設計目標にしており、判断が要らない部分は型・lint・実行時 assert・テストで機械的に強制している。

## スタック

| 領域 | 採用 |
|---|---|
| ランタイム | Node.js / TypeScript 7(lint 用に TypeScript 6 を併用) |
| バックエンド | Fastify + Zod(`fastify-type-provider-zod`)+ Prisma 7(driver adapter) |
| DB | PostgreSQL。**マルチテナント RLS を Prisma 拡張で強制** |
| フロントエンド | React 19 + React Compiler / Vite 8(Rolldown)/ TanStack Query / react-hook-form / Jotai / react-router v7 |
| UI | Tailwind CSS v4 + shadcn/ui(プリミティブは Base UI) |
| テスト | Vitest(ユニット + 実 PG 統合)/ Playwright(E2E) |

技術選定の根拠と却下した選択肢は **`docs/decisions/`(ADR)** にある。設計を変える前に読むこと。

## 前提

開発は Docker コンテナ内で行う。構成と運用手順は **`docs/dev-container.md`** を参照。

コンテナ内に以下が揃っていること(既存イメージには含まれる)。

- pnpm / direnv / PostgreSQL クライアント(`psql` / `createdb`)
- PostgreSQL コンテナ(`pghost` で解決できること)
- MinIO コンテナ(`miniohost` で解決できること)。**S3 互換のオブジェクトストレージ**で、本番の S3 と同じ AWS SDK からアクセスする。Web コンソールは `localhost:9001`(`minioadmin` / `minioadmin`)、S3 API は `localhost:9000`
  - **画像は presigned URL でブラウザに直接読ませる**ので、MinIO の 9000 番はホストに公開している。サーバから見た名前(`miniohost:9000` = `S3_ENDPOINT`)とブラウザから見た名前(`localhost:9000` = `S3_PUBLIC_ENDPOINT`)が違うため、**URL の発行だけ後者で署名する**。SigV4 は Host ヘッダごと署名するので、発行後にホスト名を差し替えると 403 になる

さらに、**シークレットを `~/.ssm-keys.json` に置く**必要がある。**ローカル開発では AWS に接続しないので、このファイルが必須**(無いと起動時に、作るべき内容を表示して止まる)。

```json
{
  "/myapp-keys/COOKIE_SECRET": "...",
  "/myapp-keys/CRYPTO_SECRET": "...",
  "/myapp-keys/SES_SMTP_USER": "...",
  "/myapp-keys/SES_SMTP_PASS": "...",
  "/myapp-keys/MASTER_SECRET": "...",
  "/myapp-keys/MASTER_IP_WHITELIST": "..."
}
```

> キーのプレフィックスは**環境変数 `SSM_KEY_PREFIX` で差し替えられる**(既定 `/myapp-keys`、末尾の `/` は任意)。案件では自分の名前空間を設定し、このファイルのキーもそれに合わせる。プレフィックスが合っていないと**起動時に `<プレフィックス>/COOKIE_SECRET is not set` で落ちる**。
>
> ローカル開発は `IS_LOCAL_DEVELOPMENT=true`(`docker/docker-compose.local.yml`)で、**AWS へは一切接続しない**(SSO でログイン済みかどうかに関係なく `~/.ssm-keys.json` を読む)。`AWS_PROFILE` をコンテナ全体には設定せず、terraform は各環境の `.envrc` が、`deploy/*.sh` は自前で `export` する。
>
> MinIO の資格情報は **`S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`** で渡す。**`AWS_ACCESS_KEY_ID` という名前にしないこと** — 環境変数は AWS の資格情報チェーンでプロファイルより優先されるため、同じコンテナ内の `aws` CLI / terraform が MinIO のダミーを使って `InvalidClientTokenId` で失敗する(詳細は `backend/src/config.ts` の `S3_CREDENTIALS`)。

## 立ち上げ

```bash
pnpm install
pnpm bootstrap     # .envrc 生成 → DB 作成 → マイグレーション → シード
pnpm dev           # backend + frontend を PM2 で起動
```

`pnpm bootstrap` は**ディレクトリ名から DB 名とポートを導出**する。同一コンテナに複数の clone / worktree を置いて並列作業できるようにするためで、PG コンテナは共有しつつ database を分離する。

| ディレクトリ名 | DB | backend | frontend |
|---|---|---|---|
| `app`(主クローン) | `myapp` | 8080 | 8800 |
| `app2` | `myapp_app2` | 8084 | 8804 |
| その他 | `myapp_<名前>` | 名前のハッシュから導出 | 同左 |

生成された `.envrc`(git 管理外)を direnv が読む。**bootstrap 後は新しいシェルを開くか `direnv reload` が必要**。

シードは初期テナントと管理者ユーザを作り、**初期パスワードを標準出力に表示する**。既定は tenantCode `demo` / loginId `admin`。

```bash
# backend/ で実行。`script` は tsconfig paths を解決するためのラッパー
pnpm script script/seed.ts [tenantName] [tenantCode] [adminLoginId]
```

`pnpm bootstrap` は続けて **`script/seed_dev.ts`**(開発用サンプルデータ)も実行する。一覧の検索・ページネーションとテナント分離を画面から確認できるだけの件数を作る。

| テナント | ユーザ |
|---|---|
| `demo` | `admin`(ADMIN)+ `demo-member-01`〜`25` |
| `demo2` | `demo2-admin`(ADMIN)+ `demo2-member-01`〜`03` |

**パスワードは一律 `pass` + loginId**(`admin` → `passadmin`、`demo-member-01` → `passdemo-member-01`)。`seed.ts` が発行したランダムな初期パスワードも、この規則で上書きされる。

> 推測可能なパスワードのアカウントを作るため、**`seed_dev.ts` は `IS_LOCAL_DEVELOPMENT=true` 以外では実行を拒否する**。本番の初期テナント投入は `seed.ts` の担当で、そちらはランダムな初期パスワードを発行する。

`pnpm stop` で停止。

## 検証

```bash
pnpm verify        # check + lint + test + e2e(CI と同一)
```

**「verify を通せ」が全作業の完了条件。** 個別に流す場合:

```bash
pnpm check         # 型チェック(TypeScript 7)
pnpm lint          # ESLint
pnpm test          # ユニット + 実 PG 統合テスト
pnpm e2e           # Playwright
pnpm knip          # 未使用ファイル・依存・export の検出(CI では実行されない)
```

> **E2E のバックエンドはポート 8080 の既存サーバを再利用する**(`playwright.config.ts` の `reuseExistingServer`)。dev(`pnpm dev`)も E2E も `tsx` でソースを直接実行するため、両者で動くコードは一致する。dev は新規ファイルの追加も含めて約 3 秒で自動反映される(ADR `docs/decisions/20260804-dev-server.md`)。

## 参照実装

**users CRUD が層構造の見本**。新しいリソースを足すときはこれを模倣する。

```
backend/src/routes/api/private/users.{GET,POST,PATCH}.ts   route(Zod スキーマ・認可)
  └ backend/src/models/users.ts                            tx を受け取るモデル関数 → 純粋関数
backend/test/integration/routes/api/private/users.*.test.ts  ルートテスト(src と 1:1)
frontend/src/pages/UsersAdmin.tsx                          画面($api.useQuery / useMutation)
```

ルートは `backend/src/routes/api/` 配下のファイル名(`<リソース>.<メソッド>.ts`)から URL とメソッドが自動解決される(`@fastify/autoload`)。**URL はファイル名で決まるのでパスパラメータは使えない**(`/users/:id` は表現できない)。単一リソースの指定は querystring か body の `id` で行う。**テストの配置ずれは `framework/testPlacement.test.ts` が検出する。**

## カスタマイズポイント

新規案件で最初に触る箇所。

| やること | 場所 |
|---|---|
| **SSM キーの名前空間を変える** | 環境変数 **`SSM_KEY_PREFIX`**(既定 `/myapp-keys`)。あわせて `~/.ssm-keys.json` のキーと、terraform の `variable "project_name"`(ECS の secrets ARN が `${project_name}-keys/` を参照)を揃える |
| **アプリ名を変える** | ルート `package.json` の `name`、`frontend/index.html` の `<title>`、**`frontend/manifest.json` の `name` / `short_name`**(PWA としてインストールしたときの表示名)、`frontend/src/pages/CommonHeader.tsx` の既定タイトル、`tools/bootstrap.js` の DB 名導出 |
| **テーマ色を変える** | `frontend/src/index.css` の CSS 変数と、`frontend/manifest.json` の `theme_color` / `background_color`(ブラウザ UI の色。雛形は白のまま) |
| **DB スキーマを変える** | `backend/prisma/schema.prisma` を編集 → `pnpm db:case-format` → `pnpm db:migrate:create --name <名前>` → `pnpm db:migrate:deploy` → `pnpm db:generate`(生成物はコミットする) |
| **ロールを増やす** | `schema.prisma` の `enum Role` を編集 + マイグレーション。ルートのスキーマでは `z.enum(Role)` を使う |
| **テナント固有の設定項目を増やす** | `backend/src/models/tenantConfig.ts` の Zod スキーマにフィールドを追加(DB 保存形と公開形を分けて定義) |
| **API を足す** | `backend/src/routes/api/` にファイルを追加 → 対応するテストを `test/integration/routes/` の同じ階層に置く → `pnpm gen:openapi` でフロントに型を渡す |
| **UI コンポーネントを足す** | `pnpm dlx shadcn@latest add <name>`(`frontend/` で実行)。生成物は編集してよい |
| **クライアント強制リロードの基準** | `backend/src/config.ts` の `MINIMUM_CLIENT_VERSION` |
| **インフラ定義** | `terraform/` — 本番 1 環境の実構成。ゼロからの構築手順は `terraform/README.md` |

## 守るべき規約(機械的に強制されているもの)

`pnpm verify` が落ちるので、破ると気づける。

- **純粋関数は `tx` を受け取らない** — 未使用の `tx` 引数は lint が error(`local/no-unused-tx-param`)
- **チェックアウト位置に依存する絶対パスを書かない** — `repoRoot()` を使う。lint が error
- **テナント分離** — `tenantId` を持つモデルへのクエリは、`tenantId` の欠落・不一致で実行時に throw
- **トランザクション内で外部 I/O をしない** — SES / SSM のクライアント入口で実行時に throw
- **`TZ=Asia/Tokyo`** — 起動時に assert
- **宣言していない依存は import できない** — pnpm の厳格な `node_modules` を使う(`.npmrc` に `public-hoist-pattern` を入れない)。`package.json` に無いパッケージは解決エラーになる
- **コミット運用の生成物はスキーマと同期** — Prisma クライアントと OpenAPI 型は、CI が再生成して差分ゼロを検証する(`pnpm db:generate` / `pnpm gen:openapi` の忘れを検出)
- **ルートテストは `src/routes/` と 1:1 配置** — 配置ずれをテストが検出
- **CI のジョブ分割は `pnpm verify` と同等** — CI は matrix で段階ごとに並列化しているため、`verify` に段階を足して CI を直し忘れるとずれる。`matrix.stage` と `scripts.verify` の一致をテストが検出

lint では検出できないもの(フォームの購読 API の使い方など)は E2E が唯一の検出装置になっている。詳細は `CLAUDE.md`。

## ドキュメント

| 場所 | 内容 |
|---|---|
| `CLAUDE.md` | **全体地図と判断基準**。エージェントが最初に読む |
| `.claude/skills/<名前>/SKILL.md` | 定型手順のスキル(`db-schema-change` / `add-api-endpoint` / `verify` / `record-docs`)。**スキル機構が使えない環境でも、このパスを直接読めばよい** |
| `docs/decisions/` | 設計判断の記録(ADR)。**却下した選択肢**を含む |
| `docs/plans/` | 個別フェーズの実装計画 |
| `docs/known-issues.md` | 把握しているが未対応の論点 |
| `docs/dev-container.md` | 開発コンテナの構成と運用 |
| `docs/agent-traps.md` | 受け入れテストでエージェントが実際に詰まった箇所と、その対処 |
