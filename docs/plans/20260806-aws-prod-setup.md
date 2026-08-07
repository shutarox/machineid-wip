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
- 作業中に見つけた**雛形側の不備**は `docs/template-feedback.md` に追記する(**あの台帳はまっさら化後も残す**)
- AWS 側のリソースはリポジトリのまっさら化と無関係に残る。**tfstate はリポジトリではなく S3 にある**ので、履歴を捨てても state は失われない

## 確定した判断(ユーザー選択)

| 論点 | 決定 |
|---|---|
| 環境 | **prod のみ**。dev は作らない |
| 作業用サーバ | **置かない**。ログインは ECS Exec |
| ネットワーク | **NAT なし**。ECS タスクは public サブネット + `assign_public_ip`、インバウンドは SG で ALB からのみ |
| DB | **RDS PostgreSQL 18 / Single-AZ / db.t4g.micro / gp3**(Aurora Serverless v2 をやめる)。18 はローカル・CI の `postgres:18` に合わせたもので、ap-northeast-1 で `db.t4g.micro` × 18.4 が使えることを確認済み |
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

- ~~アプリのドメイン名~~ → **`machineid.kas.jp`(2026-08-06 決定)**
- ~~アプリ向け Route53 ゾーンの持ち方~~ → **決定済み(2026-08-06)**。実測で次が分かった。
  - `kas.jp` は Route53 にあるが **`machineid-prod` とは別アカウント**(このアカウントのホストゾーンは 0 件)
  - `machineid.kas.jp` は **未委任**(`dig NS` が空)
  - → **サブドメインゾーンを `machineid-prod` に作り、親へ NS 委任を手で登録する**一択
  - **ゾーンは `main` ではなく `base` に置いた。** 委任は人手なので、`aws_acm_certificate_validation` と同じスタックに置くと**検証が既定 75 分のタイムアウトまで固まる**。`base` に置けば apply の境界が委任の手前に来る(`terraform/README.md` の「適用順序」)
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
      base/      VPC・サブネット(public×2 / private×2)・ルートテーブル・IGW・SG・RDS
                 ・S3 Gateway エンドポイント・プライベートホストゾーン・**公開ゾーン**
      main/      ACM・公開レコード・S3 + CloudFront(SPA)
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

**terraform とは独立していて、ドメインや tfstate バケットの決定を待たずに実施できる。** 既存の IAM ユーザー / アクセスキーには影響しない。

事前に確認すること:

- **アカウントが Organization のメンバーかどうか。** インスタンスには**組織インスタンス**と**アカウントインスタンス**の 2 種類があり、**目的を果たせるのは組織インスタンスだけ**(下表)。組織インスタンスは**管理アカウントでのみ**作成でき、組織に 1 つだけ
- **リージョンは慎重に選ぶ。** 組織インスタンスは有効化したリージョンに置かれる(**追加リージョンへの複製は可能**)。**`ap-northeast-1` を選ぶ**。組織に既存のインスタンスがあれば**そのリージョンが優先**される

#### インスタンス種別の違い(AWS 公式の比較表より・2026-08-06 確認)

| 機能 | 組織インスタンス(管理アカウント) | アカウントインスタンス(メンバー / 単体) |
|---|---|---|
| 組織内の数 | **1 つだけ** | **複数可** |
| **Multi-account permissions** | **Yes** | **No** |
| **AWS アカウントへの SSO(access portal)** | **Yes** | **No** |
| AWS 管理アプリケーションへの SSO | Yes | Yes |
| SAML 2.0 のカスタムアプリ | Yes | No |
| 委任管理者 | Yes | No |
| 追加リージョンへの複製 | Yes | No |

**コンソールの「アカウント固有の限定使用のみの場合は [有効化] を選択」という案内に釣られないこと。** これは「このアカウント内の **AWS 管理アプリケーション**向けなら」という意味で、**AWS アカウントそのものへの SSO ログインはできない**。IAM ユーザーを廃す目的には使えない。
- **ID の出どころ。** 組織が Google Workspace を使っているため外部 IdP 連携(SAML + SCIM)も可能だが、**運用者 1 名の PoC では内蔵 ID ストアで十分**。後から切り替えられる

#### 0-a. 先に開発コンテナの資格情報の混線を直す(これをやらないと AWS CLI が一切通らない)

