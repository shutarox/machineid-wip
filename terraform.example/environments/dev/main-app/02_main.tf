terraform {
  backend "s3" {
    bucket       = "com.myappdomain.myapp.dev-terraform"
    key          = "dev-main-app/terraform.tfstate"
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
