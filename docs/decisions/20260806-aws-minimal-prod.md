# ADR: 本番 1 環境の最小構成とし、常駐ユーティリティサーバ・NAT Gateway・Aurora を置かない

- 状態: **採用**(2026-08-06)
- 関連: `terraform.example/README.md`、`docs/decisions/20260806-deploy-and-scheduled-jobs.md`、`docs/plans/20260806-aws-prod-setup.md`

## 背景

雛形の `terraform.example/` は元プロダクトの構成を汎用化したもので、**dev / prod の 2 環境 × (main / util) の 4 スタック**を持つ。このうち `util` は「各種スクリプトを実行するためのユーティリティサーバ」として常駐しており、実体は次のものだった。

- `Dockerfile.dev-util` が `openssh-server` を入れ、`etc/onstart-dev-util.sh` の最後が `exec /usr/sbin/sshd -D`
- **公開 NLB**(`util/36_nlb.tf`)のポート 1022 → コンテナの 22 に転送
- 同時に `pm2` で `pnpm dev` を回し、ALB 経由で SPA(443)と API(8443)も配信 = **dev には同じアプリのデプロイが 2 つある**(ビルド版の `main-app` とソース版の `util-app`)
- SSH 鍵が `docker/home-appuser-dev/.ssh` としてイメージに焼かれている

一方、**定期バッチはすでに util ではなく main 側で動いている**(`main-app/39_ecs-scheduled-task.tf` が main のタスク定義に `containerOverrides.command` を渡して EventBridge から `run-task` する)。つまり util が担っていたのは「SSH で入って手作業する」ことと「dev 環境そのもの」の 2 つだけだった。

今回の案件は**コストを最小化したい**という要件がある。この構成をそのまま起こすと、dev 側だけで月 $120 前後(util の Fargate 常駐 $85 + NLB $18 + ALB $18)が乗る。

**前提となる案件のフェーズ**: 顧客数が少なく、**半年〜1 年にわたって PoC 的な運用**が続く見込み。メンテナンス時間を取ることに制約が少ない。この ADR の判断、特に NAT を置かない選択は**この前提に依存している**(下記「撤退条件」)。

## 決定

**本番 1 環境だけを、次の 5 点で構成する。**

| # | 決定 | 効果(月額目安) |
|---|---|---|
| 1 | **環境は prod のみ**。dev 環境を作らない | dev 一式が不要に |
| 2 | **常駐 util サーバを置かない**。外部からのログインは **ECS Exec**(SSM Session Manager) | −$121(Fargate 常駐 + NLB + ALB) |
| 3 | **NAT Gateway を置かない**。ECS タスクを public サブネットに置き `assign_public_ip = true`、インバウンドはセキュリティグループで ALB からのみに絞る | −$45 + ECR pull のデータ処理料 |
| 4 | **DB は Aurora Serverless v2 ではなく RDS PostgreSQL の Single-AZ 最小構成**(db.t4g.small / gp3) | −$30〜43 |
| 5 | **ECS Exec を有効化する**(`enable_execute_command` + タスクロールに `ssmmessages` の 4 権限) | ±0 |
| 6 | **terraform 実行用の IAM ユーザーを作らない**。人間は **IAM Identity Center(SSO)**、CI は **OIDC**。**静的アクセスキーをどこにも置かない** | ±0(Identity Center は無料) |

結果として prod 一式が **月 $95〜105 程度**に収まる見込み(Fargate api $39 / ALB $18 + LCU / RDS $32 / CloudFront + S3 $2〜5 / ECR・Route53・CloudWatch $3〜10)。

### 根拠

**2. ECS Exec を採る理由**は、コストだけではなく到達性と監査にある。

| | 常駐 util + sshd | ECS Exec |
|---|---|---|
| 公開エンドポイント | **NLB:1022 が常時インターネットに露出** | なし |
| 認証 | SSH 鍵(**イメージに同梱**) | IAM |
| 監査 | sshd のログのみ | CloudTrail に API 呼び出しが残り、セッションログも出力可能 |
| 費用 | 常駐分 + NLB | 実行時のみ |

**3. NAT を置かない理由**は、**PoC 期間中の固定費を削ること**に尽きる。

検討の初期には「定期実行を `run-task` で高頻度に回すと ECR pull が NAT を通って月 $200 を超える」というより強い理由があったが、**定期実行を API プロセス内のスケジューラで回すと決めた時点でこの根拠は消えている**(`20260806-deploy-and-scheduled-jobs.md`)。pull はデプロイ時の数回/日だけになり、NAT を戻した場合の実コストは **固定 $45.3 + データ処理 $1〜2 = 月 $47 程度**にとどまる。したがってこの決定は「$200 を避ける」判断ではなく、**「PoC の 6〜12 か月間、月 $47 を払わない」判断**である。

