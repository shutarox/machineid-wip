# main-app — ECS クラスタ / タスク定義 / サービス / autoscaling / 定期実行
#
# **apply されるのはタスク定義の新リビジョン登録まで。**
# サービスのイメージ更新は lifecycle.ignore_changes で terraform の管理外にあり、
# ロールアウトは deploy スクリプトの `aws ecs update-service` が行う
# (ADR 20260806-deploy-and-scheduled-jobs.md 決定 1)。

terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }

    # 監視 Lambda の zip を作る(38_monitoring.tf)
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }

  backend "s3" {
    bucket       = "machineid-prod-tfstate-439996178164"
    key          = "prod-main-app/terraform.tfstate"
    region       = "ap-northeast-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Terraform   = "true"
      Environment = var.environment
      Project     = var.project_name
    }
  }
}

#================================================= variables

variable "project_name" {
  type    = string
  default = "machineid"
}

variable "environment" {
  type    = string
  default = "prod"
}

variable "aws_region" {
  type    = string
  default = "ap-northeast-1"
}

variable "aws_account_id" {
  type    = string
  default = "439996178164"
}

variable "domain_name" {
  description = "main スタックの domain_name と揃える"
  type        = string
  default     = "machineid.kas.jp"
}

variable "local_domain_name" {
  description = "base スタックの内部ゾーン"
  type        = string
  default     = "prod.internal"
}

variable "s3_bucket_name_uploads" {
  type    = string
  default = "machineid-prod-uploads"
}

# デプロイスクリプトが ecr_digest.auto.tfvars に書き込む。
# :latest タグではなく digest で固定することで、タスク定義が指すイメージを一意にする
variable "ecr_digest" {
  description = "デプロイするイメージの digest(deploy スクリプトが渡す)"
  type        = string
}

variable "git_branch" {
  type    = string
  default = ""
}

variable "git_commit" {
  type    = string
  default = ""
}

locals {
  name_prefix    = "${var.project_name}-${var.environment}"
  container_name = "${var.project_name}-app-${var.environment}"

  url_host_name_spa = var.domain_name
  url_host_name_api = "api.${var.domain_name}"

  ssm_prefix = "arn:aws:ssm:${var.aws_region}:${var.aws_account_id}:parameter/${var.project_name}-keys"

  # 監視 Lambda が実行時に読む Slack webhook。**値は terraform で持たない**
  slack_webhook_ssm_parameter = "/${var.project_name}-keys/SLACK_WEBHOOK_URL"

  lambda_source_dir = "${path.module}/../../../../backend/lambda"
}
