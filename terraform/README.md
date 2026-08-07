# terraform — 本番環境(prod 単一)

**状態: 稼働中(2026-08-07)。** 本番アプリがこの構成で動いている。
構築手順は下記「まっさらな AWS アカウントからの構築手順」に通しで書いてある。

決定の根拠は ADR に、手順は計画にある。**構成を変える前にこの 2 本を読むこと。**

- `docs/decisions/20260806-aws-minimal-prod.md` — prod のみ / util を置かず ECS Exec / **NAT なし public サブネット** / Aurora ではなく RDS / **terraform 実行用 IAM ユーザを作らない**
- `docs/decisions/20260806-deploy-and-scheduled-jobs.md` — **サービス更新を terraform の外へ** / migrate は run-task / 定期実行は API プロセス内スケジューラ
- `docs/plans/20260806-aws-prod-setup.md` — 実装手順と実施記録

## 構成

```
environments/prod/
  iam/       IAM ロール(ECS タスク実行 / タスク / EventBridge)
  base/      VPC・サブネット・ルーティング・SG・RDS・内部 DNS・**公開 DNS ゾーン**・S3 Gateway エンドポイント
  main/      ACM・公開レコード・S3 + CloudFront(SPA)・ECR・ALB
  main-app/  ECS クラスタ・タスク定義・サービス・autoscaling・定期実行
```

**`environments/` の下は `prod/` だけ。** 単一環境では `common` / `shared` という軸が成立しないため、
コーポレートドメイン向けの Route53 設定(MX / Google Workspace の DKIM / apex の www リダイレクト)は
**1 つも持ち込んでいない**。`modules/` も置かない(1 箇所からしか呼ばれないモジュールは間接参照にしかならない)。

スタックを 4 つに分けているのは環境ではなく**変更頻度と権限**による。

| スタック | apply 頻度 | 壊れたときの痛み |
|---|---|---|
| `iam` | ほぼゼロ(IAM 書き込み権限が要る) | デプロイユーザの作り直し |
| `base` | 低 | **RDS が飛ぶ** |
| `main` | 低〜中 | CloudFront の再作成(反映待ち) |
| `main-app` | デプロイのたび | ロールバックで戻せる |

スタック間は remote state ではなく **`data` 参照(`00_ref.tf`)** で繋いでいる。

## まっさらな AWS アカウントからの構築手順

**上から順に実行する。** 2026-08-07 にこの順序で実際に構築した(`docs/plans/20260806-aws-prod-setup.md` の実施記録)。
**人手の待ちが 1 箇所だけ挟まる**(NS 委任)。

### 前提

- **IAM Identity Center が有効で、SSO プロファイルが設定済み**であること
  (手順は `docs/plans/20260806-aws-prod-setup.md` のフェーズ 0)
- **親ゾーンに NS 委任レコードを追加できる**こと(別アカウントにあるため、権限が要る)
- 開発コンテナで作業する。`sudo docker` が使えるので、イメージのビルドもここで完結する

```bash
aws sso login --sso-session machineid --use-device-code --no-browser
cd terraform/environments/prod && direnv allow
```

### 1. tfstate バケットを作る

**terraform では作れない**(backend の init 時に存在している必要がある)。CLI で 1 回だけ。

```bash
B=machineid-prod-tfstate-439996178164
aws s3api create-bucket --bucket "$B" --region ap-northeast-1 \
  --create-bucket-configuration LocationConstraint=ap-northeast-1
aws s3api put-bucket-versioning --bucket "$B" --versioning-configuration Status=Enabled
aws s3api put-public-access-block --bucket "$B" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-encryption --bucket "$B" --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}'
aws s3api put-bucket-lifecycle-configuration --bucket "$B" --lifecycle-configuration \
  '{"Rules":[{"ID":"expire-noncurrent","Status":"Enabled","Filter":{},"NoncurrentVersionExpiration":{"NoncurrentDays":90}}]}'
```

### 2. `iam` を apply

```bash
(cd iam && terraform init && terraform apply)
```

### 3. SSM に秘密情報を入れる