セキュリティ上の実質は「タスクにパブリック IP が付くが、セキュリティグループのインバウンドを ALB の SG からの 8080 のみに絞る」ことで担保する。RDS は private サブネットのままで、アプリの SG からの 5432 のみを許可する。**到達性の観点では private サブネット配置と等価**(SG はステートフルかつ既定 deny)であり、差は多層防御の層数にある。

| | private + NAT | public + SG(本決定) |
|---|---|---|
| SG に誤って `0.0.0.0/0` を足したら | まだ届かない(IGW への経路がない) | **即座にインターネットに露出** |
| 防御層 | ルーティング + SG の 2 層 | **SG の 1 層のみ** |

**この 1 層差を PoC 期間に限って受け入れる、というのが決定の中身**である。「public サブネットだから危険」ではなく、「設定ミスの余地が 1 層分ぶん広い」ことを承知で選んでいる。

**4. RDS を採る理由**は削減額($30〜43/月)よりも**月額が予測可能になる**ことが大きい。Aurora Serverless v2 は無負荷でも `min_capacity = 0.5` 分(約 $53/月)が下限で、加えて I/O 課金($0.24/100 万リクエスト)が読めない。アプリは Prisma + 素の PostgreSQL しか使っておらず(**Aurora 固有機能への依存はコードに存在しない**)、ローカル開発は `postgres:18` なので、RDS のほうがむしろ本番とローカルの差が縮む。

## 却下した選択肢

- **util サーバを残し、`start/stop_*-util.sh` で止めて節約する**: 現行の運用だが、**`desired_count = 0` にしても NLB と ALB は課金され続ける**(合計 $36/月)。「止めているから無料」は成立しない。加えて SSH 鍵をイメージに焼く問題が残る
- **API タスクに sshd を同居させる**(ユーザーからの当初案): 本番イメージが太り攻撃面が増えるうえ、**api service は autoscaling 1〜10 なので、どのタスクに入るか選べず、scale-in やデプロイで作業中のタスクごと消える**。長い処理を LB 配下のタスクで回すとヘルスチェックにも影響する
- **NAT を残す**(= private サブネット配置): 月 $47。**商用の toB SaaS としてはこちらが業界標準**であり、顧客のセキュリティチェックシートで「アプリケーションサーバは private サブネットか」を問われたときに素直に「はい」と答えられる。PoC フェーズが 6〜12 か月続く見込みであること、その間に移行しても停止がほぼ発生しない(下記「撤退条件」)ことから**今回は見送った**。フェーズが変わったら採る
- **NAT インスタンス(t4g.nano / fck-nat)で private サブネットを維持する**: 月 $4 程度で「private である」という答えを確保できる折衷案。ただしパッチ適用・スループット上限・冗長化を自前で持つことになり、**PoC 期間中に運用対象を 1 つ増やす価値がない**と判断した。NAT Gateway へ移行する際の選択肢としては残る
- **VPC エンドポイントだけで private サブネットを成立させる**: **成立しない**。Slack webhook のような任意の宛先への通信があるため、汎用のアウトバウンド経路が要る
- **VPC エンドポイントで NAT を代替する**: Interface 型は 1 つ約 $10/月 × AZ 数。`ecr.api` / `ecr.dkr` / `logs` / `ssm` / `ssmmessages` の 5 つが必要で、**NAT より高くつく**
- **private サブネット + NAT なし**: ECR pull も SSM も CloudWatch Logs も届かず、タスクが起動しない。成立しない
- **Aurora Serverless v2 を残す**: 上記のとおり下限 $53/月 + I/O 課金。`min_capacity = 0`(自動停止)も、本番で継続的にアクセスがあれば意味を持たない
- **RDS を Multi-AZ にする**: 倍額。可用性要件が出てきたら再評価する(`docs/known-issues.md`)
- **dev 環境を作る**: 動作確認は開発コンテナ(実 PostgreSQL + MinIO)・`pnpm verify`・CI(GitHub Actions で 4 ジョブ)で足りている。dev を持つと構成が 2 倍になり、雛形の util-app のように「同じアプリのデプロイが 2 つある」状態を再生産する
- **`tf-user-iam` / `tf-user-main` の 2 分割を維持する**(雛形の構成): 上記のとおり**どちらも管理者になれる**ため、分離は名目だけ。維持しても得るものがなく、静的アクセスキーを 2 本増やす
- **管理者 IAM ユーザー + MFA で運用する**(Identity Center を使わない): 静的アクセスキーが残り続ける。IAM Identity Center は**単体アカウントでも使え、追加費用がない**ので、初期に済ませておく
- **terraform 実行用のロール + permissions boundary で絞る**: 将来 CI からデプロイするときの正しい形だが、運用者が実質 1 名の PoC 期に作り込む必要はない。**CI に移す時点で導入する**

