# AWS 本番環境の構築(最小構成・prod 単一)

作成: 2026-08-06

## Context

`machineid` の AWS 環境をこれから作る。雛形の `terraform.example/` は元プロダクト由来の **dev / prod × main / util の 4 スタック構成**で、そのまま起こすとコストが要件に合わない。

**コストを最小化しつつ、運用に必要な経路(ログイン・スクリプト実行・マイグレーション・定期実行)を確保する**のがこの作業の目的。

決定そのものは ADR にある。この計画は**手順**を持つ。

- `docs/decisions/20260806-aws-minimal-prod.md` — 構成(prod のみ / util 廃止 / NAT なし / RDS)
- `docs/decisions/20260806-deploy-and-scheduled-jobs.md` — デプロイ手順とジョブ実行

### まっさら化との関係

`machineid` は雛形 `myapp` からの派生で、**初期カスタマイズが終わったら git 履歴を捨てて新リポジトリに移す**(`docs/plans/20260806-derive-first-project.md` の手順 6 = まっさら化)。

**この AWS 構築は、まっさら化の手前で完了させる作業のひとつ**(他はアプリの要件そぎ落とし・ドキュメントの案件化・痕跡検査)。したがって:

- ここで作る `terraform/` は**まっさら化後の初期コミットに含まれる**。`terraform.example/` は逆に削除される
- 作業中に見つけた**雛形側の不備**は、`20260806-derive-first-project.md` の「myapp に還元する項目」に追記する(この計画ファイル自体はまっさら化のときに残すか判断する)
- AWS 側のリソースはリポジトリのまっさら化と無関係に残る。**tfstate はリポジトリではなく S3 にある**ので、履歴を捨てても state は失われない

## 確定した判断(ユーザー選択)

| 論点 | 決定 |
|---|---|
| 環境 | **prod のみ**。dev は作らない |
| 作業用サーバ | **置かない**。ログインは ECS Exec |
| ネットワーク | **NAT なし**。ECS タスクは public サブネット + `assign_public_ip`、インバウンドは SG で ALB からのみ |
| DB | **RDS PostgreSQL / Single-AZ / db.t4g.small / gp3**(Aurora Serverless v2 をやめる) |
| サービス更新 | **terraform の管理外**(`lifecycle { ignore_changes = [task_definition, desired_count] }`)。ロールアウトは `aws ecs update-service` |
| マイグレーション | **デプロイの独立ステップ**として `run-task`。`exitCode` 0 を確認してから `update-service` |
| `script/` の実行 | **`run-task` の command override**(汎用ラッパー `deploy/run_task.sh`) |
| 定期実行 | **API プロセス内のスケジューラ**。重い / 低頻度のみ EventBridge → `run-task` |
| 多重実行の防止 | **条件付き `updateMany` による claim**(`getLock` は使わない) |

## 調査で確定した既存の作法(踏襲する)

| 事実 | 効いてくる場所 |
|---|---|
| `etc/onstart-prod-main.sh` の末尾が `exec su - appuser -c "$*"` | **`containerOverrides.command` がそのままシェル行になる**。`run-task` でのスクリプト実行がそのまま通る |
| `main-app/39_ecs-scheduled-task.tf` が EventBridge → `run-task` + command override | マイグレーション / スクリプト実行はこの形の 2 例目・3 例目にすぎない |
| `datasource db { provider = "postgresql" }` に **`url` が無い** | 接続先は `prisma.config.ts` の `env('DB_URL')` から解決。**イメージに `prisma.config.ts` が要る** |
| `prisma.config.ts` の `schema` は `prisma/schema.prisma.generated` を指す | イメージに `.generated` も要る |
| `libs/prisma-connection.ts` が起動時に `repoRoot()/backend/prisma/schema.prisma` を読む | 現行イメージが `schema.prisma` をコピーしているのはこのため。**消さないこと** |
| `editLock` はテナント単位の行を要求し、`getLock` はブロッキング待ち | 全体ジョブの排他には向かない → `ScheduledJob` の条件付き更新を使う |
| RLS 拡張は **`tenantId` を持たないモデルを検査対象外にする** | `ScheduledJob` は `tenantId` を持たないので `nestableTransaction`(テナント無し)で扱える |
| `cleanup_uploads.ts` は `BATCH_SIZE = 200` で区切っている | スケジューラ内で回してもメモリが一定。API プロセス内実行の条件を満たす |

## 未決定(着手前に埋める)