**接続文字列(`DB_URL`)は SSM に置かない。** 秘密なのはパスワードだけで、ホスト(CNAME)・
ユーザ・DB 名・接続パラメータは静的なので、entrypoint が組み立てる
(`etc/onstart-prod-main.sh`。ADR 20260806-aws-minimal-prod.md の改定履歴)。

```bash
# パスワードは生成して直接 SSM へ。**画面にも履歴にも残さない**
put() { aws ssm put-parameter --name "/machineid-keys/$1" --type SecureString --overwrite --value "$2" >/dev/null; }
gen() { python3 -c "import secrets,string; a=string.ascii_letters+string.digits+'-_.~'; print(''.join(secrets.choice(a) for _ in range(40)))"; }

put DB_MASTER_PASSWORD "$(gen)"   # RDS マスター(postgres)。terraform と管理操作用
put DB_PASSWORD        "$(gen)"   # アプリ用ロール(appuser)。手順 8 のブートストラップが作る

# **パスワードは URL セーフな文字だけで生成すること**(gen がそうしている)。
# entrypoint が DB_URL に埋め込むため、`@` や `/` が入ると壊れる

# 案件の値を入れる(ダミーではなく実値)
put COOKIE_SECRET       '...'
put CRYPTO_SECRET       '...'
put SES_SMTP_USER       '...'
put SES_SMTP_PASS       '...'
put MASTER_SECRET       '...'
put MASTER_IP_WHITELIST '...'
```

### 4. `base` を apply(VPC / SG / RDS / 公開ゾーン)

```bash
export TF_VAR_db_master_password=$(aws ssm get-parameter \
  --name /machineid-keys/DB_MASTER_PASSWORD --with-decryption --query Parameter.Value --output text)
(cd base && terraform init && terraform apply)
```

### 5. NS 委任(**人手・別アカウント**)

```bash
(cd base && terraform output name_servers)   # 4 本の NS
# → 親ゾーン(kas.jp)に machineid.kas.jp の NS レコードとして登録する
dig +short NS machineid.kas.jp               # 返るまで待つ
```

**委任が済むまで手順 6 に進まないこと。** `aws_acm_certificate_validation` が
DNS 検証を完了できず、**既定 75 分のタイムアウトまで固まる**。

### 6. `main` を apply(ACM / CloudFront / ALB / ECR)

```bash
(cd main && terraform init && terraform apply)
```

### 7. 最初のイメージを push して `main-app` を apply

`main-app` は `ecr_digest` を要求するので、**イメージが先**。

```bash
cd ~/app
ECR=439996178164.dkr.ecr.ap-northeast-1.amazonaws.com/machineid-app-prod
sudo docker build -f docker/Dockerfile.prod-main --build-arg BUILD_VERSION=initial -t machineid-app-prod:latest .
aws ecr get-login-password | sudo docker login --username AWS --password-stdin "$ECR"
sudo docker tag machineid-app-prod:latest "$ECR:latest" && sudo docker push "$ECR:latest"

cd terraform/environments/prod/main-app
digest=$(aws ecr describe-images --repository-name machineid-app-prod \
  --image-ids imageTag=latest --query 'imageDetails[0].imageDigest' --output text)
echo "ecr_digest = \"${digest}\"" > ecr_digest.auto.tfvars
terraform init && terraform apply
```

**この時点でサービスは unhealthy のままタスクの起動と停止を繰り返す。** 正常。
DB にロールもテーブルもテナントも無いためで、手順 8 で解消する
(`/api/ping` はテナント 0 件で 500 を返す。`docs/known-issues.md`)。

### 8. DB のブートストラップ → マイグレーション → シード

**アプリ用ロール `appuser` を作り、そのロール所有のデータベースに作り直す。**
RDS が作成時に用意するデータベースはマスター(`postgres`)所有なので、そのままでは
アプリが `rds_superuser` 相当で動くことになる。