**6. terraform 実行用の IAM ユーザーを作らない理由**は、雛形の `terraform-tf-user-iam` / `terraform-tf-user-main` の 2 分割が**実効的な権限分離になっていなかった**ことにある。ポリシーを読むと、両方が別々の経路で管理者になれる。

| ユーザ | 昇格経路 |
|---|---|
| `tf-user-iam` | ユーザ / ロール / ポリシーの作成は `terraform-*` に ARN スコープされているが、**`iam:CreateAccessKey` と `iam:UpdateLoginProfile` が `"Resource": "*"`**。**任意の IAM ユーザー(管理者を含む)のアクセスキーを発行でき、コンソールパスワードを設定できる** |
| `tf-user-main` | **`iam:CreateRole` + `iam:AttachRolePolicy` + `iam:PassRole` が `"Resource": "*"`**。`AdministratorAccess` を付けたロールを作って ECS / Lambda に渡せば管理者になれる。加えて `ec2:*` / `s3:*` / `rds:*` / `ecs:*` が全開 |

**分けても防いでいるものが無い。** スコープを絞った意図はあるが(`terraform-*` の ARN 制約)、キー管理系と `PassRole` の穴でそれが無効化されている。

そのうえで、より本質的な問題は分割の粒度ではなく**長期有効な静的アクセスキーを持つ IAM ユーザーを terraform で作っていること**である。このリポジトリには実際に、静的な認証情報(SES SMTP)がコミット履歴に混入しローテーションが必要になった事例がある(`docs/plans/20260806-derive-first-project.md` の「秘密情報の混入」)。**存在しない鍵は漏れない。**

なお、同じ「IAM」でも次の 2 つは別物であり、**後者は残す**。

| 種類 | 例 | 扱い |
|---|---|---|
| 人間 / CI が terraform を実行するための ID | `tf-user-iam` / `tf-user-main` | **terraform で作らない。削除** |
| AWS リソースが引き受けるロール | `ecs-task` / `ecs-task-execution` / `eventbridge-ecs` / `rds-monitoring` / `lambda-ecs-monitoring` | **`prod/iam` に残す** |

### 静的アクセスキーが必要な箇所は「ゼロ」

| 実行主体 | 認証 |
|---|---|
| 人間(terraform apply / `deploy/*.sh` / `aws ecs execute-command`) | **IAM Identity Center の SSO プロファイル**。`aws ecr get-login-password --profile <sso>` も `aws ecs run-task` も通る |
| GitHub Actions(将来デプロイを移すとき) | **OIDC + assume role**。リポジトリに secrets を置かない |
| ECS タスク(アプリ本体・バッチ) | **タスクロール**(元から静的キー不要) |

ローカル開発の `AWS_ACCESS_KEY_ID=minioadmin` は MinIO 用のダミーであり、AWS の資格情報ではない。

## 撤退条件(private サブネットへ移す条件)

**この決定は PoC フェーズ限定である。**次のいずれかに該当したら、NAT Gateway を導入して ECS タスクを private サブネットへ移す。

- 顧客のセキュリティチェックシートや監査で **private サブネット配置を問われた**とき
- **SOC 2 / ISMS の取得に着手する**とき
- **送信元 IP の固定**を要求する外部連携が発生したとき(NAT Gateway + EIP で解決する)
- PoC フェーズを抜けて**本番運用として顧客が増えた**とき

### 移行手順と所要(見積もり)

RDS は最初から private サブネットにあり**移動しない**ため、変更対象は「ECS サービスがどのサブネットにタスクを置くか」だけになる。

| 手順 | 所要 | 停止 |
|---|---|---|
| 1. NAT Gateway + EIP を作成 | 2〜5 分 | なし(既存経路に影響しない) |
| 2. private ルートテーブルに `0.0.0.0/0 → NAT` を追加 | 即時 | なし |
| 3. ECS サービスの `network_configuration` を private + `assign_public_ip = false` に変更 | 2〜3 分 | **なし**(サービスの再作成ではなく in-place のローリング更新) |
| 4. 疎通確認(ECR pull / SES / Slack / S3 / ECS Exec) | 30〜60 分 | なし |

ルート設定を誤ると新タスクが ECR から pull できずに起動失敗するが、`deployment_circuit_breaker`(rollback 有効)が旧タスクのまま自動で戻すため、**失敗しても停止にはならない**。切り戻しも同じ操作を逆向きに行うだけで 2〜3 分。

### 移行を安くするために、初期構築時点で満たしておく条件

