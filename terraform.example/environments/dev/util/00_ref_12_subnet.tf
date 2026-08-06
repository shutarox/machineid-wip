# パブリックサブネット
data "aws_subnet" "public_1a" {
  tags = {
    Project      = var.project_name
    Environment = var.base_environment
    Name = "subnet-public-${var.aws_region}a"
  }
}

data "aws_subnet" "public_1c" {
  tags = {
    Project      = var.project_name
    Environment = var.base_environment
    Name = "subnet-public-${var.aws_region}c"
  }
}
