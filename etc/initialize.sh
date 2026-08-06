# 開発サーバーの一括起動(pm2 リセット → install → dev)
# Usage: initialize.sh [リポジトリルート]  (省略時: /home/appuser/app)
# .vscode/terminals.json から /bin/sh で実行されるため POSIX 互換で書く

ROOT="${1:-/home/appuser/app}"

pm2 delete all || true
cd "$ROOT" || exit 1
pnpm install
pnpm dev
