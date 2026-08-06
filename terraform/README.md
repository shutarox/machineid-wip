# terraform — 本番環境(prod 単一)

**状態: 仮組み(2026-08-06)。まだ一度も `apply` していない。**

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

## 適用順序

依存関係があるので初回はこの順に apply する。**base と main の間に人手の作業が挟まる。**

```
iam → base → [NS 委任を親ゾーンへ登録] → main → [イメージを ECR へ push] → main-app
```

### base と main の間: NS 委任(必須)

親ゾーン `kas.jp` は **別の AWS アカウント**にあり、この terraform の管理外。
`machineid.kas.jp` は未委任なので、`base` の apply 後に手で登録する。

```bash
cd environments/prod/base && terraform output name_servers   # 4 本の NS が出る
# → kas.jp のゾーン(別アカウント)に machineid.kas.jp の NS レコードとして登録
dig +short NS machineid.kas.jp                               # 返るようになるまで待つ
```

**委任前に `main` を apply しないこと。** `aws_acm_certificate_validation` が DNS 検証を
完了できず、**既定 75 分のタイムアウトまで固まる**。公開ゾーンを `main` ではなく `base` に
置いているのは、この待ちを apply の境界に追い出すため。

### main と main-app の間: 最初のイメージ

`main-app` は `var.ecr_digest` を要求する(デプロイスクリプトが `ecr_digest.auto.tfvars` に書く)ため、
**最初のイメージを ECR に push してからでないと apply できない**。

## 実行方法

`environments/prod/` で `direnv allow` を 1 回。**`.envrc` はここに 1 つだけ**で、
direnv が上位へ遡って読むため配下の全スタックに効く(スタックごとに権限を分ける必要が出たら、
そのディレクトリに置いて上書きする)。中身は SSO プロファイル名のみ。

```bash
aws sso login --sso-session machineid --use-device-code --no-browser
cd environments/prod/base && terraform init && terraform plan
```

## 着手前に埋める値

| 値 | 現在 | 備考 |
|---|---|---|
| `domain_name` | `machineid.kas.jp` | **`base` / `main` / `main-app` の 3 箇所で同じ値にする** |
| Route53 の親ゾーンへの NS 委任 | **未実施** | `base` の apply 後に `terraform output name_servers` を `kas.jp`(別アカウント)へ手で登録する。**これが済むまで `main` を apply しない** |
| `db_master_password` | **未設定** | `TF_VAR_db_master_password` で渡す。**リポジトリに書かない** |
| tfstate バケット | **未作成** | `machineid-prod-tfstate-439996178164`。**terraform では作れない**(backend の init 時に存在が必要)ので CLI で先に 1 回作る |
| SSM パラメータ | **未作成** | `/machineid-keys/*`(`DB_URL` / `DB_PASSWORD` / `COOKIE_SECRET` ほか)。秘密なので terraform で作らない |

## 触るときの注意

- **`aws_ecs_service` の `task_definition` は `ignore_changes` に入っている。** terraform apply では
  イメージが切り替わらない。ロールアウトは `deploy/` のスクリプト(`aws ecs update-service`)の責務
- **タスクが public サブネットにいるのは意図的。** SG が唯一の防御線なので、
  `is_app` のインバウンド(ALB からの 8080 のみ)を緩めない
- **SG のルールは SG 参照で書く。CIDR 直書きにしない**(将来 private へ移すときの書き換えを避けるため)
- **`.terraform.lock.hcl` はコミットする。** `.terraform/` と `*.tfstate` はしない
