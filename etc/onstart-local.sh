#!/bin/bash

# ~/app(作業コピー)の bootstrap: ホスト clone(/host/app)から clone する。
# 構成・運用は docs/dev-container.md 参照。
if [ ! -e ~/app/.git ]; then
    # compose の working_dir 指定により ~/app が root 所有で自動作成されるケースを補正
    sudo install -d -o appuser -g appuser ~/app
    git clone /host/app ~/app
    # remote 名は用途に合わせる: host = ホスト clone への受け渡し口。
    # origin は GitHub 用に空けておく(git remote add origin <GitHub URL> を別途実施)
    git -C ~/app remote rename origin host
    # ホスト clone が docker-ops(受け渡しブランチ)を checkout していても main から始める
    git -C ~/app switch main 2>/dev/null || true
fi

# 受け渡し用 remote の保証(既存 volume 移行時)
if [ -d /host/app/.git ] && ! git -C ~/app remote get-url host > /dev/null 2>&1; then
    git -C ~/app remote add host /host/app
fi

# シェル環境はリポジトリ管理の dotfile 一式で provisioning する
# (docker/home-appuser-local/ 配下の全ファイルをパーミッションごとコピー。
#  HOME は named volume のため、イメージへの COPY は初回しか反映されない)
cp -a ~/app/docker/home-appuser-local/. ~/

# 旧構成の pnpm store 設定(/data/pnpm-store)を掃除。
# store は pnpm デフォルト(~/.local/share/pnpm)を使う: ~/app と同一 volume なのでハードリンクが効く
[ -f ~/.npmrc ] && sed -i '/^store-dir=/d' ~/.npmrc

# PostgreSQL のパスワードを ~/.pgpass に設定
echo "*:*:*:appuser:${DB_PASSWORD}" > ~/.pgpass
chmod 600 ~/.pgpass

direnv allow ~/app/terraform.example/environments/dev
direnv allow ~/app/terraform.example/environments/dev/iam
direnv allow ~/app/terraform.example/environments/prod
direnv allow ~/app/terraform.example/environments/prod/iam

cd ~/app/backend
pnpm install
pnpm db:generate

cd ~/app/frontend
pnpm install

# Docker デーモンはホストのものを使用する
# (compose で /var/run/docker.sock を mount。デーモンは起動しない)

while true; do
    sleep 1
done