`docker-compose.local.yml` が MinIO 用に **`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` をコンテナ全体の環境変数**として設定している。**環境変数は AWS の資格情報チェーンで `~/.aws` のプロファイルより優先される**ため、SSO プロファイルを作っても `minioadmin` が使われ続ける。

```
$ aws sts get-caller-identity
InvalidClientTokenId: The security token included in the request is invalid.   ← 実測(2026-08-06)
```

**デプロイスクリプトの `aws ecr get-login-password` も同じ理由で失敗する。**

**対応済み(2026-08-06)**: 資格情報チェーンと**衝突しない名前**に改名し、SDK へ明示的に渡す形にした。

| 変更 | 内容 |
|---|---|
| `docker-compose.local.yml` / `ci.yml` | `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` → **`S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`** |
| `backend/src/config.ts` | `S3_CREDENTIALS` を追加(両方揃っているときだけオブジェクト、無ければ `undefined`) |
| `backend/src/libs/storage.ts` | `S3Client` に `credentials: Config.S3_CREDENTIALS` を渡す。**本番は `undefined` → 既定チェーン = タスクロール** |

**移行中も両方の状態で動く**: 新コードは `S3_ACCESS_KEY_ID` が未設定なら `credentials: undefined` になり、
稼働中コンテナに残っている旧 `AWS_ACCESS_KEY_ID` を既定チェーンが拾う。コンテナ再作成後は新名で明示的に渡る。

**完了(2026-08-06)**: 開発コンテナを再作成し、`AWS_ACCESS_KEY_ID` が消えたこと・`env -u` なしで
`aws sts get-caller-identity --profile machineid-prod` が通ること・E2E(実 MinIO 経由の画像アップロード)が
通ることを確認。暫定で置いていた `.envrc` の `unset` 3 行は削除済み。

- 雛形にも同じ問題があるため還元対象(`20260806-derive-first-project.md` の項目 6)

#### 0-b. コンソールでの初期設定(人手が必要)

**組織インスタンスの有効化には公開 API が無く、コンソール専用。** `aws sso-admin create-instance` が作るのは*アカウントインスタンス*で、AWS アカウントへのアクセス管理には使えないため代用にならない。また、最初の割り当てが無いと `aws configure sso` が選択先を持てないので、ここまでは人手で行う。

> **実測(2026-08-06)**: メンバーアカウント側で有効化しようとして次のエラーになった。
>
> ```
> The organization management account (394530725171) does not allow its members to create instances.
> ```
>
> これは**アカウントインスタンス**の作成がブロックされたもの。メンバーアカウントから作れるのは
> アカウントインスタンスだけで、それは AWS アカウントへのアクセス管理に使えないため、
> **許可されていても解決しない**。**組織インスタンスを管理アカウントで有効化する**のが正しい。
>
> 手順は下記に読み替える:
>
> 1. **管理アカウント**にサインイン
> 2. **既存の Identity Center が無いか先に確認**。組織インスタンスは組織に 1 つだけで、
>    **既に別リージョンで有効ならそのリージョンを使うしかない**(「ap-northeast-1 を選ぶ」より優先)
> 3. 無ければ有効化 → パーミッションセット作成 → **machineid 用のメンバーアカウントに対して**割り当て
> 4. 有効化は**組織全体に効く**。共用 Organization なら、既存インスタンスに
>    パーミッションセットを足すだけで済むことがある
> 5. 有効化後は **委任管理者(delegated administrator)をメンバーアカウントに設定**し、
>    日常の割り当て作業を管理アカウントから離す
>
> この場合 `aws configure sso` の `sso_account_id` には**メンバーアカウントの ID** が入る。

