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
  description = "Environment name"
  type        = string
  default     = "prod-main"
}

variable "base_environment" {
  description = "Base environment name"
  type        = string
  default     = "prod"
}
variable "domain_name" {
  description = "Domain name"
  type        = string
  default     = "myapp.myappdomain.com"
}
variable "cookie_domain" {
  description = "cookie domain name"
  type        = string
  default     = "myapp.myappdomain.com"
}
variable "local_domain_name" {
  description = "Local domain name"
  type        = string
  default     = "prod.internal"
}
variable "aws_account_id" {
  description = "AWS Account ID"
  type        = string
  default     = "756074065984"
}

variable "url_host_name_spa" {
  description = "URL host name for spa"
  type        = string
  default     = "myapp.myappdomain.com"
}
variable "url_host_name_api" {
  description = "URL host name for api"
  type        = string
  default     = "api.myapp.myappdomain.com"
}
variable "s3_bucket_name_spa" {
  description = "S3 bucket name for spa"
  type        = string
  default     = "com.myappdomain.myapp.prod-main-spa"
}
variable "container_name" {
  description = "ECS server container name"
  type        = string
  default     = "myappdomain-app-prod-main"
}


variable "slack_webhook_url" {
  description = "Slack webhook URL for error notifications"
  type        = string
  # **default を持たせない。** 秘密情報に default を書くとリポジトリに平文で残る
  # (実際に旧案件の webhook URL がここに埋まっていて、GitHub の push protection に
  # 検出された)。terraform.tfvars か TF_VAR_slack_webhook_url で与える
  sensitive = true
}
