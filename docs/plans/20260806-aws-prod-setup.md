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

- **当座の回避**: `unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY`
- **根治**: `backend/src/libs/storage.ts` の `S3Client` に**ローカル時のみ明示的な fake 資格情報を渡す**(`IS_LOCAL_DEVELOPMENT` で分岐)。そのうえで compose から 2 つの環境変数を削除する。**本番はタスクロールなので既定チェーンのままでよい**
- 雛形にも同じ問題があるため還元対象(`20260806-derive-first-project.md` の項目 8)

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

プロファイル名を決めたら、各スタックの `.envrc` に `export AWS_PROFILE=<sso プロファイル名>` を書く。

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
