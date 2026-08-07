#!/bin/bash
#
# 本番デプロイ。**開発コンテナ内で実行する**(sudo docker が使える)。
#
# 手順は ADR docs/decisions/20260806-deploy-and-scheduled-jobs.md に対応:
#
#   build & push → terraform apply(タスク定義の新リビジョン登録のみ)
#     → run-task で migrate deploy → exitCode 0 を確認
#     → update-service → wait services-stable
#     → SPA を S3 へ + CloudFront invalidation
#
# **サービスのイメージ更新は terraform の管理外**(lifecycle.ignore_changes)。
# terraform apply はタスク定義を登録するだけで、ロールアウトはこのスクリプトの責務。
# マイグレーションが失敗したらサービスは旧イメージのまま止まる。

set -euo pipefail

source "$(dirname "$0")/notify_slack.sh"

#================================================= オプション

SKIP_FRONTEND=false
SKIP_BACKEND=false

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-frontend) SKIP_FRONTEND=true; shift ;;
    --skip-backend)  SKIP_BACKEND=true;  shift ;;
    *) echo "Unknown option: $1"; echo "Usage: $0 [--skip-frontend] [--skip-backend]"; exit 1 ;;
  esac
done

#================================================= 設定

export AWS_PROFILE="machineid-prod"
export NODE_ENV="production"

repo_url="git@github.com:shutarox/machineid.git"
repo_branch="main"

# 大元のプロジェクトは HOME 直下を使っていたが、この雛形はリポジトリを ~/app に置くので
# ビルド作業ディレクトリも ~/app/build にする(.gitignore の `build` で除外される)
build_dir="${HOME}/app/build"
tf_dir="${HOME}/app/terraform/environments/prod/main-app"

aws_region="ap-northeast-1"
aws_account_id="439996178164"
ecr_repository_name="machineid-app-prod"
ecr_repository_url="${aws_account_id}.dkr.ecr.${aws_region}.amazonaws.com/${ecr_repository_name}"

ecs_cluster="machineid-prod-ecs-cluster"
ecs_service="machineid-prod-ecs-service"
container_name="machineid-app-prod"

api_server_base_url="https://api.machineid.kas.jp"
spa_s3_bucket_name="machineid-prod-spa-439996178164"
cloudfront_distribution_id="E3ARCG9SOD4FO3"

docker_file="docker/Dockerfile.prod-main"

#================================================= 前提チェック

# SSO は 8 時間で切れる。**静的キーへ退避せず**、ログインを促して終了する
if ! aws sts get-caller-identity > /dev/null 2>&1; then
  echo "### AWS の資格情報が無効です。次を実行してから再試行してください:"
  echo "    aws sso login --sso-session machineid --use-device-code --no-browser"
  exit 1
fi

#================================================= ソースの取得
#
# 作業ツリーではなく clone を使う。**ビルド対象をコミット済みの ${repo_branch} に固定する**ため
# (未コミットの変更が本番イメージに混入するのを防ぐ)。

echo "### clone ${repo_url} (${repo_branch})"
rm -rf "${build_dir}"
mkdir -p "${build_dir}"
git clone -b "${repo_branch}" "${repo_url}" "${build_dir}/app"
cd "${build_dir}/app"

BUILD_DATE=$(date +%Y%m%d.%H%M)
COMMIT_HASH=$(git rev-parse --short=8 HEAD)
BUILD_VERSION="${BUILD_DATE}.${COMMIT_HASH}"
git_branch=$(git rev-parse --abbrev-ref HEAD)

#================================================= フロントエンドのビルド

if [ "$SKIP_FRONTEND" = false ]; then
  echo "### building frontend"
  export VITE_API_SERVER_BASE_URL="${api_server_base_url}"
  export VITE_ENABLE_DEBUG_MODE=false
  export VITE_BUILD_VERSION="${BUILD_VERSION}"
  export BUILD_VERSION="${BUILD_VERSION}"

  cd "${build_dir}/app/frontend"
  pnpm install
  pnpm build
else
  echo "### skipping frontend build"
fi

#================================================= バックエンド(イメージ)

