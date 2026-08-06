data "aws_security_group" "is_app" {
  tags = {
    Project     = var.project_name
    Environment = var.base_environment
    Name        = "sg-is-app"
  }
}

data "aws_security_group" "allow_inbound_ssh" {
  tags = {
    Project     = var.project_name
    Environment = var.base_environment
    Name        = "sg-allow-inbound-ssh"
  }
}

data "aws_security_group" "allow_inbound_from_alb_8800" {
  tags = {
    Project     = var.project_name
    Environment = var.base_environment
    Name        = "sg-allow-inbound-from-alb-8800"
  }
}
