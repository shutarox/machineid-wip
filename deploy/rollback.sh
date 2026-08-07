#!/bin/bash
#
# 直前に動いていたタスク定義へ戻す。
#
#   ./deploy/rollback.sh          # 直前に稼働していたリビジョンへ
#   ./deploy/rollback.sh 12       # リビジョン 12 へ(明示指定)
#
# **「現在のリビジョン − 1」ではない。** ECS のデプロイ履歴から
# 「今動いているデプロイが、どのリビジョンから切り替わったか」を引く。
#
# 番号を引き算する実装だと次のように誤爆する:
#
#   6 が壊れた → 5 へロールバック → 修正して 7 をデプロイ → 7 も駄目 → ロールバック
#   → 引き算だと **6(壊れていると分かっているもの)** に着地する
#   → 履歴を見れば正しく 5 に戻る
#
# **terraform を通さない。** サービスのイメージ更新は terraform の管理外
# (lifecycle.ignore_changes)なので、update-service だけで完結する
# (ADR docs/decisions/20260806-deploy-and-scheduled-jobs.md 決定 1)。
#
# 前提: タスク定義に skip_destroy = true が要る。これが無いと terraform が
# 古いリビジョンを deregister してしまい、戻る先が存在しない(実測)。
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
echo "現在: ${current_arn##*/}"

if [ $# -ge 1 ]; then
  target_arn="${task_family}:$1"
else
  #============================================= 直前に動いていたリビジョンを履歴から引く

  deployment_arn=$(aws ecs list-service-deployments \
    --cluster "${ecs_cluster}" --service "${ecs_service}" \
    --query 'serviceDeployments[0].serviceDeploymentArn' --output text)

  if [ -z "${deployment_arn}" ] || [ "${deployment_arn}" = "None" ]; then
    echo "### デプロイ履歴がありません。戻す先をリビジョン番号で指定してください"
    exit 1
  fi

  # sourceServiceRevisions = そのデプロイが「どこから切り替わったか」
  source_revision_arn=$(aws ecs describe-service-deployments \
    --service-deployment-arns "${deployment_arn}" \
    --query 'serviceDeployments[0].sourceServiceRevisions[0].arn' --output text)

  if [ -z "${source_revision_arn}" ] || [ "${source_revision_arn}" = "None" ]; then
    echo "### 直前のリビジョンがありません(初回デプロイの可能性)。"
    echo "### 戻す先をリビジョン番号で指定してください: $0 <revision>"
    exit 1
  fi

  target_arn=$(aws ecs describe-service-revisions \
    --service-revision-arns "${source_revision_arn}" \
    --query 'serviceRevisions[0].taskDefinition' --output text)
fi

target_rev="${target_arn##*:}"

if [ "${target_arn##*/}" = "${current_arn##*/}" ]; then
  echo "### 既にリビジョン ${target_rev} で動いています。何もしません"
  exit 0
fi

# ACTIVE でないと update-service が失敗する
status=$(aws ecs describe-task-definition --task-definition "${target_arn}" \
  --query 'taskDefinition.status' --output text 2>/dev/null || echo "MISSING")
if [ "${status}" != "ACTIVE" ]; then
  echo "### リビジョン ${target_rev} は使えません (status=${status})"
  echo "### terraform の aws_ecs_task_definition に skip_destroy = true があるか確認してください"
  exit 1
fi

echo "### ${current_arn##*:} → ${target_rev} へロールバックします"
aws ecs update-service \
  --cluster "${ecs_cluster}" \
  --service "${ecs_service}" \
  --task-definition "${target_arn}" > /dev/null

echo "### wait services-stable"
aws ecs wait services-stable --cluster "${ecs_cluster}" --services "${ecs_service}"
echo "### done"
