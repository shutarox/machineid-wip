data "aws_security_group" "is_app" {
  tags = {
    Project     = var.project_name
    Environment = var.base_environment
    Name        = "sg-is-app"
  }
}
