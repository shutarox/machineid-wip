# terraform を example 化し、`opepro` を `myapp` に置換する

作成: 2026-08-04

## 目的

雛形に残る元プロダクト名 `opepro` を **`myapp` に置換**し、`terraform/` を **`terraform.example/`** にリネームして「**そのまま `apply` するものではなく、構成の参考例**」であることをディレクトリ名で示す。

積み残しタスクの「terraform / deploy / etc の opepro 固有値の汎用化」に対する回答。**terraform ごと削除する案**もあったが、デプロイ構成(ECS / CloudFront / ALB / ECR / Route53 の組み方)は雛形の資産として価値があるため、**残したうえで期待値を下げる**方針を採る。

## 方針

### 1. `terraform/` → `terraform.example/`(`git mv`)

- ディレクトリ名で「動かす前に読み替えが要る」と分かる
- `terraform.example/README.md` を新設し、**AWS アカウント側の実体と対応する値の一覧**と、案件で何を差し替えるかを書く
- `.terraform.lock.hcl` 等の git 管理外ファイルも同時に移す

**`deploy/*.sh` の `~/terraform/...` は対象外。** これはデプロイ機のホーム配下を指しており、リポジトリ内のパスではない。

### 2. `opepro` → `myapp`

置換するのは**識別子・値・現状説明**。

| 対象 | 例 |
|---|---|
| terraform | `project_name` の既定値、S3 バケット名、AWS プロファイル、ECR リポジトリ名、Route53 サブドメイン |
| `deploy/*.sh` | AWS プロファイル名 |
| `docker/Dockerfile.{dev,prod}-main` | 冒頭コメントのイメージ名 |
| `backend/package.json` | `logtail` の `AWS_PROFILE` |
| `backend/script/test/mailtest.ts` | 送信元アドレス |
| `etc/postgres/initdb.d/01_create_initial.sql` | コメント(**実際に作る DB は既に `myapp`**) |
| `pgdump/pgdump.sh` | `DB_NAME` |
| `.vscode/cspell.json` | 辞書 |
| `CLAUDE.md` | 「元プロダクト opepro の…」→ 製品名を落とす |

**置換しないもの(履歴として意味がある)**:

- `docs/plans/*` と `docs/template-repo-workplan.md` の**経緯の記述**。「何をどう削ぎ落としたか」の記録なので、名前を書き換えると記録として成立しなくなる。ただし**現状を指す行**(積み残しタスク、`docs/known-issues.md` の参照表)は更新する
- `docs/dev-container.md` の「旧構成のコンテナ(例: `opepro-dev-local`)」。**実在した旧コンテナ**を指す注意書きなので、書き換えると案内として誤りになる

### 3. ついでに直す既存のバグ

`tools/command_proxy.sh` が `docker compose exec -T opepro-dev-local` を叩いているが、**compose のサービス名は `dev-local`**(`container_name` が `myapp-dev-local`)。`docker compose exec` はサービス名を取るため**現状は動かない**。`dev-local` に修正する。

## スコープ外

- ~~**`soramed`**(組織名。S3 バケット `jp.soramed.*`、ドメイン `soramed.jp`、SES)~~ → **実施中にスコープへ追加**(下記「実施後の追記」)
- `pgdump/` の削除(1-5 で「全削除」と決定済みだが未実施)。今回は名前の置換に留める。**その後の決着(2026-08-04): 決定を覆して残すことにした**(`docs/template-repo-workplan.md`)

## 検証

- `pnpm verify` 緑
- `git grep opepro` の残りが**履歴の記述だけ**になっていること
- リネーム後に `terraform.example/` 配下の参照(README・ADR・known-issues)が壊れていないこと

## 実施後の追記(2026-08-04)

### 組織名もプレースホルダ化した(ユーザー判断でスコープ拡大)

当初「実体と結びつくため別途判断」としていた `soramed` を、**実在しないプレースホルダに置き換える**方針に変更した。`terraform.example/` は参考例であり、**実在の組織ドメインが残っているほうが誤解を生む**ため。

| 置換 | 例 |
|---|---|
| `jp.soramed` → `com.myappdomain` | `jp.soramed.myapp.dev-terraform` → `com.myappdomain.myapp.dev-terraform` |
| `soramed.jp` → `myappdomain.com` | `myapp.soramed.jp` → `myapp.myappdomain.com` |
| 単独の `soramed` → `myappdomain` | `soramed-common-tf-user-main` → `myappdomain-common-tf-user-main` |

40 ファイル / 82 箇所。**逆引き表記 → ドメイン → 単独トークンの順**で置換しないと、`jp.soramed.jp` のような形で取りこぼす(実際には該当なしだが順序依存があるため記録しておく)。

置換によって「組織 + プロジェクト」の階層(`com.myappdomain.myapp.*`)はそのまま保たれている。

### 残る注意

プレースホルダなので **`terraform.example/` はそのままでは apply できない**。加えて SES の DKIM トークンや Search Console の検証レコードのような**外部サービスが発行した値**は旧環境のものが残っており、これらは移し替えではなく新環境で取り直すもの。両方 `terraform.example/README.md` に明記した。