**この 4 点を外すと、上記の見積もりが成立しない。** いずれも今のコストはゼロなので、必ず満たすこと。

1. **private サブネットを 2 AZ 分作っておく**(RDS 用にどのみち必要)。後から VPC の CIDR に空きがないと詰む
2. **private 用のルートテーブルを public と分けておく**。分けてあれば移行時は NAT へのルートを 1 行足すだけになる
3. **セキュリティグループのルールを CIDR 直書きにせず、SG 参照(SG-to-SG)で書く**。`is_app` からの 5432、ALB SG からの 8080、という書き方なら**タスクの IP がどう変わっても書き換え不要**
4. **`deployment_minimum_healthy_percent = 100` にしておく**(雛形の既定は 50)。`desired_count = 1` のとき 50 では「旧タスクを止めてから新タスクを起動」になり得るため、100 にして切替時も無停止にする

## エージェント向けの注意

- **踏み台サーバ・sshd・SSH 鍵を再導入しないこと。** ログインは `aws ecs execute-command`。「作業用のサーバが要る」という結論に至ったら、まず ECS Exec と `run-task` で代替できないかを検討する
- **タスクが public サブネットにいるのは意図的。** 「private サブネット + NAT にすべき」という一般論で"修正"しないこと。ただし**これは PoC フェーズ限定の決定**であり、上記「撤退条件」に当てはまる状況を見つけたら**指摘すること**(黙って構成を変えるのではなく、条件に該当した旨を伝える)
- **「移行を安くするための 4 条件」を壊さないこと**(private サブネット 2 AZ・ルートテーブル分離・SG 参照での記述・`deployment_minimum_healthy_percent = 100`)。特に**セキュリティグループのルールを CIDR 直書きにしない**。壊すと将来の移行が「無停止 + 1 時間」から大仕事に変わる
- **セキュリティグループがこの構成の唯一の防御線である。** アプリタスクのインバウンドは **ALB の SG からの 8080 のみ**。デバッグのために `0.0.0.0/0` を足すような変更をしない。RDS のインバウンドはアプリ SG からの 5432 のみ
- **アウトバウンドの送信元 IP はタスクごとに変わる。** 送信元 IP の固定を要求する外部サービス連携が出てきたら、NAT Gateway か NAT インスタンス(または固定 IP を持つプロキシ)の導入を検討し、**この ADR に改定履歴を追記する**。`MASTER_IP_WHITELIST` はインバウンドの話なので影響しない
- **S3 の Gateway エンドポイントは無料**なので、public サブネット構成でも入れてよい(トラフィックをインターネット経路から外せる)。Interface エンドポイントとは課金体系が違う点に注意
- **Aurora に戻さないこと。** Prisma のスキーマにも実装にも Aurora 固有機能への依存はない。DB のスペックが足りなくなった場合は、まず `instance_class` を上げる(`db.t4g.small` → `db.t4g.medium`)
- **RDS のエンドポイントは Route53 のプライベートホストゾーン(`db-pg.<local_domain_name>`)経由で参照する。** アプリの `DB_HOST` を変えずにインスタンスを差し替えられるようにするため、タスク定義に RDS のエンドポイントを直接書かない
- **静的アクセスキーを持つ IAM ユーザーを terraform で作らないこと。** `terraform-tf-user-iam` / `terraform-tf-user-main` を「デプロイに必要だから」と復活させない。人間は SSO、CI は OIDC で足りる。**ECS タスクロールなど「リソースが引き受けるロール」は別物なので、こちらは残す**
- **`iam:CreateAccessKey` / `iam:UpdateLoginProfile` / `iam:PassRole` / `iam:AttachRolePolicy` を `"Resource": "*"` で許可しないこと。** いずれも単独でアカウント乗っ取りに繋がる。雛形のポリシーはこれで権限分離が無効化されていた
- **GitHub Actions の OIDC を設定するときは、信頼ポリシーの `sub` を必ず固定すること。** OIDC で短命なのはトークン(数分)と STS の資格情報(既定 1 時間)であって、**信頼ポリシー自体は削除するまで無期限に残る**。`aud` だけを検査して `sub` を絞らないと、**GitHub 上の任意のリポジトリからロールを引き受けられる**。最低でも `repo:<org>/<repo>:ref:refs/heads/main`、望ましくは GitHub Environment を使って `repo:<org>/<repo>:environment:production`(承認を挟める)。この場合「main に push できる人 = ロールを引き受けられる人」になるため、**branch protection または Environment の承認とセットで導入する**
- **この構成は「小規模な本番 1 環境」に最適化されている。** 案件が育って dev 環境・Multi-AZ・固定 IP・複数リージョンが必要になったら、それは前提が変わったということなので、この ADR を改定してから構成を変える