```bash
cd ~/app
# DROP DATABASE は接続を切る(WITH FORCE)。念のためサービスを止めておく
aws ecs update-service --cluster machineid-prod-ecs-cluster \
  --service machineid-prod-ecs-service --desired-count 0
aws ecs wait services-stable --cluster machineid-prod-ecs-cluster --services machineid-prod-ecs-service

./deploy/run_task.sh 'node /app/backend/build/script/db_bootstrap.js'
./deploy/run_task.sh 'cd /app/backend && ./node_modules/.bin/prisma migrate deploy'
./deploy/run_task.sh 'node /app/backend/build/script/seed.js'   # 初期パスワードが表示される
```

**シードが表示する初期パスワードは CloudWatch Logs に残る。** 初回ログイン後に変更すること。

### 9. サービスを起動して SPA を配信

```bash
aws ecs update-service --cluster machineid-prod-ecs-cluster \
  --service machineid-prod-ecs-service --desired-count 1 --force-new-deployment
aws ecs wait services-stable --cluster machineid-prod-ecs-cluster --services machineid-prod-ecs-service

./deploy/deploy_prod-main.sh --skip-backend   # SPA のビルドと配信だけ
```

### 10. 検証

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://api.machineid.kas.jp/api/ping   # 200
curl -s -o /dev/null -w "%{http_code}\n" https://machineid.kas.jp/               # 200
./deploy/show_status.sh
```

以降のデプロイは `./deploy/deploy_prod-main.sh` だけで完結する。

### 順序を間違えたときに起きること

**実際に踏んだもの。** 手順を入れ替えるとこうなる。

| 入れ替え | 症状 |
|---|---|
| NS 委任の前に `main` を apply | ACM の DNS 検証が終わらず、**75 分のタイムアウトまで固まる** |
| ブートストラップ前に migrate | `appuser` が存在せず接続できない |
| シード前にサービスを起動 | `/api/ping` が 500 → ターゲットが永久に unhealthy → タスクが起動と停止を繰り返す |
| サービス稼働中に DROP DATABASE | アプリが即座に再接続してきてロールの作り直しに失敗しうる |
| **デプロイ前の新スクリプトを `run_task.sh` で実行** | サービスは古いリビジョンを指しているので **`Cannot find module`**。`--task-definition <family:rev>` で明示する |

## 実行方法

`environments/prod/` で `direnv allow` を 1 回。**`.envrc` はここに 1 つだけ**で、
direnv が上位へ遡って読むため配下の全スタックに効く(スタックごとに権限を分ける必要が出たら、
そのディレクトリに置いて上書きする)。中身は SSO プロファイル名のみ。

```bash
aws sso login --sso-session machineid --use-device-code --no-browser
cd environments/prod/base && terraform init && terraform plan
```

## 環境固有の値(別環境を作るときはここを差し替える)

| 値 | 現在 | 備考 |
|---|---|---|
| `domain_name` | `machineid.kas.jp` | **`base` / `main` / `main-app` の 3 箇所で同じ値にする** |
| Route53 の親ゾーンへの NS 委任 | **完了** | `base` の apply 後に `terraform output name_servers` を `kas.jp`(別アカウント)へ手で登録する。**これが済むまで `main` を apply しない** |
| `db_master_password` | SSM の `DB_MASTER_PASSWORD` | `TF_VAR_db_master_password` で渡す。**リポジトリに書かない** |
| tfstate バケット | **作成済み** | `machineid-prod-tfstate-439996178164` |
| SSM パラメータ | **投入済み** | `/machineid-keys/*`。**`DB_MASTER_PASSWORD`(postgres)と `DB_PASSWORD`(appuser)は別物** |

## 触るときの注意

- **`aws_ecs_service` の `task_definition` は `ignore_changes` に入っている。** terraform apply では
  イメージが切り替わらない。ロールアウトは `deploy/` のスクリプト(`aws ecs update-service`)の責務
- **タスクが public サブネットにいるのは意図的。** SG が唯一の防御線なので、
  `is_app` のインバウンド(ALB からの 8080 のみ)を緩めない
- **SG のルールは SG 参照で書く。CIDR 直書きにしない**(将来 private へ移すときの書き換えを避けるため)
- **`.terraform.lock.hcl` はコミットする。** `.terraform/` と `*.tfstate` はしない
