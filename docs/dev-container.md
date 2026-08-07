# 開発コンテナ構成と運用手順(コンテナ内 clone 方式)

設計確定: 2026-07-09(壁打ちセッション)
実装状況: **移行完了(2026-07-10)**。末尾の移行手順 1〜7 をすべて実施済み(GitHub origin は gh CLI の HTTPS 認証で設定、SSH 鍵は未作成のまま)。

## 背景・なぜこの構成か

- Mac の bind mount(VirtioFS)が遅く、node_modules だけ named volume に逃がしていたが、
  pnpm store(コンテナレイヤー側)と node_modules(volume 側)がファイルシステム分断され、
  ハードリンクが効かない・symlink の実体が別 volume になる、という歪みがあった。
- リポジトリ本体を Linux ネイティブ fs(named volume)上に置けば、速度・pnpm の健全性・
  複数 clone / git worktree によるエージェント並列作業をすべて満たせる。
- ホストの docker/ をコンテナ内 clone に重ねて mount する案は不採用。
  同じディレクトリを 2 つの .git(ホスト clone とコンテナ内 clone)が追跡する状態になり、
  コンテナ内のブランチ切替がホスト clone の作業ツリーを黙って書き換える footgun があるため。
  受け渡しは git push(下記 docker-ops フロー)で行う。
- イメージ内シード(`/opt/app-seed` への COPY)は一度実装したが、`/host/app` を常時 mount する
  運用に決めたため撤去した。bootstrap は `/host/app` からの clone のみ。

## 構成の全体像

| 要素 | 場所 | 役割 |
|---|---|---|
| ホスト clone | Mac 上(フル clone) | compose 操作・イメージビルド・受け渡し専用。原則手では編集しない(試行錯誤の一時上書きのみ可、手順 1 参照) |
| ホスト clone の mount | コンテナ内 `/host/app`(rw) | コンテナ内 clone から見た git remote `host` の実体 |
| 作業コピー | `~/app`(= `/home/appuser/app`) | **唯一の編集対象**。`home_appuser` volume 上 |
| named volume | `home_appuser` の 1 個のみ | `~/app` `~/.claude`・pnpm store 等をすべて収容 |
| pnpm store | `~/.local/share/pnpm`(pnpm デフォルト) | node_modules と同一 fs にしてハードリンクを有効化 |

- 旧 volume(`backend_build` `backend_node_modules` `frontend_node_modules`)は廃止。
- pnpm store は**設定なし**(pnpm デフォルトの `~/.local/share/pnpm`)。`~/app` と同一 volume なのでハードリンクが効く。旧設定(`~/.npmrc` の `store-dir=/data/pnpm-store`)は onstart が自動で除去する。
- 追加 clone や `git worktree` は `~/` 配下に自由に作ってよい(同一 fs なので追加コストなし)。
- イメージ内に `/app → /home/appuser/app` の symlink がある。コード中の `/app` ハードコードの移行用で、workplan 1-12(位置非依存化)で撤去予定。
- ビルドコンテキストはリポジトリルート(ホスト clone 全体)。**`.dockerignore` は denylist 方式**で、`node_modules` / `.git` / `build` / `**/.terraform` / `pgdump` などを外している(2026-08-07 新設)。イメージへの COPY は `docker/home-appuser-local/` だけなので、そこに置くものを増やすときは中身に注意する。
  > 以前ここには「`.dockerignore` がホワイトリスト方式で防御している」と書かれていたが、**その時点でファイル自体が存在しなかった**(2026-08-07 に本番イメージのビルドを通す過程で判明)。HOME をビルドコンテキストにしていた頃の名残の記述。

### 初回起動時の bootstrap(onstart-local.sh)

entrypoint は **`/host/app/etc/onstart-local.sh`**(ホスト clone 側)を実行する。onstart 自体の変更はイメージ rebuild 不要で、docker-ops へ push → コンテナ再作成(`up -d --force-recreate`)だけで反映される。

`~/app/.git` が存在しない場合のみ、`git clone /host/app ~/app` で作成する。clone 直後に remote 名を `origin` → `host` にリネームし(`origin` は GitHub 用に空けておく)、ホスト clone が docker-ops を checkout していても `main` に switch する。

あわせて毎回、`host` remote(→ `/host/app`)の存在を保証し、`~/app/docker/home-appuser-local/` 配下の全ファイルを `~/` へパーミッションごとコピーして provisioning する(HOME は volume のためイメージの COPY は初回しか効かない)。

## 手順 1: 開発コンテナ設定の変更(Dockerfile.local / compose)★本題

**コンテナ自身の rebuild / 再作成だけ**は、コンテナ内から実行すると自分を殺してしまうため、
変更をホスト clone に渡してからホスト側で実行する。GitHub は経由しない。

