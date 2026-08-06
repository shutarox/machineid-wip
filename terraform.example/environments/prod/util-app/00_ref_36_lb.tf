data "aws_lb_target_group" "api" {
  name = "${var.environment}-lb-tg-api"
}

data "aws_lb_target_group" "spa" {
  name = "${var.environment}-lb-tg-spa"
}

data "aws_lb_target_group" "ssh_nlb" {
  name = "ssh-nlb-tg"
}
