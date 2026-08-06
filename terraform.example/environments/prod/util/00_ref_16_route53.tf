data "aws_route53_zone" "main" {
  name = var.domain_name
  tags = {
    Project = var.project_name
    Environment = var.base_environment
    Name = "hosted-zone"
  }
}
