data "aws_vpc" "main" {
  tags = {
    Project      = var.project_name
    Environment = var.base_environment
    Name       = "vpc"
  }
}