- **アプリのドメイン名**(`myappdomain.com` はプレースホルダ)
- **アプリ向け Route53 ゾーンの持ち方** — 次のどちらかで `prod/main` の書き方が変わる
  - **(a) コーポレートゾーンに直接レコードを書く**: `data "aws_route53_zone"` で参照する。**同一 AWS アカウントにゾーンがある場合のみ**成立し、いちばん簡単
  - **(b) アプリ用のサブドメインゾーンを切る**: `prod/main` に `aws_route53_zone` を作り、**親ゾーン側に NS 委譲レコードを手で足す**(親はこの terraform の管理外)。別アカウント運用ならこちら
  - どちらでも **ACM の DNS 検証レコードを書き込める場所**が必要になる点は同じ
- **SES の送信ドメイン** — コーポレートドメインで verify 済みならアプリ側に SES リソースは不要。案件のサブドメインから送るなら `prod/main` にドメイン ID + DKIM の CNAME を足す
- AWS アカウント ID / **SSO プロファイル名** / tfstate 用 S3 バケット名(グローバル一意)
- `project_name` を `machineid` に統一(SSM の名前空間 `machineid-keys/` と `backend/src/config.ts` の `SSM_KEY_PREFIX` を揃える)

## 作業フェーズ

### 1. `terraform.example/` から prod 単一構成を切り出す

`terraform/` として新規に作る(`.example` は参照用に残し、まっさら化のときに削除する)。

```
terraform/
  environments/
    prod/
      iam/       IAM ロール群(旧 modules/iam を展開)。**terraform 実行用ユーザは作らない**
      base/      VPC・サブネット(public×2 / private×2)・ルートテーブル・IGW
                 ・SG・RDS・S3 Gateway エンドポイント・プライベートホストゾーン
      main/      ACM・アプリ向け Route53 レコード・S3 + CloudFront(SPA)
                 ・ECR・ALB・監視(SNS + Lambda + アラーム)
      main-app/  ECS クラスタ・タスク定義・サービス・autoscaling・EventBridge
```

**`environments/` の下は `prod/` だけ**。単一環境では `common` / `shared` という軸が成立しないため。

#### スタックを 4 つに分ける理由(環境ではなく変更頻度と権限で割る)

| スタック | apply 頻度 | 必要な権限 | 壊れたときの痛み |
|---|---|---|---|
| `iam` | ほぼゼロ | **IAM 書き込み**(別プロファイル) | デプロイユーザの作り直し |
| `base` | 低 | 通常 | **RDS が飛ぶ** |
| `main` | 低〜中 | 通常 | CloudFront の再作成(反映待ち) |
| `main-app` | **デプロイのたび** | 通常 | ロールバックで戻せる |

`base` と `main` を 1 つに畳む案もあるが、**RDS を含むスタックは apply 頻度を最小に保ちたい**ので分ける。

#### `common/`(= shared)は作らない

`terraform.example` の `common/base` は **コーポレートサイトのドメイン基盤**であって、アプリのものではない。

```
aws_route53_zone.main / mx / txt_spf / txt_google_workspace_dkim
txt_google_search_console / ns_* (サブドメイン委譲)
aws_cloudfront_distribution.apex + function (apex → www リダイレクト)
```

**1 ファイルも引き継がない。** アプリ向けの Route53 レコードは `prod/main` に書く。SES の発信元認証レコード(DKIM CNAME / SPF / DMARC)はコーポレート側のゾーンに既にあるものを使い、**アプリ側で SES ドメイン ID を作り直さない**(送信ドメインを案件のサブドメインにする場合のみ `prod/main` に足す)。

#### `modules/` は廃止し、呼び出し元に展開する

単一環境では**どのモジュールも 1 箇所からしか呼ばれず、間接参照が読みにくさになるだけ**。

| 旧 | 展開先 |
|---|---|
| `modules/iam` | `prod/iam/`(**ロール 5 種のみ**をファイルごと展開。ユーザ系は下記のとおり削除) |
| `modules/acm` | `prod/main/21_acm.tf`(証明書は SPA = us-east-1 / API = ap-northeast-1 の **2 枚だけ**なので、`for_each` + provider alias を畳んで直接書く。**us-east-1 の provider alias 自体は必要**) |

**削除するもの**: `environments/dev/` 一式、`*/util/`、`*/util-app/`、`util` 系の ALB / NLB、`common/` 一式、`modules/`。

### 0. 先に IAM Identity Center を有効化する(フェーズ 1 の前)

**静的アクセスキーを 1 本も作らない**方針(ADR の決定 6)なので、terraform を書き始める前に認証を用意する。

1. AWS アカウントで **IAM Identity Center を有効化**(単体アカウントで使え、追加費用なし)
2. 管理者権限のパーミッションセットを作り、自分に割り当てる
3. 開発コンテナで `aws configure sso`
   - コンテナ内にはブラウザが無いので、**device code フローで表示される URL とコードをホストのブラウザで開く**(`aws sso login --no-browser`)
4. 各スタックの `.envrc` に `export AWS_PROFILE=<sso プロファイル名>` を書く

