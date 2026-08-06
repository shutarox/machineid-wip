# SPA用のApplication Load Balancer

resource "aws_lb" "main" {
  name               = "${var.environment}-lb-main"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [data.aws_security_group.is_alb.id]
  subnets            = [data.aws_subnet.public_1a.id, data.aws_subnet.public_1c.id]

  enable_deletion_protection = false

  tags = {
    Name = "lb-main"
    Environment = var.environment
  }
}

resource "aws_lb_target_group" "api" {
  name        = "${var.environment}-lb-tg-api"
  port        = 8080
  protocol    = "HTTP"
  vpc_id      = data.aws_vpc.main.id
  target_type = "ip"

  # api が落ちててもロールバックさせたくないので、ヘルスチェックは spa のほうで統一
  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 10
    matcher             = "200"
    path                = "/"
    port                = "8800"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 5
  }

  tags = {
    Name = "lb-tg-api"
  }
}

resource "aws_lb_target_group" "spa" {
  name        = "${var.environment}-lb-tg-spa"
  port        = 8800
  protocol    = "HTTP"
  vpc_id      = data.aws_vpc.main.id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 10
    matcher             = "200"
    path                = "/"
    port                = 8800
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 5
  }

  tags = {
    Name = "lb-tg-spa"
  }
}

resource "aws_lb_listener" "https_api" {
  load_balancer_arn = aws_lb.main.arn
  port              = 8443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = module.acm.certificates[var.url_host_name].arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  tags = {
    Name = "lb-listener-https-api"
  }
}

resource "aws_lb_listener" "https_spa" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = module.acm.certificates[var.url_host_name].arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.spa.arn
  }

  tags = {
    Name = "lb-listener-https-spa"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = 443 # spa
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }

  tags = {
    Name = "lb-listener-http"
  }
} 