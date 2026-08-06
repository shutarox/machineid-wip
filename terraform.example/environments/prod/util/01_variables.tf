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
  default     = "prod-util"
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

variable "url_host_name" {
  description = "URL host name"
  type        = string
  default     = "stage.1456.myapp.myappdomain.com"
}
variable "cookie_domain" {
  description = "cookie domain name"
  type        = string
  default     = "myapp.myappdomain.com"
}
variable "ssh_host_name_multi" {
  description = "SSH host name for multi"
  type        = string
  default     = "qb0i10ksiwwkdo0u.myapp.myappdomain.com"
}
variable "container_name" {
  description = "ECS server container name"
  type        = string
  default     = "myapp-app-prod-util"
}

