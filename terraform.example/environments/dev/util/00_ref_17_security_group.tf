data "aws_security_group" "is_alb" {
  tags = {
    Project = var.project_name
    Environment = var.base_environment
    Name = "sg-is-alb"
  }
}