1. リージョンを **`ap-northeast-1`** にして **IAM Identity Center を有効化**
2. ユーザーを作る(自分)
3. パーミッションセットを作る: **`AdministratorAccess`**(AWS 管理ポリシー)
4. 「AWS アカウント」から **ユーザー × パーミッションセット**を対象アカウントに割り当てる
5. **MFA を必須にする**(既定は登録を促すだけ。設定 → 認証 → MFA)
   - プロンプトは AWS 既定の「コンテキスト対応」ではなく **「サインインごとに毎回」** を選ぶ。
     既定が緩いのは*限定権限のユーザーが多数いる組織*を想定しているためで、
     **ここは存在するユーザーが管理者 1 名**なので前提が違う。コンテキスト対応だと
     「パスワード + 信頼済みブラウザ」で MFA を迂回できてしまう
   - 摩擦を決めるのは MFA 設定より **SSO セッション長**(設定 → 認証、既定 8 時間)。
     8 時間なら毎回でも実質 1 日 1 回。**煩わしければ MFA を緩めるのではなくセッションを伸ばす**
   - MFA タイプの「**セキュリティキーと組み込みの認証ツール**」(WebAuthn / FIDO2)は**外さない**。
     Mac の Touch ID がこれに当たり、**TOTP と違ってフィッシング耐性がある**(認証がオリジンに
     紐づくため偽サイトが中継できない)。絞るなら逆に TOTP を外す方向
   - ただし**管理者 1 名の間は 2 つ登録する**(日常: Touch ID / バックアップ: TOTP かセキュリティキー)。
     Touch ID は端末に紐づくため、単独登録だと端末故障でロックアウトし、復旧がルートアカウント経由になる。
     管理者が増えて MFA リセットの経路ができたら WebAuthn 専用に寄せる
6. 次の 2 つを控える(`aws configure sso` で聞かれる)
   - **AWS access portal URL**(`https://d-xxxxxxxxxx.awsapps.com/start`)
   - **SSO region**(`ap-northeast-1`)

#### 0-c. 開発コンテナから SSO ログイン

```bash
# 0-a が未対応の間は、AWS を叩く全コマンドで MinIO のダミーを外す必要がある。
# シェル状態は残らないので、その都度 env -u を付けるのが確実
env -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN \
  aws sso login --sso-session <session 名> --use-device-code --no-browser
```

**`--use-device-code` が必須。** `--no-browser` だけだと**認可コード + localhost コールバック方式**
(`redirect_uri=http://127.0.0.1:<port>/oauth/callback`)になり、**ホストのブラウザからコンテナ内の
ポートに戻れないため完了しない**(実測)。デバイスコード方式なら「URL を開いてコードを入力」だけで
コンテナ側のログインが完了する。

`aws configure sso` の対話に入らず、**`~/.aws/config` を直接書いてから `aws sso login`** するほうが
コンテナでは扱いやすい。アカウント ID とロール名は、ログイン後に一覧から取得できる:

```bash
# アクセストークンは ~/.aws/sso/cache/*.json の accessToken(ログの残る場所に出さないこと)
aws sso list-accounts      --access-token "$TOKEN" --region <sso リージョン>
aws sso list-account-roles --access-token "$TOKEN" --account-id <上で得た ID> --region <sso リージョン>
```

プロファイル名を決めたら、**`terraform/environments/prod/.envrc` に 1 つだけ** `export AWS_PROFILE=<sso プロファイル名>` を書く(direnv は上位へ遡って読むので配下の全スタックに効く)。雛形はスタックごとに `.envrc` を置いていたが、それは `iam` スタックだけ別の IAM ユーザを使っていたためで、**SSO プロファイルに統一した今は分ける理由がない**。

**`.envrc` に個人を特定する情報は入らない。** SSO では ID がブラウザログイン時に決まるため、設定に残るのは「どのポータル・どのアカウント・どのパーミッションセットか」だけ。

| ファイル | コミット | 中身 | 個人差 |
|---|---|---|---|
| `terraform/environments/**/.envrc` | **する** | `export AWS_PROFILE=machineid-prod`(プロファイル**名**のみ) | なし。**全員同じ名前に揃えるための仕組み** |
| `~/.aws/config` | しない | `sso_start_url` / `sso_account_id` / `sso_role_name` / `region` | **なし**(組織で共通。docs に貼って各自コピーでよい) |
| `~/.aws/sso/cache/` | しない | 短命トークン | あり |

権限が人によって違う場合は `sso_role_name` が変わるのでプロファイルを分ける(`machineid-prod` / `machineid-prod-ro`)。

**地雷**: `.gitignore` の `.envrc` は**階層を問わずマッチする**。`terraform.example/` の `.envrc` が追跡されているのは ignore ルールより前にコミット済みだからで、**これから作る `terraform/environments/**/.envrc` は `git add` しても黙って無視される**。否定パターンを足すこと。

```gitignore
.envrc
!terraform/environments/**/.envrc
```

#### 0-d. 検証(ここから CLI で確認できる)

```bash
aws sts get-caller-identity                     # AssumedRole の ARN が返る
aws sso-admin list-instances                    # InstanceArn / IdentityStoreId
aws sso-admin list-permission-sets --instance-arn <arn>
aws identitystore list-users --identity-store-id <id>
aws sso-admin list-account-assignments \
  --instance-arn <arn> --account-id <id> --permission-set-arn <ps-arn>
```

