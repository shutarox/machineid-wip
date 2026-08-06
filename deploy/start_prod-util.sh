#!/bin/bash

set -euo pipefail

source "$(dirname "$0")/notify_slack.sh"

export AWS_PROFILE="myapp-prod-tf-user-main"

tf_path="prod/util-app"

# サービスのdesired_countを0に設定
cd ~/terraform/environments/${tf_path}/
echo "ecs_service_desired_count = \"1\"" > ecs_service_desired_count.auto.tfvars

# terraform apply
echo "### terraform apply"
cd ~/terraform/environments/${tf_path}/
terraform init -input=false
terraform apply -auto-approve

notify_slack "[start] prod-util"