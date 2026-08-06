variable "AWS_ENV" {
  description = "AWS Environment"
  type        = string
  default     = ""

  validation {
    condition     = var.AWS_ENV == "dev"
    error_message = "環境変数 TF_VAR_AWS_ENV=dev の環境でのみ実行できます"
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
  default     = "dev-util"
}

variable "base_environment" {
  description = "Base environment name"
  type        = string
  default     = "dev"
}
variable "domain_name" {
  description = "Domain name"
  type        = string
  default     = "1616.myappdomain.com"
}
variable "local_domain_name" {
  description = "Local domain name"
  type        = string
  default     = "dev.internal"
}
variable "aws_account_id" {
  description = "AWS Account ID"
  type        = string
  default     = "229116416403"
}

variable "url_host_name" {
  description = "URL host name"
  type        = string
  default     = "dev.1616.myappdomain.com"
}
variable "cookie_domain" {
  description = "cookie domain name"
  type        = string
  default     = "1616.myappdomain.com"
}
variable "ssh_host_name_multi" {
  description = "SSH host name for multi"
  type        = string
  default     = "aopll9qkwe1ral5b.1616.myappdomain.com"
}
variable "container_name" {
  description = "ECS server container name"
  type        = string
  default     = "myapp-app-dev-util"
}

