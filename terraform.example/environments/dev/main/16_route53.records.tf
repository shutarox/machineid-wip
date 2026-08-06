# Route53 Record Sets

resource "aws_route53_record" "web" {
  zone_id = data.aws_route53_zone.main.id
  name    = var.url_host_name_spa
  type    = "A"
  alias {
    name    = aws_cloudfront_distribution.spa.domain_name
    zone_id = aws_cloudfront_distribution.spa.hosted_zone_id  # AWS管理のZone ID
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "api" {
  zone_id = data.aws_route53_zone.main.id
  name    = var.url_host_name_api
  type    = "A"
  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

# NSレコードとSOAレコードはAWSが自動管理するため、Terraformでは管理しない
# ACM 証明書のDNS認証レコードは ACM 証明書のモジュールで管理する