**削除するもの**: `14_user.tf-user-iam.tf` / `14_user.tf-user-main.tf` と対応するポリシー JSON 2 本(`12_policy.tf-user-*.json`)。

`terraform-local-developer`(SSM 読み取り専用)は用途があるので残してよいが、**静的キーを配るくらいなら SSO のパーミッションセットに寄せる**ほうがよい。ローカル開発は `IS_LOCAL_DEVELOPMENT=true` のとき `~/.ssm-keys.json` を読むので、そもそも AWS への到達を必要としない。

### 2. ネットワーク(`prod/base`)

- `14_nat_gateway.tf` と NAT 用 `aws_eip` を**削除**
- private サブネットのルートテーブルから NAT 向けルートを削除(RDS 専用の閉じたサブネットになる)
- ECS タスクは **public サブネット**に配置(`15_route.tf` の IGW ルートを使う)
- **S3 Gateway エンドポイント**を追加(無料)
- SG の整理(**すべて SG 参照で書く。CIDR 直書きにしない**)
  - `is_app`(アプリタスク): インバウンドは **ALB の SG からの 8080 のみ**。アウトバウンドは全許可
  - `is_alb`: インバウンド 80 / 443
  - `is_rds`: インバウンドは **`is_app` からの 5432 のみ**
  - `allow_inbound_ssh` / `allow_inbound_from_alb_8800` は**削除**(util 用)

**将来 private サブネットへ移すときのコストを抑えるため、以下は初期構築時点で必ず満たす**(根拠は ADR の「撤退条件」)。

1. private サブネットを **2 AZ 分**作る(RDS 用に必要。ECS を移す先にもなる)
2. private 用のルートテーブルを public と**分ける**(移行時は NAT へのルートを 1 行足すだけになる)
3. SG のルールは **SG 参照**で書く(タスクの IP が変わっても書き換え不要)
4. `deployment_minimum_healthy_percent = 100`(フェーズ 4)

### 3. DB を RDS に置き換え(`prod/base`)

- `aws_rds_cluster` + `aws_rds_cluster_instance` → **`aws_db_instance`**
  - `instance_class = "db.t4g.small"` / `engine = "postgres"` / `allocated_storage = 20` / `storage_type = "gp3"`
  - `max_allocated_storage` でストレージ自動拡張
  - `multi_az = false` / `backup_retention_period = 7` / `deletion_protection = true`
  - `performance_insights_enabled = true`(7 日は無料)
- **Route53 プライベートホストゾーンの `db-pg.<local_domain_name>` を新エンドポイントに向ける**(`DB_HOST` を変えないため)

### 4. ECS(`prod/main-app`)

- `aws_ecs_service` に **`enable_execute_command = true`**
- `network_configuration` を **public サブネット + `assign_public_ip = true`** に変更
- **`lifecycle { ignore_changes = [task_definition, desired_count] }`**
- タスク定義に `linuxParameters.initProcessEnabled = true`(ECS Exec でのゾンビ回避)
- **`deployment_minimum_healthy_percent = 100`**(雛形の既定は 50。`desired_count = 1` では旧タスクを止めてから起動しうる)
- autoscaling は `min_capacity = 1` / `max_capacity = 3`(PoC 相応。雛形の 10 は過剰)
- `output "task_definition_arn"` を追加(デプロイスクリプトが使う)
- タスクロールに `ssmmessages:CreateControlChannel` / `CreateDataChannel` / `OpenControlChannel` / `OpenDataChannel`
- EventBridge ターゲットの `task_definition_arn` を **`arn_without_revision`** に変更

### 5. 本番イメージ(`docker/Dockerfile.prod-main`)

最終ステージへのコピーを増やす。

```dockerfile
COPY --from=build /app/backend/prisma          /app/backend/prisma       # migrations と .generated を含める
COPY --from=build /app/backend/prisma.config.ts /app/backend/
```

`Dockerfile.dev-*` と `docker/home-appuser-dev/` は**削除**(util 廃止に伴う)。

### 6. デプロイスクリプト(`deploy/`)

- `deploy_prod-main.sh` を ADR の 6 ステップに書き換え
  - `terraform apply` → `terraform output -raw task_definition_arn`
  - `run-task` で `cd /app/backend && ./node_modules/.bin/prisma migrate deploy`
  - `aws ecs wait tasks-stopped` → `describe-tasks` で `exitCode` 判定 → 非 0 なら Slack 通知して `exit 1`
  - `aws ecs update-service --task-definition <arn>` → `aws ecs wait services-stable`
