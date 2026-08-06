# Provider configuration for the module
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
