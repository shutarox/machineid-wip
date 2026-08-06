resource "aws_security_group" "is_alb" {
  name        = "is-alb"
  description = "is-alb"
  vpc_id      = aws_vpc.main.id

  # HTTP 入力は全許可
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # HTTPS 入力は全許可
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # HTTPS 入力は全許可 (API)
  ingress {
    from_port   = 8443
    to_port     = 8443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # 外向き全許可
  egress {
    from_port   = 0
    to_port     = 65535
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "sg-is-alb"
  }
}

resource "aws_security_group" "is_app" {
  name        = "is-app"
  description = "is-app"
  vpc_id      = aws_vpc.main.id

  # ALB から API サーバへの通信許可
  ingress {
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.is_alb.id]
  }
  
  # 外向き全許可
  egress {
    from_port   = 0
    to_port     = 65535
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "sg-is-app"
  }
}

resource "aws_security_group" "is_rds" {
  name        = "is-rds"
  description = "is-rds"
  vpc_id      = aws_vpc.main.id

  # app から RDS (PostgreSQL) への通信許可
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.is_app.id]
  }

  tags = {
    Name = "sg-is-rds"
  }
} 

resource "aws_security_group" "allow_inbound_from_alb_8800" {
  name        = "allow-inbound-from-alb-8800"
  description = "allow-inbound-from-alb-8800"
  vpc_id      = aws_vpc.main.id

  # ALB から vite の開発環境への通信許可
  ingress {
    from_port       = 8800
    to_port         = 8800
    protocol        = "tcp"
    security_groups = [aws_security_group.is_alb.id]
  }

  tags = {
    Name = "sg-allow-inbound-from-alb-8800"
  }
}

# util サーバへのSSH接続許可
resource "aws_security_group" "allow_inbound_ssh" {
  name        = "allow-inbound-ssh"
  description = "allow-inbound-ssh"
  vpc_id      = aws_vpc.main.id

  # myapp-dev へのSSH接続許可
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "sg-allow-inbound-ssh"
  }
}
