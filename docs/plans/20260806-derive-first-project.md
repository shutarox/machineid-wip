# 派生プロジェクト 1 号機を手で起こす

作成: 2026-08-06
状態: **進行中**(1 号機 = `machineid`。手順 1・2 は完了、現在は手順 3)

## 現在地(2026-08-06)

| 手順 | 状態 |
|---|---|
| 1. 作業用リポジトリを作る | **完了**。`shutarox/machineid-wip`。ルートコミットは `雛形からの初期状態`(orphan)で、雛形の履歴は持ち込んでいない |
| 2. 環境を分離してコンテナ再作成 | **完了**。compose の `name: machineid` / `image: machineid-dev-local:latest` / 公開ポート 8802・8082・9002・9003。`myapp -> machineid` のリネームも適用済み |
| 3. 削ぎ落とし | **着手中**(下記の内訳を参照) |
| 4. 痕跡の検査 | 未着手 |
| 5. 検証 | 未着手 |
| 6. 本番リポジトリへ(= まっさら化) | 未着手 |

**「まっさら化」= 手順 6**(`shutarox/machineid` を新規作成し、初期コミット 1 つだけを push する)。
`machineid-wip` の git 履歴と GitHub Project はここで捨てる。

### まっさら化の前にやりきること

**手順 6 の前に完了させる**(まっさら化後にやると、初期コミットに「雛形のままの状態」が焼き付くため)。

| # | 作業 | 状態 |
|---|---|---|
| A | **terraform による AWS 基本設定** | 計画済み → `docs/plans/20260806-aws-prod-setup.md` |
| B | **アプリの要件そぎ落とし**(案件に不要な参照実装の削除) | 未着手 |
| C | **ドキュメントの案件化** | 未着手。下記 |
| D | 痕跡・秘密情報の検査(手順 4) | 未着手 |

**C が見落としやすい。** 現状の `CLAUDE.md` / `docs/` は**雛形(`myapp`)としての文書**であり、
「この雛形は〜」「案件で使うときは〜」という視点で書かれている。派生先では
**「このプロジェクトは〜」という案件の文書**に書き換わっていなければならない。
対象と扱いは手順 3 の表のとおり。

前計画 `20260805-derive-project-skill.md`(スキルを先に作る)は**中止**。理由は下記「なぜ手作業に変えたか」。
あちらの調査結果は方針に依存しないので、必要な部分はこの計画に取り込んである。

## 目的

雛形(`myapp`)から案件用リポジトリを 1 つ、**クリーンスタート**(履歴を持たない初期コミット 1 つ)で起こす。
スキル化は**しない**。まず 1 件を手で通しきる。

## 前提(2026-08-06 ユーザー確認済み)

- **`myapp` は雛形として残り続ける。** この作業で見つかった不備・改善は `myapp` に還元する
- 派生プロジェクトは `myapp` の下流であって、置き換えではない

## なぜ手作業に変えたか

前計画は着手前に 7 段の手順をスキルとして固定するものだったが、**一度も通していない手順は抜ける**。

