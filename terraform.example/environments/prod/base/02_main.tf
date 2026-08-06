terraform {
  backend "s3" {
    bucket = "com.myappdomain.myapp.prod-terraform"
    key    = "prod-base/terraform.tfstate"
    region = "ap-northeast-1"
    encrypt       = true
    use_lockfile  = true
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

# cloudfront の ACM 用
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}
