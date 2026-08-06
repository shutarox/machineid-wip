data "aws_lb_target_group" "api" {
  name = "${var.environment}-lb-tg-api"
}