以降のパーミッションセット追加・割り当ては CLI で完結する(`create-permission-set` /
`attach-managed-policy-to-permission-set` / `create-account-assignment`)。**MFA の必須化だけは
公開 API が無くコンソール設定。**

#### 実施記録(2026-08-06 完了)

| 項目 | 値 |
|---|---|
| インスタンス種別 | **組織インスタンス**(所有: 管理アカウント `394530725171`) |
| InstanceArn | `arn:aws:sso:::instance/ssoins-7758a52a6de38d8c` |
| IdentityStoreId / ポータル | `d-95679724b1` → `https://d-95679724b1.awsapps.com/start` |
| **PrimaryRegion** | **`ap-northeast-1`** |
| Organization | `o-276ybtepps`(FeatureSet: ALL、SCP 有効) |
| ワークロードアカウント | `machineid-prod` / **`439996178164`** |
| 許可セット | `AdministratorAccess` |
| AWS CLI プロファイル | `machineid-prod`(`~/.aws/config`) |
| **静的アクセスキー** | **0 本**(ADR の決定 6 どおり) |

検証結果:

```
$ aws sts get-caller-identity --profile machineid-prod
Arn: arn:aws:sts::439996178164:assumed-role/AWSReservedSSO_AdministratorAccess_.../shuhei.kawasaki
```

##### 踏んだ罠(手順に反映済み)

1. **メンバーアカウントで有効化しようとして失敗**
   (`The organization management account (394530725171) does not allow its members to create instances.`)。
   作られようとしていたのは**アカウントインスタンス**で、そもそも目的を果たせない。組織インスタンスを
   管理アカウントで有効化するのが正解 → 0-b の注記
2. **組織インスタンスが us-east-2 に既存だった。** ユーザー・グループ・許可セットとも空だったため
   削除して `ap-northeast-1` で作り直した。**空でなければ触らない**判断だった
   (リージョン差の実害は「新規サインインの可用性」と「ID 情報の所在」程度)
3. **`aws sso login --no-browser` だけでは完了しない。** `--use-device-code` が必須 → 0-c
4. **compose の MinIO 用環境変数が AWS の資格情報を潰す。** 全 AWS コマンドに `env -u` が要る → 0-a

##### 残タスク

- **0-a の根治**(`libs/storage.ts` + compose)。コンテナ再作成を伴うため未実施
- 委任管理者の設定(任意。日常の割り当てを管理アカウントから離す)
- **SCP が有効**なので、terraform でリソース作成が想定外に拒否されたら、
  管理アカウント側のポリシー(リージョン制限など)を疑うこと

**削除するもの**: `14_user.tf-user-iam.tf` / `14_user.tf-user-main.tf` と対応するポリシー JSON 2 本(`12_policy.tf-user-*.json`)。

`terraform-local-developer`(SSM 読み取り専用)は用途があるので残してよいが、**静的キーを配るくらいなら SSO のパーミッションセットに寄せる**ほうがよい。ローカル開発は `IS_LOCAL_DEVELOPMENT=true` のとき `~/.ssm-keys.json` を読むので、そもそも AWS への到達を必要としない。

#### 実施記録(2026-08-06 仮組み完了・未 apply)

`terraform/` に 4 スタック 30 ファイルを作成。**`terraform fmt` 差分なし、4 スタックとも `terraform validate` 成功。**
`apply` はしていない(下記の未確定値が埋まってから)。詳細は `terraform/README.md`。

踏んだもの:

- variable の `description` 内で `${project_name}` と書くと**補間として解釈されて validate が落ちる**
- `aws_db_instance` のバックアップ時刻は **`backup_window` / `maintenance_window`**。
  `preferred_` 接頭辞が付くのは `aws_rds_cluster`(Aurora)側

雛形から意図的に変えた点:

| | 雛形 | ここ |
|---|---|---|
| SG の書き方 | `ingress`/`egress` ブロック | **`aws_vpc_security_group_*_rule`(独立リソース)** — 差分が読みやすく、ルール単位で追える |
| SPA バケットポリシー | `distribution/*` を許可 | **該当ディストリビューション 1 つに限定** |
| EventBridge のターゲット | リビジョン固定 ARN | **`arn_without_revision`** |
| CloudFront | レスポンスヘッダポリシーなし | **HSTS / nosniff / frame-options を付与**(`docs/known-issues.md` の HSTS 宿題を解消) |
| ログ保持 | 無期限 | **30 日** |
| ECR | ライフサイクルなし | **直近 10 イメージ** |

