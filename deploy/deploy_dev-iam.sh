#!/bin/bash

set -euo pipefail

source "$(dirname "$0")/notify_slack.sh"

export AWS_PROFILE="myapp-dev-tf-user-iam"

cd ~/terraform/environments/dev/iam/
terraform apply -auto-approve

notify_slack "[deploy] dev-iam"
