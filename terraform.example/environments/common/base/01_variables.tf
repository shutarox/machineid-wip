variable "AWS_ENV" {
  description = "AWS Environment"
  type        = string
  default     = ""
}

variable "project_name" {
  description = "Project Name"
  type        = string
  default     = "myappdomain"
}
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-1"
}
variable "environment" {
  description = "Environment name"
  type        = string
  default     = "common-base"
}

variable "domain_name" {
  description = "Domain name"
  type        = string
  default     = "myappdomain.com"
}
