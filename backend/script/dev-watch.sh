#!/bin/bash
# 開発用: tsx watch でサーバを起動し、型検査は tsc --watch --noEmit を並走させる。
#
# - dev では build/ を作らない。E2E(playwright.config.ts)がバックエンドを起動する方式と
#   同一にすることで、「dev サーバだけ古い build/ を見ていて新しい API が 404」を原理的に無くす
# - 子プロセスが 1 つでも落ちたらスクリプトごと終了する。PM2 の autorestart が拾い、
#   restart 回数として見えるようにする(黙って機能停止する状態を作らない)
#
# 経緯と実測は docs/decisions/20260804-dev-server.md を参照。

set -uo pipefail

# プロセスグループ全体を kill して確実にクリーンアップ
trap 'kill 0' SIGTERM SIGINT EXIT

# 型検査(emit しないのでサーバの動作には影響しない)
pnpm exec tsc --watch --noEmit --preserveWatchOutput &
TSC_PID=$!

# サーバ本体。ログ整形は process substitution で挟み、$! が tsx を指すようにする
# --include が必須: tsx watch は既定で「依存グラフ上のファイル」しか監視しないため、
# まだ誰も import していない新規ファイル(autoload がディレクトリ走査で拾うルート)を追加しても
# 再起動しない。src 配下を丸ごと監視対象に加えることで、旧構成の node --watch-path 相当にする
pnpm exec tsx watch --clear-screen=false --include './src/**/*.ts' \
  -r tsconfig-paths/register src/index.ts \
  > >(pnpm exec pino-pretty --timestampKey timestamp) 2>&1 &
TSX_PID=$!

# どちらかが終了したら全体を止める
wait -n "$TSC_PID" "$TSX_PID"
STATUS=$?
if kill -0 "$TSX_PID" 2>/dev/null; then
  echo "dev-watch: 型検査プロセス (tsc --watch --noEmit) が終了しました (exit=$STATUS)。dev を停止します。"
else
  echo "dev-watch: サーバプロセス (tsx watch) が終了しました (exit=$STATUS)。dev を停止します。"
fi
exit "${STATUS:-1}"
