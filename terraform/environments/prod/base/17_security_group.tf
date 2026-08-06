# セキュリティグループ
#
# **この構成では SG が唯一の防御線。** ECS タスクは public サブネットにパブリック IP 付きで
# 起動するため、インバウンドの緩みがそのままインターネットからの到達に直結する
# (ADR 20260806-aws-minimal-prod.md「エージェント向けの注意」)。
#
# ルールは**すべて SG 参照で書く。CIDR 直書きにしない。**
# タスクの IP が変わっても書き換え不要にしておくことで、
# 将来 private サブネットへ移す際のコストを下げる。

resource "aws_security_group" "is_alb" {
  name        = "is-alb"
  description = "ALB. Accepts HTTP/HTTPS from the internet."
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "sg-is-alb"
  }
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.is_alb.id
  description       = "HTTP (redirects to HTTPS)"
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  security_group_id = aws_security_group.is_alb.id
  description       = "HTTPS"
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "alb_all" {
  security_group_id = aws_security_group.is_alb.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

#================================================= アプリ(ECS タスク)

resource "aws_security_group" "is_app" {
  name        = "is-app"
  description = "ECS tasks. Inbound only from the ALB."
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "sg-is-app"
  }
}

# **インバウンドはこの 1 本だけ。** デバッグ目的でも 0.0.0.0/0 を足さないこと
resource "aws_vpc_security_group_ingress_rule" "app_from_alb" {
  security_group_id            = aws_security_group.is_app.id
  description                  = "API port from ALB"
  referenced_security_group_id = aws_security_group.is_alb.id
  from_port                    = 8080
  to_port                      = 8080
  ip_protocol                  = "tcp"
}

# アウトバウンドは全許可。NAT が無いため、ECR pull・SSM(ECS Exec)・
# CloudWatch Logs・SES・外部 API はすべてこの経路(IGW 経由)で出る
resource "aws_vpc_security_group_egress_rule" "app_all" {
  security_group_id = aws_security_group.is_app.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

#================================================= RDS

resource "aws_security_group" "is_rds" {
  name        = "is-rds"
  description = "RDS. Inbound only from the application security group."
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "sg-is-rds"
  }
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_app" {
  security_group_id            = aws_security_group.is_rds.id
  description                  = "PostgreSQL from app"
  referenced_security_group_id = aws_security_group.is_app.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}
