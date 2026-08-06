# terraform.example — インフラ構成の参考例

**このディレクトリはそのまま `apply` するものではない。** 元プロダクトの本番構成を汎用化したもので、AWS アカウント側の実体(S3 バケット・IAM・ECR・Route53 ホストゾーン)と 1:1 で対応する値を含む。案件で使うときは**中身を読み替えたうえで別ディレクトリへ切り出す**か、必要な部分だけ写す。

`.example` を付けているのは、**CI もデプロイもこのディレクトリを参照していない**ことを名前で示すため(`pnpm verify` の対象外)。

## 構成

```
environments/
  common/base   Route53 ホストゾーン・ACM・SES など、環境をまたいで 1 つだけ持つもの
  dev|prod/
    base        VPC / サブネット / セキュリティグループ
    iam         デプロイ用の IAM ユーザ・ロール
    main        SPA 配信(S3 + CloudFront)と ECR
    main-app    API の ECS サービス・タスク定義・ALB
    util        バッチ用の ECR
    util-app    バッチの ECS
modules/
```

state は S3 バックエンド(`02_main.tf`)。環境ごとの AWS プロファイルは各ディレクトリの `.envrc` で切り替える。

## 案件で差し替えるもの

| 値 | 場所 | 備考 |
|---|---|---|
| `project_name`(既定 `myapp`) | 各 `01_variables.tf` | **SSM パラメータの名前空間 `${project_name}-keys/` の元**にもなる(`backend/src/config.ts` の `SSM_KEY_PREFIX` と揃える) |
| S3 バケット名 `com.myappdomain.myapp.*` | `02_main.tf`(tfstate)・`main/01_variables.tf`(SPA 配信) | **グローバルに一意**である必要がある。組織のドメイン逆順に変える |
| AWS プロファイル | 各 `.envrc` | `myapp-{dev,prod}-tf-user-{main,iam}` |
| ECR リポジトリ名 | `35_ecr.tf` / `00_ref_35_ecr.tf` | `myapp-app-${environment}` |
| ドメイン | `common/base/16_route53*.tf`・各 `01_variables.tf` | `myappdomain.com` とそのサブドメイン |
| AWS アカウント ID / リージョン | 各 `01_variables.tf` | |

**組織のドメインは `myappdomain.com` というプレースホルダに置き換えてある**(逆引き表記は `com.myappdomain`)。実在のドメインではないので、**そのままでは Route53 / ACM / SES / CloudFront のいずれも成立しない**。案件のドメインに読み替えること。

SES の DKIM トークンや Search Console の検証レコードのような**外部サービスが発行した値**も、旧環境のものが残っている。これらは**移し替えではなく、新しい環境で取り直す**もの。

## この案件(machineid)では採らない部分

**この参考例は dev / prod × main / util の 4 スタック構成だが、machineid は本番 1 環境の最小構成を採る。**このディレクトリを写すときは、以下が意図的に落とされていることを前提にすること(決定と根拠は ADR にある)。

| 参考例にあるもの | machineid での扱い |
|---|---|
| `dev/` 一式 | 作らない(prod のみ) |
| `util` / `util-app`(sshd + 公開 NLB の常駐作業機) | 置かない。ログインは **ECS Exec** |
| `14_nat_gateway.tf`(NAT + EIP) | 置かない。ECS タスクは **public サブネット + `assign_public_ip`**、インバウンドは SG で ALB からのみ |
| `33_rds_postgresql.tf`(Aurora Serverless v2) | **RDS PostgreSQL Single-AZ**(`db.t4g.small` / gp3) |
| `terraform apply` がサービスまで更新する | サービスは `lifecycle { ignore_changes = [task_definition] }` で管理外。ロールアウトは `aws ecs update-service` |
| 定期実行を EventBridge → `run-task` で回す | 軽いものは **API プロセス内のスケジューラ**。重い / 低頻度のみ EventBridge に残す |

- `docs/decisions/20260806-aws-minimal-prod.md`
- `docs/decisions/20260806-deploy-and-scheduled-jobs.md`
- `docs/plans/20260806-aws-prod-setup.md`(実装手順)

## 関連

- セキュリティヘッダをこの層(CloudFront / ALB)の責務とする決定: `docs/decisions/20260804-security-headers.md`
- 未設定の宿題(HSTS / nosniff): `docs/known-issues.md`
- デプロイスクリプト: `deploy/`。**これらが参照する `~/terraform/` はデプロイ機のホーム配下**で、このディレクトリではない
