# 雛形(myapp)に還元する項目

`machineid` は雛形 **`myapp`** から派生した案件リポジトリ。作業中に見つけた**雛形側の不備・改善**を
ここに貯め、まとまったところで `myapp` 側の PR にまとめる。

- **派生側の git 履歴は捨てるので、cherry-pick では戻せない。** 書き残さないと失われる
- **この台帳はまっさら化(git 履歴のリセット)後も残す。** 還元は 1 回で終わらず、
  案件を進めるほど雛形の穴が見つかるため
- **`myapp` に反映したら、この一覧から削除する**(履歴は git に残る)。
  `docs/known-issues.md` と同じ運用
- ファイル名に日付は付けない(継続的に更新する台帳のため)。項目ごとに発見日を持つ

## 書き方

雛形を触っていて「これは案件固有ではなく雛形の問題だ」と思ったら、その場で足す。
**判断に迷ったら足す** — 消すのは簡単だが、思い出すのは難しい。

- **何が起きるか**を先に書く(「〜が無い」ではなく「〜すると壊れる」)
- **ローカルでは踏めない類か**を書く(本番でしか出ない問題は、書かないと二度と気づけない)
- `machineid` 側で既に直したなら**その旨と差分の在り処**を書く(そのまま持っていける)

---

### 雛形の不備(修正して還元する)

| # | 内容 | 発見 |
|---|---|---|
| 1 | **`Dockerfile.prod-main` / `dev-main` で本番マイグレーションが実行できない。** 最終ステージに `prisma/schema.prisma` しかコピーしておらず、`prisma/migrations/`・`prisma/schema.prisma.generated`・`prisma.config.ts` が無い。`datasource db` に `url` が書かれておらず接続先が `prisma.config.ts` 由来なので、3 つとも必要 | 2026-08-06 AWS 構成の検討中 |
| 2 | **`terraform.example` の EventBridge ターゲットがリビジョン固定の ARN を参照している**(`aws_ecs_task_definition.main.arn`)。デプロイしても定期実行だけ古いイメージで走り続ける。`arn_without_revision` にすべき | 同上 |
| 3 | **`deploy/deploy_prod-main.sh` に旧案件の実値が残っている。** `aws_account_id="756074065984"` と `cloudfront_distribution_id="E3TDM7MGWEED1K"`。手順 4 の痕跡検査は `docs/` と `terraform.example/` を見ていたが、**`deploy/` も対象**にすべき | 同上 |
| 4 | **ブランド資産が前プロダクトのまま。** `frontend/public/favicon.ico` / `apple-touch-icon.png` が teal(`#319795`)の旧アイコンだった。雛形としては中立な資産にするか、少なくとも「差し替え必須」の一覧に載せる。あわせて `index.html` の `<link rel="icon" type="image/svg+xml">` が実体(.ico)と食い違っていた | 2026-08-06 |
| 5 | **ホスト clone の `receive.denyCurrentBranch updateInstead` が未設定だと最初の `git push -f host` が拒否される。** `docs/dev-container.md` に「事前設定(一度だけ)」として書いてはあるが、派生時に新しいホスト clone を作ると未実施になる。手順 2 のチェック項目に入れる | 2026-08-06 |
| 6 | **開発コンテナの MinIO 用環境変数が AWS の資格情報を潰す。** `docker-compose.local.yml` が `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` をコンテナ全体に設定しており、**環境変数はプロファイルより優先される**ため、コンテナ内の `aws` コマンドが常に `minioadmin` を使って `InvalidClientTokenId` で失敗する(実測)。`deploy/*.sh` の `aws ecr get-login-password` も同様。**`machineid` 側で対応済み**(2026-08-06): compose / CI の環境変数を **`S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`** に改名し、`config.ts` の `S3_CREDENTIALS` 経由で `S3Client` に明示的に渡す(本番は `undefined` → タスクロール)。**この差分をそのまま `myapp` に持っていける** | 2026-08-06 |
| 7 | **`Dockerfile.local` と `Dockerfile.prod-main` の postgresql-client のメジャーがずれている**(local は 18、prod-main は 17)。ローカルの postgres も 18 なので、雛形の時点で開発と本番のクライアントが食い違っている。`pg_dump` は自分より新しいサーバを拒否するため、本番 DB のメジャーを上げたときに気づきにくい形で壊れる | 2026-08-06 |
| 8 | **`Dockerfile.prod-main` が pnpm workspace 構成に追随していない。** `backend/pnpm-lock.yaml` を COPY しようとするがロックはルートに 1 本しかなく、**ビルドが通らない**。さらに最終ステージが `pnpm-workspace.yaml` をコピーしないため、通しても `repoRoot()`(上方探索)が失敗して起動しない。workspace の `node_modules` は symlink なのでルート側と backend 側の両方を運ぶ必要もある。**Prisma 7 / workspace 移行以降、本番イメージは一度もビルドされていない**とみられる | 2026-08-07 |
| 9 | **Prisma 7 の driver adapter は SSL を明示しないと RDS / Aurora に接続できない。** `rds.force_ssl` の既定は **1**(`aurora-postgresql17` / `postgres18` とも実測)。Prisma 6 の Rust エンジンは `sslmode=prefer` 相当で**自動的に SSL を張り、かつ検証しない**ため表面化しなかったが、`@prisma/adapter-pg`(node-postgres)は**明示しない限り平文**。`DB_URL` に `sslmode` と、RDS CA バンドル + `NODE_EXTRA_CA_CERTS` が要る。**`prisma migrate deploy` は別経路(スキーマエンジン)なので通ってしまい**、「マイグレーションは成功するのにアプリだけ落ちる」という紛らわしい出方をする。ローカル(平文 postgres)では絶対に踏まない | 2026-08-07 |
| 10 | **`etc/onstart-prod-main.sh` の `exec su - appuser` がログインシェルなので、環境変数がほぼすべて捨てられる。** `APPX_` 接頭辞付きのものだけが `/etc/environment` に転記されて生き残る仕組みだが、**それを知らずに素の環境変数をタスク定義に足すと黙って消える**(`NODE_EXTRA_CA_CERTS` で実際に踏んだ)。Dockerfile の `ENV` も同様に効かない | 2026-08-07 |
| 11 | **`/api/ping` がテナント 0 件で 500 を返す。** ALB のヘルスチェックがこれを見るため、**シード前の環境は恒久的に unhealthy** になり、ECS がタスクを起動・停止し続ける。DB 疎通確認にデータの存在を要求している設計 | 2026-08-07 |

