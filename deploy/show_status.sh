#!/bin/bash
set -euo pipefail

usage() {
  echo "Usage: $0 (dev|prod)-(main|util)"
  exit 1
}

[ $# -ne 1 ] && usage

ENV="$1"
case "${ENV}" in
  dev-util|dev-main)  AWS_PROFILE="myapp-dev-tf-user-main" ;;
  prod-util|prod-main) AWS_PROFILE="myapp-prod-tf-user-main" ;;
  *) usage ;;
esac

ecs_cluster="${ENV}-ecs-cluster-main"
ecs_service="${ENV}-ecs-service-main"
ecs_task_family="${ENV}-ecs-task-family-main"

echo "=== ${ENV} ==="
echo ""

echo "### Service Status"
aws ecs describe-services \
  --profile "${AWS_PROFILE}" \
  --cluster "${ecs_cluster}" \
  --services "${ecs_service}" \
  --query 'services[0].{desiredCount:desiredCount, runningCount:runningCount, pendingCount:pendingCount, status:status}' \
  --output table

echo ""

echo "### Build Info"
aws ecs describe-task-definition \
  --profile "${AWS_PROFILE}" \
  --task-definition "${ecs_task_family}" \
  --query 'taskDefinition.containerDefinitions[0].environment[?name==`GIT_BRANCH` || name==`GIT_COMMIT`]' \
  --output table
