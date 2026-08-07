# base — VPC / サブネット / ルーティング / セキュリティグループ / RDS / 内部 DNS
#
# apply 頻度: 低。RDS を含むため、頻繁に apply するスタックと分けている。
# 設計の根拠は docs/decisions/20260806-aws-minimal-prod.md

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
    key          = "prod-base/terraform.tfstate"
    region       = "ap-northeast-1"
    encrypt      = true
    use_lockfile = true # S3 ネイティブロック。DynamoDB テーブルは不要
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
  description = "プロジェクト名。SSM の名前空間 <project_name>-keys/ の元にもなる"
  type        = string
  default     = "machineid"
}

variable "environment" {
  description = "環境名"
  type        = string
  default     = "prod"
}

variable "aws_region" {
  description = "AWS リージョン"
  type        = string
  default     = "ap-northeast-1"
}

variable "aws_account_id" {
  description = "AWS アカウント ID"
  type        = string
  default     = "439996178164"
}

variable "cidr_block" {
  description = "VPC の CIDR"
  type        = string
  default     = "10.20.0.0/16"
}

variable "local_domain_name" {
  description = "VPC 内部の DNS ゾーン。RDS のエンドポイントをこの名前で参照する"
  type        = string
  default     = "prod.internal"
}

variable "domain_name" {
  description = <<-EOT
    アプリの公開ドメイン。**このゾーンを base で作る**。
    親ゾーン(kas.jp)は別アカウントにあるため、apply 後に NS 委任を手で登録する必要があり、
    その待ちを main の apply より前に置くためにここに置いている(README の「適用順序」)。
  EOT
  type        = string
  default     = "machineid.kas.jp"
}

variable "db_master_password" {
  description = <<-EOT
    RDS のマスターユーザ(postgres)のパスワード。**リポジトリに書かない。**

    apply 時に TF_VAR_db_master_password で渡す。SSM に置いてあるので:
      export TF_VAR_db_master_password=$(aws ssm get-parameter \
        --name /<project_name>-keys/DB_MASTER_PASSWORD --with-decryption \
        --query Parameter.Value --output text)

    **アプリはこのユーザを使わない。** アプリ用は appuser で、そのパスワードは
    SSM の /<project_name>-keys/DB_PASSWORD にある(script/db_bootstrap.ts が作る)。
    マスターは terraform と DB の管理操作(ロール作成・作り直し)専用。

    作成後は lifecycle.ignore_changes で追跡外になるので、
    ローテーションは AWS 側で行い SSM の DB_MASTER_PASSWORD を更新する。
  EOT
  type        = string
  sensitive   = true
}