**docker そのものはコンテナ内からも使える**(`sudo docker ...`。docker.sock は root 所有なので
`sudo` が要るが、パスワードなし sudo が使える)。本番イメージのビルドや ECR への push は
コンテナ内で完結するので、ホストへ渡す必要があるのは**この dev コンテナの構成変更だけ**。

### 事前設定(一度だけ)

ホスト clone 側:

```bash
git switch -c docker-ops            # 受け渡し専用ブランチを checkout したままにする
git config receive.denyCurrentBranch updateInstead
```

- `updateInstead` により、checkout 中のブランチへ push を受けると作業ツリーまで自動更新される。
- `docker-ops` は **マージしない・force push され放題の使い捨て受け渡しチャンネル**。
  履歴の綺麗さは一切気にしない。

コンテナ内 clone 側(bootstrap が未設定の場合):

```bash
git remote add host /host/app
```

### 変更のたびの手順

```bash
# --- コンテナ内(~/app) ---
vim docker/Dockerfile.local          # 編集
git add -A && git commit -m 'wip: dockerfile'
git push -f host HEAD:docker-ops     # ホスト clone に直接書き込む(mount 経由のファイル I/O)

# 試行錯誤 2 回目以降は amend でまとめる
git commit --amend --no-edit && git push -f host HEAD:docker-ops
```

```bash
# --- ホスト側(ホスト clone のルート) ---
docker compose -f docker/docker-compose.local.yml build dev-local
docker compose -f docker/docker-compose.local.yml up -d
```

納得のいく形になったら、コンテナ内で作業ブランチとして仕上げて(squash 等)origin へ push する。

### 試行錯誤のショートカット(コミット不要の直接上書き)

`/host/app` は mount 越しに読み書きできるので、1〜2 ファイルの試行錯誤なら push を挟まず
直接上書きしてもよい:

```bash
# --- コンテナ内 ---
vim ~/app/docker/Dockerfile.local                          # 編集は必ず ~/app 側で行う(正は常に ~/app)
cp ~/app/docker/Dockerfile.local /host/app/docker/         # ホスト clone の作業ツリーへ一時上書き
# → ホスト側で docker compose build

# 確定したら: ~/app でコミットし、ホスト側の一時上書きを捨ててから正規の push で揃える
git -C ~/app add docker/Dockerfile.local && git -C ~/app commit -m '...'
git -C /host/app checkout -- .                              # dirty のままだと次の push が拒否される
git -C ~/app push -f host HEAD:docker-ops
```

注意: `/host/app` を直接 vim で編集するのは避ける(~/app と /host/app のどちらが正か
分からなくなり、コミットし忘れると次の push 時の checkout で消える)。上書きは常に
「~/app で編集 → cp」の一方向にする。

### 注意点

- push が送るのは**コミットだけ**。未コミットの変更は届かないので、試すたびに最低 1 コミット必要
  (amend ループでよい)。コミットを挟みたくない試行錯誤は上記ショートカットを使う。
  stash は push の内容に影響しない(別問題の道具)。
- push した HEAD の**ツリー全体**がホスト clone に反映され、ビルドコンテキストになる。
- `updateInstead` はホスト側の作業ツリーが dirty だと push を拒否する。
  ショートカットの一時上書きが残っていると push が通らないので、
  `git -C /host/app checkout -- .` で綺麗にしてから再 push する。

## 複数クローンでの並列作業(pnpm bootstrap)

`~/` 配下に追加 clone や `git worktree` を作って並列作業する場合、各コピーのルートで
`pnpm install && pnpm bootstrap` を実行する。ディレクトリ名から DB 名・ポート・PM2 名を
導出して `.envrc`(direnv、git 管理外)を生成し、DB 作成 + マイグレーション + シードまで行う。

- 主クローン `~/app` → DB `myapp`、ポート 8080/8800(現行値のまま)
- `~/app2` → DB `myapp_app2`、ポート 8084/8804、PM2 名 `backend-app2` 等
- compose は DB_URL を注入しない(2026-07-10 変更)。**この変更の反映にはコンテナ再作成が必要**。
  再作成後は各クローンの `.envrc` が唯一の DB_URL 供給源になる
- 追加クローンのフロントエンドにホストのブラウザからアクセスするにはポート公開の追加が必要(compose の ports)

## 手順 2: volume リセット後の復旧

`docker compose down -v` や Docker Desktop リセットで `home_appuser` volume が消えた場合:

1. コンテナを起動すれば bootstrap が `/host/app` から `~/app` を再作成する(復旧点はホスト clone の HEAD)。
2. `~/.claude` のセッション・認証情報、`~/.ssh` の鍵は**復元されない**。origin への push を習慣にし、
   volume は消えるものとして扱うこと。

