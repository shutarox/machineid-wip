terraform {
  backend "s3" {
    bucket = "com.myappdomain.myapp.prod-terraform"
    key    = "prod-iam/terraform.tfstate"
    region = "ap-northeast-1"
    encrypt        = true
    use_lockfile   = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Terraform   = true
      Environment = var.environment
      Project     = var.project_name
      ManagedBy   = "terraform-iam"
    }
  }
}

# IAM Module
module "iam" {
  source = "../../../modules/iam"
  
  environment   = var.environment
  project_name  = var.project_name
  aws_region    = var.aws_region
  force_destroy = false # 本番環境なのでユーザーの強制削除を不許可
  create_local_developer = false # 本番環境なのでローカル開発者を作成しない
}
