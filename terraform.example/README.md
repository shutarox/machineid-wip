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

## 関連

- セキュリティヘッダをこの層(CloudFront / ALB)の責務とする決定: `docs/decisions/20260804-security-headers.md`
- 未設定の宿題(HSTS / nosniff): `docs/known-issues.md`
- デプロイスクリプト: `deploy/`。**これらが参照する `~/terraform/` はデプロイ機のホーム配下**で、このディレクトリではない