| 12 | **`reloadReservation` が API の公開契約に残っている。** `backend/src/libs/commonSchemas.ts` の `responseActions` の先頭にあり、`commonErrorsSchema` 経由で**全エラーレスポンスの型に入る**ため、生成 OpenAPI 型(`frontend/src/generated/openapi-schema.d.ts`)に 9 箇所以上伝播している。**旧プロダクトの予約ドメイン由来**で、サーバ側に送出箇所は無く、フロントの `queryClient.ts` も処理していない(扱うのは `forceLogout` / `historyBack` / `reloadApp` の 3 つ)。**完全な死語だが、API を読んだ人は予約機能を探すことになる** | 2026-08-07 |
| 13 | **`backend/script/prepare_locks.ts` のロック名が旧プロダクトのドメイン語。** `const lockNames = ['sharedAssignment', 'reservation']`(共有割り当て / 予約)。**このスクリプト自体どこからも参照されておらず**、`editLock` を使っているのもテストの `factories.ts` だけでアプリ本体に利用箇所が無い。`getLock` の仕組みは雛形の機能として残す価値があるが(ADR に登場する)、**ロック名は案件ごとに定義するもの**なので、雛形には具体名を置かず「ここに案件のロック名を書く」形にすべき | 2026-08-07 |

### 派生手順そのものへの追記(`myapp` の計画側に反映)

| # | 内容 |
|---|---|
| 14 | **手順 2 で公開ポートを変えたら、compose の `environment` にある `SPA_APP_BASE_URL` / `API_SERVER_BASE_URL` / `VITE_API_SERVER_BASE_URL` も同じ値に揃える。** `ports:` だけ変えると、ホストからのアクセスとアプリが認識する URL が食い違う(実際に 8801/8081 のまま残っていた) |
| 15 | **手順 3 の削ぎ落とし対象にブランド資産と `CLAUDE.md` / `README.md` の視点変更を明記する**(上記 4 と、手順 3 の表に追加済みの行) |