#### apply 実施記録(2026-08-07)

**`iam` / `base` / `main` を apply 済み。`.tf` の修正は 1 箇所も不要だった。**

| スタック | 結果 |
|---|---|
| `iam` | **6 リソース**(ECS タスク実行 / タスク / EventBridge のロール) |
| `base` | **28 リソース**(VPC・サブネット 4・IGW・ルートテーブル 2・SG 3 + ルール 5・S3 Gateway エンドポイント・内部ゾーン・公開ゾーン・RDS PostgreSQL 18) |
| `main` | **26 リソース**(先行 10 = ECR・S3 ×2、委任後 16 = ACM ×2・CloudFront・ALB・公開レコード) |
| `main-app` | **未実施**。`var.ecr_digest` が必須で、ECR に最初のイメージが要る |

| 主要な ID | 値 |
|---|---|
| VPC | `vpc-0381aa84f4f64be34` |
| RDS | `machineid-prod-pg.c70uqkw64d4y.ap-northeast-1.rds.amazonaws.com`(アプリからは `db-pg.prod.internal`) |
| ECR | `439996178164.dkr.ecr.ap-northeast-1.amazonaws.com/machineid-app-prod` |
| CloudFront | `E3ARCG9SOD4FO3` |
| SG | alb `sg-0e5df1beebd281436` / app `sg-0295a8a7f3457a70d` / rds `sg-0f92ad6e92a0e95d5` |

疎通確認(2026-08-07):

| 対象 | 結果 |
|---|---|
| `https://machineid.kas.jp/` | **403**(S3 が空)・**証明書検証 OK** |
| `https://api.machineid.kas.jp/api/ping` | **503**(ターゲット無し)・**証明書検証 OK** |
| `http://api.machineid.kas.jp/` | **301 → HTTPS** |

##### 手順の要点

- **tfstate バケットは terraform では作れない**(backend の init 時に存在が必要)。CLI で先に作成し、
  バージョニング / パブリックアクセスブロック / SSE-S3 / 非現行 90 日削除を設定した
- **NS 委任を挟むため `main` は 2 回に分けた**。委任と無関係な ECR・S3 は `-target` で先行作成し、
  委任の伝播後に残り 16 リソースを通常 apply した
- **`terraform` コマンドは既定の権限では実行できない**(`plan` すらブロックされる)。
  `.claude/settings.json` に `Bash(terraform ...)` の allow を追加した。**`destroy` は deny のまま**
- **SSO セッションは 8 時間で切れる**。切れたら `aws sso login --sso-session machineid --use-device-code --no-browser`

##### SSM パラメータ(`/machineid-keys/`)

`DB_MASTER_PASSWORD` / `DB_PASSWORD` / `COOKIE_SECRET` / `CRYPTO_SECRET` / `SES_SMTP_USER` / `SES_SMTP_PASS` /
`MASTER_SECRET` / `MASTER_IP_WHITELIST` を **SecureString** で登録済み。

- `DB_PASSWORD` は生成から保存まで表示せず、terraform へは SSM から読んで `TF_VAR_` で渡した
- **`DB_URL` はマスターユーザ `postgres` で作っている。** RDS に他のユーザが存在せず、
  private サブネットにいるため接続手段自体がまだ無い。**最小権限の `appuser` への切り替えは
  `main-app` 到達後の課題**(`backend/prisma/createuser.sql` は MySQL 用の残骸だったので削除済み)

#### フェーズ 5〜6 の実施記録(2026-08-07・**本番アプリ稼働まで到達**)

`main-app` を apply し、マイグレーション・シード・SPA 配信まで通した。**ログインが通ることを確認済み**。

```
POST /api/login          → 200(デモテナント / 管理者 ADMIN)
GET  /api/private/master → 200(セッション認証)
GET  /api/ping           → 200(60ms)
https://machineid.kas.jp/       → 200(/users も 200 = SPA ルーティング動作)
セキュリティヘッダ → HSTS / nosniff / frame-options / referrer-policy
```

##### 潰した不具合(すべて雛形から引き継いだもの)

**本番イメージは Prisma 7 / workspace 移行以降ビルドすら通らない状態だった。**

