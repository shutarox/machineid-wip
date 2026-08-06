resource "aws_lb" "ssh_nlb" {
  name               = "ssh-nlb"
  internal           = false
  load_balancer_type = "network"
  subnets            = [data.aws_subnet.public_1a.id, data.aws_subnet.public_1c.id]
}

resource "aws_lb_target_group" "ssh_nlb" {
  name        = "ssh-nlb-tg"
  port        = 22
  protocol    = "TCP"
  vpc_id      = data.aws_vpc.main.id
  target_type = "ip"

  health_check {
    enabled             = true
    interval            = 10
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
    protocol            = "TCP"
    port                = 22
  }

  tags = {
    Name = "lb-tg-ssh-nlb"
  }
}

resource "aws_lb_listener" "ssh_nlb" {
  load_balancer_arn = aws_lb.ssh_nlb.arn
  port              = 1022
  protocol          = "TCP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.ssh_nlb.arn
  }

  tags = {
    Name = "lb-listener-ssh-nlb"
  }
}