#!/bin/bash

set -euo pipefail

source "$(dirname "$0")/notify_slack.sh"

# オプション解析
SKIP_FRONTEND=false
SKIP_BACKEND=false
BRANCH=""

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-frontend)
      SKIP_FRONTEND=true
      shift
      ;;
    --skip-backend)
      SKIP_BACKEND=true
      shift
      ;;
    --branch)
      if [ $# -lt 2 ]; then
        echo "Option --branch requires an argument."
        exit 1
      fi
      BRANCH="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 --branch <name> [--skip-frontend] [--skip-backend]"
      exit 1
      ;;
  esac
done

if [ -z "${BRANCH}" ]; then
  echo "Error: --branch is required."
  echo "Usage: $0 --branch <name> [--skip-frontend] [--skip-backend]"
  exit 1
fi

export AWS_PROFILE="myapp-dev-tf-user-main"
export NODE_ENV="development"

tf_env="dev-main"
tf_path="dev/main-app"

aws_account_id="229116416403"
ecr_repository_host="${aws_account_id}.dkr.ecr.ap-northeast-1.amazonaws.com"
docker_file="docker/Dockerfile.${tf_env}"

ecr_repository_name="myapp-app-${tf_env}"
ecr_repository_url="${ecr_repository_host}/${ecr_repository_name}"
ecr_digest_name="ecr_digest"

api_server_base_url="https://api.demo.1616.myappdomain.com"
cloudfront_distribution_id="E4FTSGM1OS0D9"
spa_s3_bucket_name="com.myappdomain.myapp.${tf_env}-spa"

# pull image

echo "### pull image"
rm -rf ~/build
mkdir ~/build
cd ~/build
git clone -b "${BRANCH}" git@github.com:shutarox/myapp.git app
cd ~/build/app

BUILD_DATE=$(date +%Y%m%d.%H%M)
COMMIT_HASH=$(git rev-parse --short=8 HEAD)
BUILD_VERSION="${BUILD_DATE}.${COMMIT_HASH}"

# build frontend
if [ "$SKIP_FRONTEND" = false ]; then
  echo "### building frontend"

  export VITE_API_SERVER_BASE_URL=${api_server_base_url}
  export VITE_ENABLE_DEBUG_MODE=true
  export VITE_BUILD_VERSION=${BUILD_VERSION}
  export BUILD_VERSION=${BUILD_VERSION}

  cd ~/build/app/frontend
  pnpm install
  pnpm build
else
  echo "### skipping frontend build"
fi

# build backend
if [ "$SKIP_BACKEND" = false ]; then
  echo "### building backend"
  cd ~/
  sudo docker build -f ${docker_file} --build-arg BUILD_VERSION=${BUILD_VERSION} -t ${ecr_repository_name}:latest .

  # ECR 認証情報の取得 (~/.docker/config.json に保存される)
  echo "### ecr get-login-password"
  aws ecr get-login-password --profile ${AWS_PROFILE} | \
   sudo docker login --username AWS --password-stdin ${ecr_repository_url}

  # docker push
  echo "### docker push"
  sudo docker tag ${ecr_repository_name}:latest ${ecr_repository_url}:latest
  sudo docker push ${ecr_repository_url}:latest

  # ECR のダイジェストを取得して terraform の変数ファイルに保存
  echo "### get docker image digest"
  ecr_digest_value=$(aws ecr describe-images --profile $AWS_PROFILE --repository-name ${ecr_repository_name} --image-ids imageTag=latest --query 'imageDetails[0].imageDigest' --output text)
  echo "ecr_digest = ${ecr_digest_value}"
  cd ~/terraform/environments/${tf_path}/
  echo "${ecr_digest_name} = \"${ecr_digest_value}\"" > ${ecr_digest_name}.auto.tfvars

  # git情報を書き込み
  git_branch=$(cd ~/build/app && git rev-parse --abbrev-ref HEAD)
  git_commit=$(cd ~/build/app && git rev-parse --short=8 HEAD)
  echo "git_branch = \"${git_branch}\"" >> ${ecr_digest_name}.auto.tfvars
  echo "git_commit = \"${git_commit}\"" >> ${ecr_digest_name}.auto.tfvars

  # terraform apply
  echo "### terraform apply"
  cd ~/terraform/environments/${tf_path}/
  terraform init -input=false
  terraform apply -auto-approve
else
  echo "### skipping backend build and deploy"
fi

# upload frontend
if [ "$SKIP_FRONTEND" = false ]; then
  echo "### upload frontend"
  cd ~/build/app/frontend
  aws s3 sync dist/ s3://${spa_s3_bucket_name}/ \
    --cache-control "public, max-age=31536000, immutable" \
    --exclude "index.html" \
    --delete

  echo "### upload index.html"
  aws s3 cp dist/index.html s3://${spa_s3_bucket_name}/index.html \
    --cache-control "no-cache, no-store, must-revalidate"

  echo "### create invalidation"
  aws cloudfront create-invalidation \
    --distribution-id $cloudfront_distribution_id \
    --paths "/*"
else
  echo "### skipping frontend deploy"
fi

echo "### successfully deployed"

options=""
[ "$SKIP_FRONTEND" = true ] && options="${options}, --skip-frontend"
[ "$SKIP_BACKEND" = true ] && options="${options}, --skip-backend"

notify_slack "[deploy] ${tf_env} (branch: ${BRANCH}, commit: ${COMMIT_HASH}${options})"