| 症状 | 原因と対処 |
|---|---|
| `backend/pnpm-lock.yaml not found` | workspace のロックはルートに 1 本。ビルドステージをルート基準へ組み直し |
| 起動時に `pnpm-workspace.yaml が見つかりません` | `repoRoot()` の探索対象を最終ステージにコピーしていなかった |
| `Can't write to .../@prisma/engines` | 最終ステージの COPY が root 所有。`--chown=appuser` を付与 |
| `no pg_hba.conf entry ... no encryption` | **RDS は SSL 必須**(`rds.force_ssl` 既定 1)。`DB_URL` に `sslmode` を追加 |
| `self-signed certificate in certificate chain` | RDS CA バンドルをイメージに同梱し `NODE_EXTRA_CA_CERTS` を設定 |
| CA を入れても効かない | **`su - appuser` が環境変数を捨てる**。`APPX_` 接頭辞でタスク定義に渡す必要があった |
| ホスト名検証が通らない | 証明書の SAN は RDS 実エンドポイントのみ。**最終的に CNAME + `sslmode=no-verify` に決着**し、`DB_URL` は SSM に置かず entrypoint が組み立てる形にした(ADR 改定履歴 2026-08-07 の 2 行) |
| サービスが古いイメージのまま | **`ignore_changes = [task_definition]` の想定どおりの挙動**。`update-service --task-definition` で切り替える |
| ターゲットが永久に unhealthy | `/api/ping` がテナント 0 件で 500(`docs/known-issues.md`)。シードで解消 |

##### 初回構築だけの特殊事情

- **タスク定義とサービスが同時にできる**ため、ADR の「タスク定義登録 → migrate → update-service」の順序が素直に適用できない。
  `-target=aws_ecs_task_definition.main` で先にタスク定義を作り、migrate を流してからサービスを作った
- **`-target` を使うと一部の `output` が state に入らない**(`task_network_configuration` が取れず run-task に失敗)。
  サブネットと SG は `base` の output から直接渡した

##### デプロイスクリプトと運用スクリプトの検証(2026-08-07)

| 対象 | 結果 |
|---|---|
| `deploy_prod-main.sh` | **4 回完走**(フル 1 / `--skip-frontend` 3)。clone → build → push → terraform → migrate → update-service → S3 + invalidation |
| `run_task.sh` | `cleanup_uploads --dry-run` / `db_bootstrap` / `migrate deploy` / `seed` を本番で実行 |
| `rollback.sh` | 6→5、5→6、7→5 を実測 |
| `show_status.sh` | サービス状態 / `GIT_COMMIT` / ターゲット健全性 |
| `exec.sh` | コマンド生成と `--run` を確認(session-manager-plugin 導入後) |

##### さらに潰した不具合

| 症状 | 原因と対処 |
|---|---|
| ロールバック先が存在しない | **terraform が古いリビジョンを deregister していた**。ACTIVE が常に 1 本だけ → `skip_destroy = true` |
| ロールバックが壊れたリビジョンに着地する | `current - 1` を計算していた。**6 が壊れて 5 に戻し、7 も駄目なとき 6 に行く**。ECS のデプロイ履歴(`sourceServiceRevisions`)から引く実装に変更 |
| `DB_PASSWORD` が誰にも使われていない | MySQL 時代の `/etc/my.cnf` 転記の名残。**転記処理だけが失われ注入だけ残っていた**。`~/.pgpass` の生成に作り替え |
| `CREATE DATABASE ... OWNER appuser` が失敗 | **RDS のマスターは真の superuser ではない**。`GRANT appuser TO postgres` が要る |
| デプロイ前の新スクリプトが `run_task.sh` で動かない | サービスは古いリビジョンを指している。`--task-definition` を追加 |

##### アプリ用ロールへの切り替え(2026-08-07)

**マスター(`postgres`)ではなくアプリ用ロール(`appuser`)で接続する形に変更した。**
既存 DB の移管ではなく **DROP → CREATE** で作り直している(手順の再現性を優先)。

- SSM を 2 本に分離: `DB_MASTER_PASSWORD`(postgres・terraform と管理操作)/ `DB_PASSWORD`(appuser・アプリと `.pgpass`)
- `backend/script/db_bootstrap.ts` を追加(削除した MySQL 用 `createuser.sql` の置き換え)
- `.pgpass` は `appuser` のものを生成する

