#!/bin/bash
#
# 本番タスクへ ECS Exec で入るためのコマンドを生成する。
#
#   ./deploy/exec.sh              # bash ログイン用のコマンドを表示
#   ./deploy/exec.sh --run        # そのまま実行(session-manager-plugin が要る)
#   ./deploy/exec.sh 'psql -h $DB_HOST -U postgres machineid'   # 任意コマンド用に生成
#
# **踏み台サーバの代わり。** util サーバを置かない方針なので、本番の中を見る手段は
# これと `deploy/run_task.sh`(使い捨てタスクでスクリプト実行)の 2 つ
# (ADR docs/decisions/20260806-aws-minimal-prod.md)。
#
# 実行には **session-manager-plugin** が必要。開発コンテナには入っていないので、
# 生成したコマンドを手元(Mac)で実行するか、プラグインを入れてから --run する。
#
# 注意: ECS Exec で入ると **root** になる。アプリは appuser で動いているので、
# 同じ環境変数(APPX_* を転記した /etc/environment)が要るときは `su - appuser`。

set -euo pipefail

export AWS_PROFILE="machineid-prod"

ecs_cluster="machineid-prod-ecs-cluster"
ecs_service="machineid-prod-ecs-service"
container_name="machineid-app-prod"

usage() {
  cat <<'EOF'
本番タスクへ ECS Exec で入るためのコマンドを生成する。

使い方:
  ./deploy/exec.sh                 bash ログイン用のコマンドを表示する
  ./deploy/exec.sh --run           そのまま実行する(session-manager-plugin が要る)
  ./deploy/exec.sh '<コマンド>'    任意のコマンド用に生成する
  ./deploy/exec.sh --help          この説明

例:
  ./deploy/exec.sh --run
  ./deploy/exec.sh --run 'su - appuser'
  ./deploy/exec.sh "/bin/bash -c 'psql -h \$DB_HOST -U postgres machineid'"

補足:
  - **ECS Exec はシェルを介さずコマンドを実行する。** 文字列は空白で分割され、
    先頭がそのまま実行ファイルとして扱われる(`id; hostname` は
    `exec: "id;" not found` になる)。**パイプ・複数コマンド・環境変数の展開が
    要るときは `/bin/bash -c '...'` で包むこと。**
  - **入ると root になる。** アプリは appuser で動いており、APPX_* を転記した
    /etc/environment を読むのは appuser のログインシェル。アプリと同じ環境変数が
    要る作業($DB_HOST を使う等)は `su - appuser` してから
    (実測: root では $DB_HOST が空、appuser では db-pg.prod.internal)。
  - 複数タスクが動いているときは全部を列挙する。入る先を変えるなら --task を差し替える。
  - スクリプトの実行は ECS Exec ではなく ./deploy/run_task.sh を使う
    (使い捨てタスクで動くので、稼働中のタスクに影響しない)。
EOF
}

run_it=false
command_line="/bin/bash"

for arg in "$@"; do
  case "${arg}" in
    --help|-h) usage; exit 0 ;;
    --run)     run_it=true ;;
    *)         command_line="${arg}" ;;
  esac
done

if ! aws sts get-caller-identity > /dev/null 2>&1; then
  echo "### AWS の資格情報が無効です。次を実行してから再試行してください:"
  echo "    aws sso login --sso-session machineid --use-device-code --no-browser"
  exit 1
fi

task_arns=$(aws ecs list-tasks --cluster "${ecs_cluster}" --service-name "${ecs_service}" \
  --desired-status RUNNING --query 'taskArns[]' --output text)

if [ -z "${task_arns}" ] || [ "${task_arns}" = "None" ]; then
  echo "### 稼働中のタスクがありません"
  exit 1
fi

# 複数動いていることがある(autoscaling / デプロイ中)。どれに入るかは選べる必要がある
count=$(echo "${task_arns}" | wc -w)
echo "### 稼働中のタスク: ${count} 個"
for arn in ${task_arns}; do
  id="${arn##*/}"
  info=$(aws ecs describe-tasks --cluster "${ecs_cluster}" --tasks "${arn}" \
    --query 'tasks[0].{td:taskDefinitionArn,agent:containers[0].managedAgents[0].lastStatus,started:startedAt}' \
    --output text)
  echo "  ${id}  ${info}"
done
echo ""

first_task="${task_arns%%	*}"
first_task="${first_task%% *}"
task_id="${first_task##*/}"

cmd=$(cat <<EOF
aws ecs execute-command \\
  --profile ${AWS_PROFILE} \\
  --cluster ${ecs_cluster} \\
  --task ${task_id} \\
  --container ${container_name} \\
  --interactive \\
  --command '${command_line}'
EOF
)

echo "### コマンド(タスクを変えるときは --task を差し替える)"
echo ""
echo "${cmd}"
echo ""

if [ "${run_it}" = true ]; then
  if ! command -v session-manager-plugin > /dev/null 2>&1; then
    echo "### session-manager-plugin が入っていないため実行できません。"
    echo "### 上のコマンドを手元(Mac)で実行するか、プラグインを入れてください:"
    echo "###   https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html"
    echo "### 開発コンテナに入れる場合は docker/Dockerfile.local にも反映すること"
    exit 1
  fi
  echo "### 実行します"
  aws ecs execute-command \
    --cluster "${ecs_cluster}" \
    --task "${task_id}" \
    --container "${container_name}" \
    --interactive \
    --command "${command_line}"
fi
