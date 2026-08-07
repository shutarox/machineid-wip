#!/bin/bash
#
# 本番 ECS サービスの状態と、動いているイメージの出どころを表示する。

set -euo pipefail

export AWS_PROFILE="machineid-prod"

ecs_cluster="machineid-prod-ecs-cluster"
ecs_service="machineid-prod-ecs-service"

if ! aws sts get-caller-identity > /dev/null 2>&1; then
  echo "### AWS の資格情報が無効です。次を実行してから再試行してください:"
  echo "    aws sso login --sso-session machineid --use-device-code --no-browser"
  exit 1
fi

echo "=== service ==="
aws ecs describe-services \
  --cluster "${ecs_cluster}" \
  --services "${ecs_service}" \
  --query 'services[0].{status:status,desired:desiredCount,running:runningCount,pending:pendingCount,taskDefinition:taskDefinition}' \
  --output table

echo ""
echo "=== build info (動いているタスク定義) ==="
task_def_arn=$(aws ecs describe-services --cluster "${ecs_cluster}" --services "${ecs_service}" \
  --query 'services[0].taskDefinition' --output text)

aws ecs describe-task-definition \
  --task-definition "${task_def_arn}" \
  --query 'taskDefinition.containerDefinitions[0].environment[?name==`GIT_BRANCH` || name==`GIT_COMMIT`]' \
  --output table

echo ""
echo "=== targets (ALB から見た健全性) ==="
tg_arn=$(aws elbv2 describe-target-groups --names machineid-prod-tg-api \
  --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null || echo "")
if [ -n "${tg_arn}" ]; then
  aws elbv2 describe-target-health --target-group-arn "${tg_arn}" \
    --query 'TargetHealthDescriptions[].{target:Target.Id,port:Target.Port,state:TargetHealth.State,reason:TargetHealth.Reason}' \
    --output table
else
  echo "(ターゲットグループが見つかりません)"
fi
