# main — 公開面(DNS / 証明書 / SPA 配信 / ALB)と ECR
#
# apply 頻度: 低〜中。ECS のサービス更新は main-app 側 + デプロイスクリプトの責務。

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
    key          = "prod-main/terraform.tfstate"
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

# CloudFront の証明書は us-east-1 にしか置けない。
# 雛形は modules/acm でこの二重性を包んでいたが、証明書が 2 枚しかないので
# module を挟まず直接書く(docs/plans/20260806-aws-prod-setup.md フェーズ 1)
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

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

# TODO: 案件のドメインが決まったら差し替える(現在は仮)。
# 親ゾーンは別アカウントにあるため、ここでサブドメインのゾーンを作り、
# **親ゾーン側に NS 委任レコードを手で足す**(docs/plans/20260806-aws-prod-setup.md)
variable "domain_name" {
  description = "アプリのドメイン。このゾーンを本スタックで作成する"
  type        = string
  default     = "machineid.example.com"
}

variable "s3_bucket_name_spa" {
  description = "SPA の配信元。CloudFront の OAC 経由でしか読まれず URL に出ないため、アカウント ID を含めてよい"
  type        = string
  default     = "machineid-prod-spa-439996178164"
}

variable "s3_bucket_name_uploads" {
  description = "アップロード画像。**アカウント ID を含めない**(presigned URL で露出するため。docs/known-issues.md)"
  type        = string
  default     = "machineid-prod-uploads"
}

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  url_host_name_spa = var.domain_name
  url_host_name_api = "api.${var.domain_name}"
}
