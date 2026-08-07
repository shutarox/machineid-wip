#!/bin/bash
#
# 本番で任意のコマンドを使い捨ての ECS タスクとして実行する。
#
#   ./deploy/run_task.sh 'node /app/backend/build/script/cleanup_uploads.js --dry-run'
#
# **いまサービスが動かしているタスク定義**を describe-services から引くので、
# 実行されるコードは必ずデプロイ済みのものと一致する。
#
# 対話的に調べたいときはこれではなく ECS Exec を使う:
#   aws ecs execute-command --cluster <cluster> --task <taskArn> \
#     --container <container> --interactive --command /bin/bash
#
# entrypoint(etc/onstart-prod-main.sh)の末尾が `exec su - appuser -c "$*"` なので、
# command 配列はそのままシェル行として実行される。

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 '<command>'"
  echo "  例: $0 'node /app/backend/build/script/cleanup_uploads.js'"
  exit 1
fi

command_line="$1"

export AWS_PROFILE="machineid-prod"

ecs_cluster="machineid-prod-ecs-cluster"
ecs_service="machineid-prod-ecs-service"
container_name="machineid-app-prod"
log_group="/ecs/machineid-prod"

if ! aws sts get-caller-identity > /dev/null 2>&1; then
  echo "### AWS の資格情報が無効です。次を実行してから再試行してください:"
  echo "    aws sso login --sso-session machineid --use-device-code --no-browser"
  exit 1
fi

# いま動いているタスク定義とネットワーク設定を、サービスの実体から取る
echo "### resolve running task definition"
svc_json=$(aws ecs describe-services --cluster "${ecs_cluster}" --services "${ecs_service}" \
  --query 'services[0].{td:taskDefinition,net:networkConfiguration.awsvpcConfiguration}' --output json)

task_def_arn=$(echo "${svc_json}" | jq -r '.td')
subnets=$(echo "${svc_json}" | jq -r '.net.subnets | join(",")')
security_groups=$(echo "${svc_json}" | jq -r '.net.securityGroups | join(",")')
assign_public_ip=$(echo "${svc_json}" | jq -r '.net.assignPublicIp')

echo "task definition: ${task_def_arn}"
echo "command        : ${command_line}"

# command は配列で渡す。entrypoint 側で空白結合されてシェル行になる
overrides=$(jq -nc --arg name "${container_name}" --arg cmd "${command_line}" \
  '{containerOverrides:[{name:$name,command:($cmd | split(" "))}]}')

task_arn=$(aws ecs run-task \
  --cluster "${ecs_cluster}" \
  --task-definition "${task_def_arn}" \
  --launch-type FARGATE --platform-version LATEST \
  --started-by "run_task.sh" \
  --network-configuration "awsvpcConfiguration={subnets=[${subnets}],securityGroups=[${security_groups}],assignPublicIp=${assign_public_ip}}" \
  --overrides "${overrides}" \
  --query 'tasks[0].taskArn' --output text)

task_id="${task_arn##*/}"
echo "task: ${task_id}"

echo "### waiting..."
aws ecs wait tasks-stopped --cluster "${ecs_cluster}" --tasks "${task_arn}"

echo "### logs"
# ログストリームは awslogs-stream-prefix/コンテナ名/タスク ID
aws logs get-log-events \
  --log-group-name "${log_group}" \
  --log-stream-name "ecs/${container_name}/${task_id}" \
  --query 'events[].message' --output text 2>/dev/null || echo "(ログを取得できませんでした)"

exit_code=$(aws ecs describe-tasks --cluster "${ecs_cluster}" --tasks "${task_arn}" \
  --query 'tasks[0].containers[0].exitCode' --output text)

echo "### exitCode=${exit_code}"
[ "${exit_code}" = "0" ] || exit 1