## 手順 3: 通常の同期(origin 経由)

- 日常の成果物の同期は GitHub origin が主役(`git push origin`)。
- ホスト clone を最新化したいときは、ホスト側で `git fetch origin` するか、
  コンテナ内から `git push -f host HEAD:docker-ops` で任意の状態を送る。
- `host` remote は「ホスト clone の /host/app/.git に mount 越しに直接書き込むローカルパスの remote」であり、
  ネットワークを使わない。

## トラブルシューティング: ホスト公開ポート(8801/8081)にアクセスできない

症状: Mac から `localhost:8801` 等に TCP 接続はできるが応答が返らない(空応答)。実例: 2026-07-10、compose の env 変更に伴うコンテナ再作成後に発生。原因は 2 つ重なっていた。

1. **IDE のポート自動フォワードによる遮蔽**。Cursor / VS Code はターミナル出力や env 中の `localhost:XXXX` を検知して Mac の `127.0.0.1:XXXX` に自動フォワードを張る。これは Docker の `0.0.0.0:XXXX` リスナーより優先され、しかも転送先は「コンテナ内の同番ポート」なので、公開ポート(8801→8800 のようなマッピング)では**実体のないポートに転送されて空応答になる**。
   - 対策(実施済み): `.vscode/settings.json` と `~/.cursor-server/data/Machine/settings.json` で `"remote.autoForwardPorts": false`。compose がポートを公開しているので自動フォワードは不要
   - 判別: Mac で `lsof -nP -iTCP:<port> -sTCP:LISTEN`。`Cursor` / `Code Helper` が 127.0.0.1 を掴んでいたらこれ
2. **Docker Desktop の Mac 側転送の状態破損**。`up -d` での再作成後、Mac 側(com.docker.backend)→コンテナの転送だけが壊れた。コンテナ restart・Docker Desktop 再起動・OS 再起動でも直らず、**`docker compose down` でネットワークごと削除してから `up -d`** で復旧した(`-v` は付けないこと。volume が消える)。
   - 切り分け: VM 内からは `sudo docker run --rm --net=host alpine wget -qO- http://127.0.0.1:<port>/` で通る(= VM→コンテナは正常)、新規ポートの使い捨てコンテナ(`docker run --rm -p 18080:8000 ...`)は Mac から通る(= 機能全体は健全)、なら該当プロジェクトの転送状態だけが壊れている

関連する注意: 旧構成のコンテナ(別プロジェクトの `*-dev-local` が別のポートを掴んでいる等)が並走していると、壊れたポートの代わりに**旧コンテナへ誤接続して「動いているように見える」**事故が起きる。使わない旧環境のコンテナは止めておく。

## 移行手順(全項目実施済み・記録として保持)

リポジトリ側の変更(`.dockerignore` / `Dockerfile.local` / `docker-compose.local.yml` / `etc/onstart-local.sh` / `CLAUDE.md`)は 2026-07-09 に、以下 1〜7 は 2026-07-10 に実施完了。

1. **この変更一式を main にコミットする**(現行コンテナ内 = ホスト clone 上)。
   bootstrap はホスト clone の HEAD を clone するため、未コミットの変更は新しい `~/app` に入らない。
2. ホスト側でホスト clone の事前設定(手順 1 の「事前設定」):

   ```bash
   git switch -c docker-ops    # main から分岐
   git config receive.denyCurrentBranch updateInstead
   ```

3. ホスト側で rebuild とコンテナ再作成:

   ```bash
   docker compose -f docker/docker-compose.local.yml build dev-local
   docker compose -f docker/docker-compose.local.yml up -d
   ```

   `home_appuser` volume は残るので `~/.claude` 等はそのまま引き継がれ、`~/app` が新規に clone される(初回は pnpm install が store 再作成込みで走るため時間がかかる)。
4. 動作確認: コンテナに入って `git -C ~/app remote -v` に `host` があること、`pnpm dev` が起動すること、`/app` symlink が `~/app` を指していること。
5. GitHub origin の作成と SSH キー設定(`~/.ssh` は home volume 上に作る)。その後 `git remote add origin <URL>`。
6. 旧 volume の削除:

   ```bash
   docker volume rm myapp_backend_build myapp_backend_node_modules myapp_frontend_node_modules
   ```

7. ホスト clone 直下の残置ホームファイル(`.ssh` `.claude` `.claude.json` `.bash_history` `.cache` `.local` 等)を掃除し、`.gitignore` のホワイトリスト方式を通常方式に簡素化する(workplan 0-4 の残タスク)。`.dockerignore` のホワイトリストは、将来イメージへの COPY を足したときの保険として掃除後も維持する。
