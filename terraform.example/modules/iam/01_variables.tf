variable "project_name" {
  description = "Project Name"
  type        = string
}
variable "aws_region" {
  description = "AWS region"
  type        = string
}
variable "environment" {
  description = "Environment Name"
  type        = string
}

variable "force_destroy" {
  description = "Whether to force destroy IAM users"
  type        = bool
}
variable "create_local_developer" {
  description = "Whether to create local developer"
  type        = bool
}
