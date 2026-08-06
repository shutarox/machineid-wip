#!/bin/bash

set -euo pipefail

source "$(dirname "$0")/notify_slack.sh"

export AWS_PROFILE="myapp-prod-tf-user-iam"

cd ~/terraform/environments/prod/iam/
terraform apply -auto-approve

notify_slack "[deploy] prod-iam"
