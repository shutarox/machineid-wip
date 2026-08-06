# 派生プロジェクトの初期 commit 対象を生成するスキル(中止)

作成: 2026-08-05
状態: **中止(2026-08-06)。方針を変更するため、この計画には着手しない。**
後継: **`docs/plans/20260806-derive-first-project.md`**(スキル化せず、まず 1 件を手で通す)

> **この計画は実行しないこと。** 下に書かれている「確定した方針」と「スキルの手順(7 段)」は
> **破棄された前提に基づく**ので、そのまま実装に使ってはいけない。
>
> **調査結果(下記「調査で分かったこと」)は方針に依存しないので有効なまま。**
> 派生プロジェクトの起こし方を再検討するときは、まずそこを読むと出発点が省ける:
>
> - 固有名詞の分布(**ただし検索語が不足していた。下記の訂正を必ず読むこと**)
> - **本体は「削除」ではなく「参照の始末」**。ADR 9 本すべての `- 関連:` 行が消す対象を指しており、
>   ADR は派生先でこそ必要なので、そこにリンク切れを作れない
>
> **その後に判明した追加材料**: S3 画像アップロード実装(PR #41〜#44)の過程で、
> `terraform.example/` に**雛形に存在しないスクリプト**(`update_doctors.js` /
> `update_login_info.js`)と**旧案件のドメイン**(`hcho.jp` / `jikeikai.aomori.jp`)が
> 残っているのが見つかった(PR #44 で `cleanup_uploads` に差し替え済み)。
> 上の調査は `docs/` 配下しか固有名詞が無いとしていたが、**`terraform.example/` の
> コマンド引数のような場所も対象**になる。洗い出しの範囲は当初想定より広い。

## 目的

雛形から案件用のリポジトリを起こすとき、**クリーンスタート**(履歴を持たない初期コミット 1 つから始める)にする。その「初期 commit 対象」を生成する手順をスキルとして固定する。

## クリーンスタートにする理由

1. **git 履歴に元プロダクトの識別子が残っている。** HEAD からは除去済みだが、過去のコミットからは今も読める

   ```
   $ git show 462bfc3~1:terraform/environments/prod/main/01_variables.tf
     default = "opepro.soramed.jp"
   ```

   初期コミットのメッセージも `Initial snapshot from opepro platform`

2. 履歴の中身は「**雛形を作った経緯**」であって、案件の履歴ではない

## 調査で分かったこと(実測)

### HEAD に残る固有名詞は 32 行、すべて `docs/` 配下 — **範囲不足だった(2026-08-06 追記)**

> この計測は検索語を `opepro` / `soramed` / `オペプロ` / `ソラメド` に限っていたため、
> **他の案件由来の固有名詞を取りこぼしていた**。実際に `terraform.example/` の
> ECS scheduled task に `hcho.jp` / `jikeikai.aomori.jp` が残っていた(PR #44 で解消)。
> 再計測するときは**案件名の列挙ではなく、ドメイン形式・存在しない参照先の検出**など
> 検索語に依存しない方法を併用すること。

| ファイル | 件数 |
|---|---|
| `docs/plans/20260804-terraform-example.md` | 14 |
| `docs/plans/20260804-ssm-namespace.md` | 7 |
| `docs/template-repo-workplan.md` | 5 |
| `docs/plans/20260803-ui-shadcn-plan.md` | 4 |
| `docs/plans/20260804-claude-md-restructure.md` | 1 |
| `docs/dev-container.md` | 1 |

コード・設定・インフラ定義・**ADR・CLAUDE.md・README.md・スキルはすべてゼロ**。

### このスキルの本体は「削除」ではなく「参照の始末」

**「残す側」から「消す側」への参照が 20 箇所以上ある。**

- **ADR 9 本すべての `- 関連:` 行**が `docs/template-repo-workplan.md` / `docs/plans/*` を指している
- `docs/decisions/20260804-security-headers.md` と `docs/known-issues.md` は `terraform.example/` を参照している

ADR は派生先でこそ必要(「なぜ service 層を作らないか」「なぜ絶対失効を入れないか」)なので、**そこにリンク切れを作ってはいけない**。手作業では必ず取りこぼすため手順化する。

## 確定した方針(2026-08-05、ユーザー判断)— **破棄**

> 以下は 2026-08-06 の方針変更で**破棄された**。参考情報として残すだけで、これに従って実装しないこと。

| 論点 | 決定 |
|---|---|
| 出力形式 | **別ディレクトリに生成**。雛形の作業ツリーには一切触れない |
| インフラ系の削除 | **都度確認**。候補を分類して提示し案件ごとに選ばせる(knip と同じ「道具は用意するが削除は人が決める」方式) |
| 成果物 | `.claude/skills/derive-project/SKILL.md` 1 本。**スクリプトは作らない**(対話で決まるうえ参照の始末は文脈判断を伴うため。ADR `20260804-agent-docs-structure.md` の「特定作業の道順はスキル」に従う) |

## スキルの手順(7 段)— **破棄**

> 上の「確定した方針」を前提に組み立てた手順なので、まとめて破棄。**そのまま実装に使わないこと。**

### 1. 出力先へ追跡ファイルだけを取り出す

`git clone` ではなく **`git archive`**。HEAD の追跡ファイルだけが出るので `.git` / `node_modules` / `.envrc` / `build` を持ち込まない。

```bash
mkdir -p <出力先> && git archive HEAD | tar -x -C <出力先>
git describe --tags --always   # 由来として記録する版
```

### 2. 削除候補を提示して選ばせる

```
[ ] terraform.example/                        172 files
[ ] deploy/                                    12 files
[ ] docker/Dockerfile.{dev,prod}-{main,util} + docker/home-appuser-dev/
[ ] etc/onstart-{dev,prod}-*.sh
[ ] backend/lambda/                             6 files
[ ] pgdump/                                     3 files
```

`deploy/` は terraform 前提なので、**terraform.example を消すなら deploy も消す**のが既定の助言。

### 3. 常に消す / 常に残す

| 常に消す | 理由 |
|---|---|
| `docs/template-repo-workplan.md` | 雛形の作り方の記録 |
| `docs/plans/` の `20260804-knip-baseline.md` **以外**すべて | 同上。固有名詞 26 行はここに集中 |
| `.claude/skills/derive-project/` | 自分自身。派生先はさらに派生しない |

| 常に残す | 理由 |
|---|---|
| `docs/decisions/`(ADR + README) | **固有名詞ゼロを確認済み**。「なぜこの構造か」は派生先でこそ必要 |
| `docs/plans/20260804-knip-baseline.md` | **固有名詞ゼロ、消す側への参照ゼロを確認済み**。`verify` スキルと `known-issues.md` が参照。「意図的に未使用な足場」の一覧として派生先でも有効 |
| `CLAUDE.md` / `README.md` / `.claude/skills/` の残り / `docs/known-issues.md` / `docs/dev-container.md` | 雛形の使い方 |
| `backend/` `frontend/` `e2e/` `tools/` `.github/` `knip.json` `playwright.config.ts` `docker/Dockerfile.local` `docker/docker-compose.local.yml` `etc/onstart-local.sh` `etc/postgres/` | アプリとローカル開発環境 |

### 4. 参照の始末(核)

**検出を先に走らせてから直す。**

```bash
grep -rhoE '`[a-zA-Z0-9_./-]+\.(md|ts|tsx|sh|yml|json)`' --include='*.md' . \
  | tr -d '`' | sort -u | while read -r p; do [ -e "$p" ] || echo "DANGLING: $p"; done
```

| ファイル | 直すもの |
|---|---|
| `docs/decisions/*.md` **9 本すべて** | 冒頭の `- 関連:` 行から消した doc への参照を除く。**行ごと消さない**(`20260804-dev-server.md` のように残る参照と混在する) |
| `CLAUDE.md` | 索引の「過去にエージェントが踏んだ罠」行、「主要ファイルの場所」表の plans / workplan 行 |
| `README.md` | ドキュメント地図の plans / workplan 行。terraform 削除時は「インフラ定義」行も |
| `docs/decisions/README.md` | 「関連ドキュメント」表の workplan / plans の 2 行 |
| `docs/known-issues.md` | terraform 削除時: HSTS 項目と「他の場所で管理している残件」表 |

`.claude/skills/record-docs/SKILL.md` の `docs/plans/` への言及は**規約として残す**(これから書く場所の話なので消さない)。

### 5. 固有名詞・個人情報の置換

| 対象 | 内容 |
|---|---|
| `backend/script/test/mailtest.ts` | 個人のメールアドレスがハードコードされている |
| `deploy/*.sh`(残す場合) | `git clone git@github.com:<user>/myapp.git` の 4 箇所 |
| `terraform.example/`(残す場合) | サブドメインの `1616`、SES / Search Console の発行値。**外部サービス発行値は移し替えでなく新環境で取り直す**旨は `terraform.example/README.md` に既記 |

アプリ名・SSM 名前空間・テーマ色などは **`README.md` の「カスタマイズポイント」表に既にある**ので、スキルはそこへ誘導するだけにする(二重管理を作らない)。

### 6. 由来を記録する

派生先に `docs/derived-from.md` を置く。雛形の URL・**タグ**・コミット SHA・生成日・削除した群。将来「雛形の改良を取り込むか」の判断材料になる。

### 7. 検証(スキル内に手順として持たせる)

1. **リンク切れ 0**(段 4 の検出コマンドを再実行)
2. **固有名詞 0** — `grep -riE "opepro|soramed|オペプロ|ソラメド"` と個人情報が空
3. **ビルドが通る** — 出力先で `pnpm install --frozen-lockfile && pnpm check && pnpm lint`
4. (任意)`pnpm bootstrap && pnpm verify` — DB を作るので通常は省略

## 実装するときの検証 — **破棄**

スキルを書いたら**実際に 1 回流して**生成物に対して上の 1〜3 を通す。生成先は `/tmp` 配下にして確認後に破棄し、**雛形側の作業ツリーが無傷**であること(`git status` がクリーン)も確認する。

## スコープ外 — **破棄**

- 派生先での `pnpm bootstrap` / DB 作成
- 雛形の履歴書き換え(`filter-repo` 等)。**クリーンスタートを選んだので不要**
- 「履歴ごと複製 + `template` remote」方式。共通の祖先を持つため `git merge template/main` で雛形の改良を取り込めるという利点があるが、**履歴に元プロダクトの識別子が入る**ため今回は採らない
