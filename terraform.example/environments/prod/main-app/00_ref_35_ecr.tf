data "aws_ecr_repository" "main" {
  name = "myapp-app-${var.environment}"
}
