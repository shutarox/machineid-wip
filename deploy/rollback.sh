#!/bin/bash
#
# 直前のタスク定義リビジョンへ戻す。
#
#   ./deploy/rollback.sh          # 1 つ前のリビジョンへ
#   ./deploy/rollback.sh 12       # リビジョン 12 へ
#
# **terraform を通さない。** サービスのイメージ更新は terraform の管理外
# (lifecycle.ignore_changes)なので、update-service だけで完結する
# (ADR docs/decisions/20260806-deploy-and-scheduled-jobs.md 決定 1)。
#
# 注意: **DB のマイグレーションは戻らない。** 前方のマイグレーションが後方互換
# (expand / contract)で書かれていることが前提になる。

set -euo pipefail

export AWS_PROFILE="machineid-prod"

ecs_cluster="machineid-prod-ecs-cluster"
ecs_service="machineid-prod-ecs-service"
task_family="machineid-prod-task"

if ! aws sts get-caller-identity > /dev/null 2>&1; then
  echo "### AWS の資格情報が無効です。次を実行してから再試行してください:"
  echo "    aws sso login --sso-session machineid --use-device-code --no-browser"
  exit 1
fi

current_arn=$(aws ecs describe-services --cluster "${ecs_cluster}" --services "${ecs_service}" \
  --query 'services[0].taskDefinition' --output text)
current_rev="${current_arn##*:}"
echo "現在: リビジョン ${current_rev}"

if [ $# -ge 1 ]; then
  target_rev="$1"
else
  target_rev=$((current_rev - 1))
fi

if [ "${target_rev}" -lt 1 ]; then
  echo "### 戻せるリビジョンがありません"
  exit 1
fi

target_arn="${task_family}:${target_rev}"

# 存在確認(ACTIVE でないと update-service が失敗する)
status=$(aws ecs describe-task-definition --task-definition "${target_arn}" \
  --query 'taskDefinition.status' --output text 2>/dev/null || echo "MISSING")
if [ "${status}" != "ACTIVE" ]; then
  echo "### リビジョン ${target_rev} は使えません (status=${status})"
  exit 1
fi

echo "### ${current_rev} → ${target_rev} へロールバックします"
aws ecs update-service \
  --cluster "${ecs_cluster}" \
  --service "${ecs_service}" \
  --task-definition "${target_arn}" > /dev/null

echo "### wait services-stable"
aws ecs wait services-stable --cluster "${ecs_cluster}" --services "${ecs_service}"
echo "### done"
