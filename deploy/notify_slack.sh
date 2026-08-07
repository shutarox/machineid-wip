#!/bin/bash

# Slack 通知ヘルパー
# 使い方:
#   source "$(dirname "$0")/notify_slack.sh"
#   notify_slack "[deploy] dev-main (branch: xxx, commit: yyy)"
#
# 環境変数 SLACK_WEBHOOK_URL が未設定の場合は送信をスキップする。

notify_slack() {
  local message="$1"
  if [ -z "${SLACK_WEBHOOK_URL:-}" ]; then
    echo "### SLACK_WEBHOOK_URL is not set, skipping slack notification"
    return 0
  fi
  curl -s -X POST -H 'Content-type: application/json' \
    --data "{\"text\":\"${message}\"}" \
    "${SLACK_WEBHOOK_URL}" > /dev/null \
    || echo "### slack notification failed (ignored)"
}