if [ "$SKIP_BACKEND" = false ]; then
  echo "### docker build"
  cd "${build_dir}/app"
  sudo docker build -f "${docker_file}" --build-arg BUILD_VERSION="${BUILD_VERSION}" -t "${ecr_repository_name}:latest" .

  echo "### ecr login"
  aws ecr get-login-password | sudo docker login --username AWS --password-stdin "${ecr_repository_url}"

  echo "### docker push"
  sudo docker tag "${ecr_repository_name}:latest" "${ecr_repository_url}:latest"
  sudo docker push "${ecr_repository_url}:latest"

  # :latest は動くタグなので、タスク定義には digest で固定する
  echo "### resolve image digest"
  ecr_digest_value=$(aws ecr describe-images \
    --repository-name "${ecr_repository_name}" \
    --image-ids imageTag=latest \
    --query 'imageDetails[0].imageDigest' --output text)
  echo "ecr_digest = ${ecr_digest_value}"

  cd "${tf_dir}"
  {
    echo "ecr_digest = \"${ecr_digest_value}\""
    echo "git_branch = \"${git_branch}\""
    echo "git_commit = \"${COMMIT_HASH}\""
  } > ecr_digest.auto.tfvars

  #=============================================== タスク定義の登録(サービスは触らない)

  echo "### terraform apply (task definition only)"
  terraform init -input=false
  terraform apply -auto-approve -input=false

  task_def_arn=$(terraform output -raw task_definition_arn)
  echo "task definition: ${task_def_arn}"

  #=============================================== マイグレーション(使い捨てタスク)

  echo "### migrate (run-task)"
  net_json=$(terraform output -json task_network_configuration)
  subnets=$(echo "${net_json}" | jq -r '.subnets | join(",")')
  security_groups=$(echo "${net_json}" | jq -r '.security_groups | join(",")')

  overrides=$(jq -nc --arg name "${container_name}" \
    '{containerOverrides:[{name:$name,command:["cd","/app/backend","&&","./node_modules/.bin/prisma","migrate","deploy"]}]}')

  task_arn=$(aws ecs run-task \
    --cluster "${ecs_cluster}" \
    --task-definition "${task_def_arn}" \
    --launch-type FARGATE --platform-version LATEST \
    --started-by "deploy-migrate" \
    --network-configuration "awsvpcConfiguration={subnets=[${subnets}],securityGroups=[${security_groups}],assignPublicIp=ENABLED}" \
    --overrides "${overrides}" \
    --query 'tasks[0].taskArn' --output text)

  echo "migration task: ${task_arn}"
  aws ecs wait tasks-stopped --cluster "${ecs_cluster}" --tasks "${task_arn}"

  exit_code=$(aws ecs describe-tasks --cluster "${ecs_cluster}" --tasks "${task_arn}" \
    --query 'tasks[0].containers[0].exitCode' --output text)

  if [ "${exit_code}" != "0" ]; then
    echo "### migration failed (exitCode=${exit_code})"
    echo "### ログ: aws logs tail /ecs/machineid-prod --since 10m"
    notify_slack "[deploy] prod-main **migration failed** (commit: ${COMMIT_HASH}, exitCode: ${exit_code})"
    exit 1
  fi
  echo "### migration ok"

  #=============================================== ロールアウト

  echo "### update-service"
  aws ecs update-service \
    --cluster "${ecs_cluster}" \
    --service "${ecs_service}" \
    --task-definition "${task_def_arn}" \
    > /dev/null

  echo "### wait services-stable"
  aws ecs wait services-stable --cluster "${ecs_cluster}" --services "${ecs_service}"
else
  echo "### skipping backend build and deploy"
fi

#================================================= フロントエンドの配信

if [ "$SKIP_FRONTEND" = false ]; then
  echo "### upload frontend"
  cd "${build_dir}/app/frontend"
  aws s3 sync dist/ "s3://${spa_s3_bucket_name}/" \
    --cache-control "public, max-age=31536000, immutable" \
    --exclude "index.html" \
    --delete

  # index.html だけはキャッシュさせない(新しいアセットへの入口になるため)
  aws s3 cp dist/index.html "s3://${spa_s3_bucket_name}/index.html" \
    --cache-control "no-cache, no-store, must-revalidate"

  echo "### cloudfront invalidation"
  aws cloudfront create-invalidation \
    --distribution-id "${cloudfront_distribution_id}" \
    --paths "/*" > /dev/null
else
  echo "### skipping frontend deploy"
fi

echo "### successfully deployed"

options=""
[ "$SKIP_FRONTEND" = true ] && options="${options}, --skip-frontend"
[ "$SKIP_BACKEND" = true ] && options="${options}, --skip-backend"

notify_slack "[deploy] prod-main (branch: ${git_branch}, commit: ${COMMIT_HASH}${options})"
