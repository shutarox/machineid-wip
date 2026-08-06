# プライベートサブネット
data "aws_subnet" "private_1a" {
  tags = {
    Project     = var.project_name
    Environment = var.base_environment
    Name        = "subnet-private-${var.aws_region}a"
  }
}

data "aws_subnet" "private_1c" {
  tags = {
    Project     = var.project_name
    Environment = var.base_environment
    Name        = "subnet-private-${var.aws_region}c"
  }
}
