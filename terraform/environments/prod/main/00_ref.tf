# base スタックのリソースをタグ経由で参照する。
# remote state を読まずに data 参照で繋ぐのは雛形からの踏襲(スタック間の結合を弱く保つ)

data "aws_vpc" "main" {
  tags = {
    Name = "vpc"
  }
}

data "aws_subnet" "public_1a" {
  vpc_id = data.aws_vpc.main.id

  tags = {
    Name = "subnet-public-${var.aws_region}a"
  }
}

data "aws_subnet" "public_1c" {
  vpc_id = data.aws_vpc.main.id

  tags = {
    Name = "subnet-public-${var.aws_region}c"
  }
}

data "aws_security_group" "is_alb" {
  vpc_id = data.aws_vpc.main.id

  tags = {
    Name = "sg-is-alb"
  }
}
