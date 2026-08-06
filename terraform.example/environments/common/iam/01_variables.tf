variable "AWS_ENV" {
  description = "AWS Environment for myappdomain-common IAM User"
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
  description = "Environment Name"
  type        = string
  default     = "common-iam"
}
