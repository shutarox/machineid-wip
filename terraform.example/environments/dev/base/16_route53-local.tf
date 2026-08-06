resource "aws_route53_zone" "internal" {
  name = var.local_domain_name
  
  vpc {
    vpc_id = aws_vpc.main.id
  }
  tags = {
    Name = "local-hosted-zone"
  }
}