実証: 前計画は調査の結論として「HEAD に残る固有名詞は 32 行、すべて `docs/` 配下」としていた。
しかし S3 アップロード実装(PR #41〜#44)の途中で、`terraform.example/` の ECS scheduled task に
`hcho.jp` / `jikeikai.aomori.jp` と、雛形に存在しないスクリプト名が残っているのが見つかった。
**検索語を案件名に限っていたための取りこぼし**で、机上の手順化ではこれを見つけられない。

1 件を実際に通せば、この種の抜けは必ず表に出る。手順化するとしてもその後でよい。

## 調査で確定していること(2026-08-06 実測)

### `docs/decisions/`(ADR 9 本)は消さない

| 対象 | 案件名の直接ヒット | ドメイン形式のヒット |
|---|---|---|
| `docs/decisions/` 全 9 本 | **0** | **0** |

**ADR には固有名詞が 1 件もない。** 汚染されているのは `docs/plans/` と `docs/template-repo-workplan.md`。

ADR は派生先でこそ効く**逆行防止装置**(「なぜ service 層を作らないか」「なぜ絶対失効を入れないか」
「なぜ DB をモックしないか」)で、CLAUDE.md が「設計を変える提案をする前に該当の ADR を読むこと」と
指示している対象でもある。**「有用な調査結果を別ドキュメントに再構築」すると、再構築の過程で
『却下した選択肢』が落ちる。** あれが ADR の本体なので、ファイルごと残す。

### 消す側への参照は 14 箇所(ADR の `- 関連:` 行)

```
7 → docs/template-repo-workplan.md   (消す)
5 → docs/plans/*                      (消す)
1 → docs/known-issues.md              (残す)
1 → docs/decisions/*                  (残す)
```

ADR を残すなら、この 14 箇所のうち**消す側を指す 12 箇所の張り替えが必須**。手作業では取りこぼすので
機械的に検出する(下記「手順 4」)。

### `docs/plans/` は 1 本だけ例外

**`20260805-s3-image-upload.md` はコードから参照されている**(`prisma/schema.prisma` のカラムコメント、
`src/libs/storage.ts`)。S3 パスに tenantId を入れない理由・`storageKey` をカラムに持つ理由・
presign のホスト名を分ける理由は、**派生先が引き継ぐコードの判断根拠**なので消すとコメントが宙に浮く。

→ **この 1 本は ADR に格上げして移す**。他の plans は雛形の作り方の記録なので削除してよい。

### 同時起動で衝突するもの

`myapp` を残す以上、両方のスタックが同時に立つ。

| 種類 | 衝突する | 備考 |
|---|---|---|
| `image:` | `myapp-dev-local:latest` | **同じタグでビルドするとイメージを上書きし合う。** 一番厄介 |
| 公開ポート | 8081 / 8801 / 9000 / 9001 | 同時起動時のみ |
| コンテナ名 | **しない**(2026-08-06 対応済み) | `container_name` の明示を撤去し、compose 既定に任せた。**実測で `myapp-dev-local-1` / `myapp-postgres-1` / `myapp-minio-1`**(`<name>-<サービス名>-<連番>`) |
| named volume | **しない** | compose がプロジェクト名で prefix する |

compose の先頭に **`name: myapp` が明示されている**ので、プロジェクト名はディレクトリ名に依存しない。
`container_name` を撤去したことで、**派生先で変えるのは `name:` / `image:` / ports の 3 種類だけ**になった。
サービス間 DNS は `hostname`(`pghost` / `miniohost` / `devhost`)とサービス名で解決していて
`container_name` を使っていないため、撤去による実害はない(全文検索で参照ゼロ + 再作成後に
`pghost` / `miniohost` の名前解決を実機確認)。

#### ホストで使用中のポート(2026-08-06 実測)

**並走はすでに現実**で、旧案件 `opepro` のスタックと `myapp` が同じ Mac 上で同時に動いている。
派生プロジェクトはこれらを避けて選ぶ。

| ポート | 使用者 |
|---|---|
| 8080 / 8800 | `opepro-dev-local`(旧案件。container_name 明示の旧構成) |
| 8081 / 8801 | `myapp-dev-local-1` |
| 5432 | `opepro-postgres` |
| 9000 / 9001 | `myapp-minio-1` |

`myapp-postgres-1` は 5432 を**公開していない**(コンテナ内 `pghost:5432` でのみ使う)ので衝突しない。
派生プロジェクトも同じく DB は非公開のままでよい。

**注意**: E2E のバックエンドが使う 8082 は**コンテナ内部のポート**で、ホストには公開していない。
ホスト側の 8082 は空いている(混同しやすいので明記)。

### `cp -rp` ではなく `git clone`

pnpm の symlink は相対パスなので `cp -a` でも移動自体は成立する。ただし `node_modules` を運ぶ意味が
なく、**捨てる予定の `.git` も一緒に運ぶ**ことになる。`git clone` + `pnpm install` のほうが速く事故がない。

## 手順

### 1. 作業用リポジトリを作る

**GitHub の rename 往復はしない。** 最初から作業用と本番用を別名にすれば、
「新規作成 → rename して退避 → 同名で作り直し」が丸ごと不要になる。

```
作業用: <project>-wip   PR も CI も普通に使う
本番用: <project>       最後に新規作成し、初期コミット 1 つを push
```

新規リポジトリなので「git 履歴を削除する」工程自体が存在しない。

**作業用リポジトリも orphan コミットから始める**(雛形の履歴を持ち込まない)。

```bash
git clone git@github.com:shutarox/myapp.git <project>
cd <project>
git remote rename origin template          # 雛形は remote として残す(還元時の diff に使う)
git checkout --orphan main-clean
git commit -m '雛形からの初期状態'
git branch -M main-clean main
git remote add origin git@github.com:shutarox/<project>-wip.git
git push -u origin main
```

雛形の履歴には**旧案件の秘密情報が残っている**(下記「秘密情報の混入」)ため、
履歴ごと push すると新しいリポジトリに再公開することになる。`template` remote は
手元に残るので、過去を追いたいときは `git log template/main -- <path>` で引ける。

### 2. 環境を分離してコンテナ再作成

compose の `name:` / `image:` / 公開ポートを変更する(上表)。コンテナ名は `name:` に追従するので個別の変更は不要。

**この時点でエージェントのセッションが切れる**(dev コンテナの再作成)。削ぎ落としより先に
済ませておくのが正しい順序。手順は `CLAUDE.md`「作業のルール」の docker 反映手順に従う。

### 3. 削ぎ落とし

| 対象 | 扱い |
|---|---|
| `docs/decisions/` | **全 9 本を残す**(`- 関連:` の張り替えのみ) |
| `docs/plans/20260805-s3-image-upload.md` | **ADR に格上げして移す** |
| `docs/plans/` の残り 8 本 | 削除 |
| `docs/template-repo-workplan.md` | 削除 |
| `docs/known-issues.md` | 案件に効く項目だけ残して書き直す |
| `docs/dev-container.md` | 残す(構成が同じため) |
| `terraform.example/` | **案件用の実 terraform を新規作成**(`docs/plans/20260806-aws-prod-setup.md`)。example は削除 |
| `deploy/*.sh` | AWS プロファイル名・ECR 名・clone 先を案件のものに |
| 報告書 CRUD(`reports` / `uploadedImages`) | **案件に不要なら削除**。判断は案件次第 |
| `CLAUDE.md` の「プロジェクト概要」 | **雛形の説明から案件の説明に書き換える**。「雛形リポジトリ」「案件で使うときは」という視点が残っていないか通しで確認する |
| `README.md` | 同上。雛形の使い方ではなく案件のセットアップ手順にする |
| `docs/decisions/2026080*-aws-*.md` | **残す**(案件の構成判断そのもの) |
| `docs/plans/20260806-aws-prod-setup.md` | 実施記録を書き切ってから、残すか ADR へ吸収するか判断する |
| この計画ファイル自身 | **削除**(まっさら化の作業記録なので、案件リポジトリには持ち込まない)。ただし「myapp に還元する項目」は**削除前に `myapp` 側へ移すこと** |

### 4. 痕跡の検査(案件名を列挙しない)

**秘密情報の検査を最優先にする。** 2026-08-06 に雛形の HEAD から実物が 3 件見つかった
(下記「秘密情報の混入」)。`docs/` の固有名詞より優先度が高い。

前計画の失敗を繰り返さないため、**検索語に依存しない検出**を主にする。

- ドメイン形式(`[a-z0-9-]+\.(jp|com|co\.jp)`)の総なめ → 既知の許可リスト以外を目視
- **存在しない参照先の検出** — コード・docs が指すファイルパスを抽出して実在確認(`hcho.jp` はこれで見つかった)
- docs 間のリンク切れ(手順 3 の張り替え漏れ)
- 案件名の grep は**補助**として最後に回す

### 5. 検証

`pnpm verify` 緑 + CI 緑 + `pnpm knip` ベースライン。加えて:

- **CI を作り直して一通り動かす**(secrets・OIDC・ECR 名が案件のものに変わるため)
- 手順 4 の検査がすべて空であること

### 6. 本番リポジトリへ

`<project>` を新規作成し、初期コミット 1 つを push。

## 秘密情報の混入(2026-08-06 発覚・雛形側で対応済み)

派生プロジェクトへ push しようとしたところ、**GitHub の push protection に拒否された**。
調べた結果、雛形の HEAD に旧案件の実在する秘密情報が 3 件埋まっていた。

| 秘密情報 | 場所 | GitHub が検出したか |
|---|---|---|
| Slack Incoming Webhook URL(dev) | `terraform.example/environments/dev/main/01_variables.tf` の `default` | **した** |
| Slack Incoming Webhook URL(prod) | `terraform.example/environments/prod/main/01_variables.tf` の `default` | **した** |
| **AWS SES SMTP 認証情報**(IAM アクセスキー + シークレット) | `backend/script/test/mailtest.ts` に直書き | **しなかった** |

いずれも `8fbf68d Initial snapshot from opepro platform` から**履歴に残っている**。

### ここから引く教訓

- **push protection は安全網にならない。** 一番重い AWS の認証情報を素通りさせた。
  検出されたのは Slack だけ。**自分で検査する工程を持つこと**(手順 4)
- **秘密情報に `default` を書かない。** terraform の `sensitive = true` は出力のマスクであって、
  `default` に書いた値がリポジトリに平文で残るのを防がない
- **履歴に入った秘密は消せない。** HEAD から消しても履歴には残る。**鍵のローテーションが唯一の対処**

### 対応

- 雛形の HEAD からは 3 件とも除去した(terraform は `default` ごと削除、`mailtest.ts` は SSM 経由に書き換え)
- **鍵のローテーションは別途必要**(リポジトリ側の作業では解決しない)
- **派生リポジトリは履歴ごと持ち込まない。** 手順 1 で orphan コミットから始めれば、
  この履歴自体を引き継がずに済む

## `myapp` への還元(この計画で落としてはいけない部分)

**派生側の git 履歴は捨てるので、cherry-pick では戻せない。** 作業中に見つけた「雛形側の不備」は
その場で拾えるよう、**還元リストを作りながら進める**。

- 置き場所: この計画ファイルに「## myapp に還元する項目」を追記していく
- 対象の例: 雛形に残っていた旧案件の痕跡、汎用化が甘い箇所、削ぎ落としで初めて気づいた結合
- 派生作業が終わったら、リストを `myapp` 側の PR にまとめる

前例: PR #44 で `terraform.example` の `update_doctors` / `hcho.jp` を直したのは、まさにこの型の還元。

## myapp に還元する項目

**まっさら化(手順 6)の前に `myapp` 側の PR にまとめること。** この計画ファイルごと消えるので、
残したまま進めると失われる。

### 雛形の不備(修正して還元する)

| # | 内容 | 発見 |
|---|---|---|
| 1 | **`Dockerfile.prod-main` / `dev-main` で本番マイグレーションが実行できない。** 最終ステージに `prisma/schema.prisma` しかコピーしておらず、`prisma/migrations/`・`prisma/schema.prisma.generated`・`prisma.config.ts` が無い。`datasource db` に `url` が書かれておらず接続先が `prisma.config.ts` 由来なので、3 つとも必要 | 2026-08-06 AWS 構成の検討中 |
| 2 | **`terraform.example` の EventBridge ターゲットがリビジョン固定の ARN を参照している**(`aws_ecs_task_definition.main.arn`)。デプロイしても定期実行だけ古いイメージで走り続ける。`arn_without_revision` にすべき | 同上 |
| 3 | **`deploy/deploy_prod-main.sh` に旧案件の実値が残っている。** `aws_account_id="756074065984"` と `cloudfront_distribution_id="E3TDM7MGWEED1K"`。手順 4 の痕跡検査は `docs/` と `terraform.example/` を見ていたが、**`deploy/` も対象**にすべき | 同上 |
| 4 | **ブランド資産が前プロダクトのまま。** `frontend/public/favicon.ico` / `apple-touch-icon.png` が teal(`#319795`)の旧アイコンだった。雛形としては中立な資産にするか、少なくとも「差し替え必須」の一覧に載せる。あわせて `index.html` の `<link rel="icon" type="image/svg+xml">` が実体(.ico)と食い違っていた | 2026-08-06 |
| 5 | **ホスト clone の `receive.denyCurrentBranch updateInstead` が未設定だと最初の `git push -f host` が拒否される。** `docs/dev-container.md` に「事前設定(一度だけ)」として書いてはあるが、派生時に新しいホスト clone を作ると未実施になる。手順 2 のチェック項目に入れる | 2026-08-06 |
| 6 | **開発コンテナの MinIO 用環境変数が AWS の資格情報を潰す。** `docker-compose.local.yml` が `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` をコンテナ全体に設定しており、**環境変数はプロファイルより優先される**ため、コンテナ内の `aws` コマンドが常に `minioadmin` を使って `InvalidClientTokenId` で失敗する(実測)。`deploy/*.sh` の `aws ecr get-login-password` も同様。**`machineid` 側で対応済み**(2026-08-06): compose / CI の環境変数を **`S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`** に改名し、`config.ts` の `S3_CREDENTIALS` 経由で `S3Client` に明示的に渡す(本番は `undefined` → タスクロール)。**この差分をそのまま `myapp` に持っていける** | 2026-08-06 |

### 派生手順そのものへの追記(`myapp` の計画側に反映)

| # | 内容 |
|---|---|
| 7 | **手順 2 で公開ポートを変えたら、compose の `environment` にある `SPA_APP_BASE_URL` / `API_SERVER_BASE_URL` / `VITE_API_SERVER_BASE_URL` も同じ値に揃える。** `ports:` だけ変えると、ホストからのアクセスとアプリが認識する URL が食い違う(実際に 8801/8081 のまま残っていた) |
| 8 | **手順 3 の削ぎ落とし対象にブランド資産と `CLAUDE.md` / `README.md` の視点変更を明記する**(上記 4 と、手順 3 の表に追加済みの行) |

## スコープ外

- **スキル化**(`.claude/skills/derive-project/`)。2 件目を起こすときに、この計画の実施記録を元に判断する
- 雛形と派生の継続的な同期(この計画は初期化の 1 回だけを扱う)
