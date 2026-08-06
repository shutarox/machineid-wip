# VPC / サブネット / ルーティング
#
# **NAT Gateway は置かない。** ECS タスクは public サブネットに配置し、
# インバウンドはセキュリティグループで ALB からのみに絞る(ADR 20260806-aws-minimal-prod.md)。
#
# private サブネットは RDS 専用で、インターネットへの経路を持たない。
# 将来 private + NAT へ移すときのために **2 AZ 分を最初から用意し、
# ルートテーブルも public と分けておく**(移行は NAT へのルートを 1 行足すだけになる)。

resource "aws_vpc" "main" {
  cidr_block           = var.cidr_block
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "vpc"
  }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "igw"
  }
}

#================================================= サブネット

resource "aws_subnet" "public_1a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.cidr_block, 4, 0) # 10.20.0.0/20
  availability_zone = "${var.aws_region}a"

  tags = {
    Name = "subnet-public-${var.aws_region}a"
  }
}

resource "aws_subnet" "public_1c" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.cidr_block, 4, 1) # 10.20.16.0/20
  availability_zone = "${var.aws_region}c"

  tags = {
    Name = "subnet-public-${var.aws_region}c"
  }
}

resource "aws_subnet" "private_1a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.cidr_block, 4, 8) # 10.20.128.0/20
  availability_zone = "${var.aws_region}a"

  tags = {
    Name = "subnet-private-${var.aws_region}a"
  }
}

resource "aws_subnet" "private_1c" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.cidr_block, 4, 9) # 10.20.144.0/20
  availability_zone = "${var.aws_region}c"

  tags = {
    Name = "subnet-private-${var.aws_region}c"
  }
}

#================================================= ルートテーブル

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "rtb-public"
  }
}

# private は VPC 内部の経路のみ。**NAT へのルートを持たない**。
# private + NAT 構成へ移すときは、ここに 0.0.0.0/0 → NAT のルートを足す
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "rtb-private"
  }
}

resource "aws_route_table_association" "public_1a" {
  subnet_id      = aws_subnet.public_1a.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "public_1c" {
  subnet_id      = aws_subnet.public_1c.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private_1a" {
  subnet_id      = aws_subnet.private_1a.id
  route_table_id = aws_route_table.private.id
}

resource "aws_route_table_association" "private_1c" {
  subnet_id      = aws_subnet.private_1c.id
  route_table_id = aws_route_table.private.id
}

#================================================= VPC エンドポイント

# Gateway 型は**無料**なので、NAT なし構成でも入れる意味がある
# (S3 へのトラフィックをインターネット経路から外せる)。
# Interface 型(ecr.api / logs / ssm ...)は 1 つ約 $10/月 × AZ 数かかるため入れない
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"

  route_table_ids = [
    aws_route_table.public.id,
    aws_route_table.private.id,
  ]

  tags = {
    Name = "vpce-s3"
  }
}

#================================================= 内部 DNS

# RDS のエンドポイントをこのゾーンの CNAME で参照する。
# アプリの DB_HOST を変えずにインスタンスを差し替えられるようにするため、
# タスク定義に RDS のエンドポイントを直接書かない(ADR の「エージェント向けの注意」)
resource "aws_route53_zone" "internal" {
  name = var.local_domain_name

  vpc {
    vpc_id = aws_vpc.main.id
  }

  tags = {
    Name = "local-hosted-zone"
  }
}

resource "aws_route53_record" "db_pg" {
  zone_id = aws_route53_zone.internal.zone_id
  name    = "db-pg.${var.local_domain_name}"
  type    = "CNAME"
  ttl     = 60
  records = [aws_db_instance.main.address]
}
