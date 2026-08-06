variable "AWS_ENV" {
  description = "AWS Environment"
  type        = string
  default     = ""

  validation {
    condition     = var.AWS_ENV == "prod"
    error_message = "環境変数 TF_VAR_AWS_ENV=prod の環境でのみ実行できます"
  }
}

variable "project_name" {
  description = "Project Name"
  type        = string
  default     = "myapp"
}
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-1"
}
variable "environment" {
  description = "Environment Name"
  type        = string
  default     = "prod-iam"
}
