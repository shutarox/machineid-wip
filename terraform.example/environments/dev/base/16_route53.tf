# Route53 Hosted Zone
resource "aws_route53_zone" "main" {
  name = var.domain_name
  
  tags = {
    Name = "hosted-zone"
  }
}

# NSレコードとSOAレコードはAWSが自動管理するため、Terraformでは管理しない
# ACM 証明書のDNS認証レコードは ACM 証明書のモジュールで管理する