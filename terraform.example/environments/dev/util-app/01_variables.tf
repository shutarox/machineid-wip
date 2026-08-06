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
variable "local_domain_name" {
  description = "Local domain name"
  type        = string
  default     = "dev.internal"
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
variable "container_name" {
  description = "ECS server container name"
  type        = string
  default     = "myapp-app-dev-util"
}

variable "ecr_digest" {
  description = "ECR digest"
  type        = string
}

variable "ecs_service_desired_count" {
  description = "起動・停止制御用"
  type        = number
  default     = 1
}

variable "git_branch" {
  description = "デプロイ元の Git ブランチ名"
  type        = string
  default     = ""
}

variable "git_commit" {
  description = "デプロイ元の Git コミットハッシュ"
  type        = string
  default     = ""
}
