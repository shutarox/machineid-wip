# iam — AWS リソースが引き受けるロール
#
# **terraform 実行用の IAM ユーザは作らない。** 人間は IAM Identity Center(SSO)、
# CI は GitHub Actions の OIDC で認証する(ADR 20260806-aws-minimal-prod.md 決定 6)。
# ここに置くのは「リソースが引き受けるロール」だけ。
#
# apply 頻度: ほぼゼロ。IAM 書き込み権限が要るため他スタックと分けている。

terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "s3" {
    bucket       = "machineid-prod-tfstate-439996178164"
    key          = "prod-iam/terraform.tfstate"
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

variable "s3_bucket_name_uploads" {
  description = "アップロード画像のバケット。**アカウント ID を含めない**(presigned URL で露出するため)"
  type        = string
  default     = "machineid-prod-uploads"
}

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  # SSM の名前空間は backend/src/config.ts の SSM_KEY_PREFIX と揃える
  ssm_key_arn = "arn:aws:ssm:${var.aws_region}:${var.aws_account_id}:parameter/${var.project_name}-keys/*"
}
