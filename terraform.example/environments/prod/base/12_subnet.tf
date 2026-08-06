# パブリックサブネット
resource "aws_subnet" "public_1a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.cidr_block, 4, 0) # 10.x.0.0/20
  availability_zone = "${var.aws_region}a"
  tags = {
    Name = "subnet-public-${var.aws_region}a"
  }
}

resource "aws_subnet" "public_1c" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.cidr_block, 4, 1) # 10.x.16.0/20
  availability_zone = "${var.aws_region}c"
  tags = {
    Name = "subnet-public-${var.aws_region}c"
  }
}

# プライベートサブネット
resource "aws_subnet" "private_1a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.cidr_block, 4, 8) # 10.x.128.0/20
  availability_zone = "${var.aws_region}a"  
  tags = {
    Name = "subnet-private-${var.aws_region}a"
  }
}


resource "aws_subnet" "private_1c" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.cidr_block, 4, 9) # 10.x.144.0/20
  availability_zone = "${var.aws_region}c"  
  tags = {
    Name = "subnet-private-${var.aws_region}c"
  }
}