- **`run_task.sh` を新規追加**(任意コマンドの `run-task` 実行 + `exitCode` 判定 + CloudWatch Logs の tail)
- **`AWS_PROFILE` を SSO プロファイル名に変更する。** `aws ecr get-login-password --profile <sso>` も `aws ecs run-task` も SSO プロファイルで通る。セッション切れのときは `aws sso login` を促して終了する(静的キーへ退避しない)
- **`aws_account_id` / `cloudfront_distribution_id` の直書きを案件の値に差し替える**(現在は旧案件の実値が残っている。`20260806-derive-first-project.md` の還元項目 3)
- `deploy_dev-*` / `start_*` / `stop_*` は**削除**
- `rollback.sh` を追加(`update-service --task-definition <前のリビジョン>` のみ)

### 7. アプリ側: ジョブ基盤

- スキーマに `ScheduledJob`(`tenantId` を持たない)

  ```prisma
  model ScheduledJob {
    name          String    @id
    nextRunAt     DateTime  @db.Timestamptz(3)
    lastStartedAt DateTime? @db.Timestamptz(3)
    lastEndedAt   DateTime? @db.Timestamptz(3)
    lastStatus    String?
  }
  ```

- `src/jobs/index.ts`(name → 関数のレジストリ)/ `src/jobs/scheduler.ts`(claim ループ)
- `script/run_job.ts`(単発)/ `script/scheduler.ts`(単体プロセス起動用。**将来 C 構成に移すための出口**)
- `src/index.ts` から環境変数でスケジューラを起動(ローカル / テストでは既定 off)
- **SIGTERM 対応**: 新規 claim を止め、実行中のジョブを待つ(ECS の既定猶予は 30 秒)
- `cleanup_uploads` を `src/jobs/` 側へ移し、`script/cleanup_uploads.ts` はエントリポイントだけにする

### 8. 検証

- `pnpm verify`(型・lint・テスト・E2E)
- 統合テストを追加
  - claim が**同時実行で 1 回しか成立しない**こと(`framework/` に置く。既存の `getLock.test.ts` が並行テストの前例)
  - `ScheduledJob` が RLS 拡張の対象外であること
- `terraform plan` の確認 → `apply`
- `aws ecs execute-command` でシェルが取れること
- `run_task.sh` で `cleanup_uploads` が流れること
- ロールバック(`update-service` を前リビジョンへ)が通ること

## PoC 期間の追加コストレバー

半年〜1 年の PoC 運用が前提なので、ADR の 5 点(月 $95〜105 見込み)に加えて次を適用する。**いずれも後から戻せる**。

| 項目 | 変更 | 削減/月 | 採否 |
|---|---|---|---|
| Fargate タスクサイズ | 1vCPU/3GB → **0.5vCPU/2GB** | −$18 | **採用**。負荷を見て戻す |
| RDS インスタンス | `db.t4g.small` → **`db.t4g.micro`** | −$15 | **採用**。1GB RAM でも `max_connections` は約 110 で、`connection_limit = 20` に十分 |
| autoscaling 上限 | 10 → **3** | 事故時の青天井を防ぐ | **採用** |
| Container Insights | `enabled` → **無効** | −$2〜8 | **採用**。必要になったら戻す |
| CloudWatch Logs | 保持期間を **30 日**に設定 | 逓増の防止 | **採用**(既定は無期限) |
| ECR | ライフサイクルポリシーで**直近 10 イメージ**のみ保持 | 逓増の防止 | **採用** |
| Fargate Spot | 通常 → Spot | −70% | **不採用**。2 分前通知で中断されうる。`desired_count = 1` では中断がそのまま短時間の停止になる |
| RDS の停止運用 | 未使用時に stop | 大 | **不採用**。顧客が触る PoC なので常時稼働が必要(最大 7 日で自動再開する制約もある) |

これらを反映した見込みは **月 $60〜70**。

| 項目 | 月額目安 |
|---|---|
| Fargate 0.5vCPU/2GB 常時 1 タスク | $21 |
| ALB | $18 + LCU |
| RDS db.t4g.micro + gp3 20GB | $17 |
| CloudFront + S3(SPA) | $2〜5 |
| ECR / Route53 / CloudWatch | $3〜5 |
| **計** | **$61〜66** |

**ALB($18)が Fargate の次に大きい**が、ECS サービスのロードバランシングに必要で、代替(API Gateway + VPC Link)は複雑さの割に安くならないため、そのまま持つ。

## リスクと注意

- **SG の設定ミスがそのまま公開に直結する。** タスクがパブリック IP を持つため、`is_app` のインバウンドが緩むと外部から直接届く。terraform の差分レビューで SG を最優先で見る
- **マイグレーションは後方互換で。** ローリングデプロイ中は新旧が同居する(ADR の「エージェント向けの注意」)
- **`ecr_digest` の tfvars 運用は残す。** タスク定義は terraform 管理のままなので、digest の受け渡し方法は変えない
- **Single-AZ / ECS Exec のセッションログ未保存は許容した保留**(`docs/known-issues.md`)

## 実施記録

(着手後に追記する)
