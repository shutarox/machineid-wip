#!/bin/bash

set -euo pipefail

source "$(dirname "$0")/notify_slack.sh"

export AWS_PROFILE="myapp-prod-tf-user-main"
export NODE_ENV="production"

tf_env="prod-util"
tf_path="prod/util-app"

aws_account_id="756074065984"
ecr_repository_host="${aws_account_id}.dkr.ecr.ap-northeast-1.amazonaws.com"
docker_file="docker/Dockerfile.${tf_env}"

ecr_repository_name="myapp-app-${tf_env}"
ecr_repository_url="${ecr_repository_host}/${ecr_repository_name}"
ecr_digest_name="ecr_digest"

# build image
echo "### building utility container image"
rm -rf ~/build
mkdir ~/build
cd ~/build
git clone -b main git@github.com:shutarox/myapp.git app
cd ~/
sudo docker build -f ${docker_file} -t ${ecr_repository_name}:latest .

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

# サービスのdesired_countを1に設定
echo "ecs_service_desired_count = \"1\"" > ecs_service_desired_count.auto.tfvars

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

notify_slack "[deploy] ${tf_env} (branch: ${git_branch}, commit: ${git_commit})"