**通しの構築手順は `terraform/README.md` の「まっさらな AWS アカウントからの構築手順」に書いた。**
順序を間違えたときに何が起きるかも表にしてある。

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

**実施済み(2026-08-07)**: util 廃止に伴い次を削除した。参照はこれらの間で閉じており、
compose・CI・deploy スクリプトからの参照はゼロだった。

```
etc/onstart-dev-main.sh   etc/onstart-dev-util.sh   etc/onstart-prod-util.sh
docker/Dockerfile.dev-main  docker/Dockerfile.dev-util  docker/Dockerfile.prod-util
docker/home-appuser-dev/
```

残るのは `Dockerfile.local`(開発コンテナ)と `Dockerfile.prod-main`(本番)の 2 本、
onstart は `onstart-local.sh` と `onstart-prod-main.sh` の 2 本。

### 6. デプロイスクリプト(`deploy/`)

- `deploy_prod-main.sh` を ADR の 6 ステップに書き換え
  - `terraform apply` → `terraform output -raw task_definition_arn`
  - `run-task` で `cd /app/backend && ./node_modules/.bin/prisma migrate deploy`
  - `aws ecs wait tasks-stopped` → `describe-tasks` で `exitCode` 判定 → 非 0 なら Slack 通知して `exit 1`
  - `aws ecs update-service --task-definition <arn>` → `aws ecs wait services-stable`
- **`run_task.sh` を新規追加**(任意コマンドの `run-task` 実行 + `exitCode` 判定 + CloudWatch Logs の tail)
- **`AWS_PROFILE` を SSO プロファイル名に変更する。** `aws ecr get-login-password --profile <sso>` も `aws ecs run-task` も SSO プロファイルで通る。セッション切れのときは `aws sso login` を促して終了する(静的キーへ退避しない)
- **`aws_account_id` / `cloudfront_distribution_id` の直書きを案件の値に差し替える**(現在は旧案件の実値が残っている。`docs/template-feedback.md` の項目 3)
- `deploy_dev-*` / `start_*` / `stop_*` は**削除**
- `rollback.sh` を追加(`update-service --task-definition <前のリビジョン>` のみ)

### 7. アプリ側: ジョブ基盤 — **実施済み(2026-08-07)**

| 追加 | 内容 |
|---|---|
| `ScheduledJob` モデル | `tenantId` を持たない(RLS 検査の対象外)。`name` が主キー、`nextRunAt` / `intervalSec` / `lastStartedAt` / `lastEndedAt` / `lastStatus` |
| `src/jobs/index.ts` | ジョブのレジストリ(name → `{ intervalSec, description, run }`) |
| `src/jobs/cleanupUploads.ts` | `script/cleanup_uploads.ts` から本体を移設 |
| `src/jobs/scheduler.ts` | claim ループ・SIGTERM 対応・失敗の記録 |
| `script/{cleanup_uploads,run_job,scheduler}.ts` | エントリポイント 3 本 |
| `test/integration/framework/scheduler.test.ts` | 7 テスト |

**EventBridge の `cleanup_uploads` は撤去した**(`39_scheduled_task.tf`)。IAM ロールとポリシーは
残してあるので、重い・低頻度のジョブが出てきたらルールを足すだけで復活できる。

#### 設計の要点

- **claim は条件付き `updateMany`。** `WHERE name = ? AND next_run_at <= now()` で
  `next_run_at` を進める。READ COMMITTED なので負けた側は 0 件になる。
  **行ロックも AsyncLocalStorage も要らない**
- **ジョブ本体は tx の外**。tx は既定 5 秒で切れ、`assertNotInTransaction` が tx 内の外部 I/O を禁止している
- **`timer.unref()`**。これが無いと SIGTERM 後にイベントループが空にならず SIGKILL を待つ
- **`ensureJobRows` は既存行を上書きしない**(`upsert` の `update` が空)。
  デプロイのたびに `nextRunAt` をリセットすると、間隔の長いジョブが永久に走らない
- **スケジューラは既定 off**(`SCHEDULER_ENABLED`)。本番だけ `APPX_SCHEDULER_ENABLED=true` を渡す。
  ローカルとテストで勝手に走らせない

#### 途中で直したもの

**テストが claim の SQL を写経していた**(knip が `tickOnceForTesting` の未使用で気づかせた)。
写経は**実装と乖離しても気づけない**ので、`claim` に `intervalSec` を引数で渡す形にして
`export` し、**テストが実装そのものを検証する**ようにした。

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
