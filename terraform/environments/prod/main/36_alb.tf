# API 用の ALB
#
# SPA は CloudFront + S3 なので、ALB が受けるのは API(api.<domain>)だけ。
# 雛形は util 用に 8443 / 8800 のリスナーも持っていたが、util を置かないので 80 / 443 のみ。

resource "aws_lb" "main" {
  name               = "${local.name_prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [data.aws_security_group.is_alb.id]

  subnets = [
    data.aws_subnet.public_1a.id,
    data.aws_subnet.public_1c.id,
  ]

  tags = {
    Name = "alb"
  }
}

resource "aws_lb_target_group" "api" {
  name        = "${local.name_prefix}-tg-api"
  port        = 8080
  protocol    = "HTTP"
  vpc_id      = data.aws_vpc.main.id
  target_type = "ip" # Fargate(awsvpc)なので ip

  health_check {
    enabled             = true
    path                = "/api/health"
    port                = "8080"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  # デプロイ時に旧タスクが接続を捌き切る猶予
  deregistration_delay = 30

  tags = {
    Name = "lb-tg-api"
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.api.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  tags = {
    Name = "lb-listener-https"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }

  tags = {
    Name = "lb-listener-http"
  }
}
