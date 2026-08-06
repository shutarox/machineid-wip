# Route53 Record Sets

resource "aws_route53_record" "web_and_api" {
  zone_id = data.aws_route53_zone.main.id
  name    = var.url_host_name
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "ssh" {
  zone_id = data.aws_route53_zone.main.id
  name    = var.ssh_host_name_multi
  type    = "A"

  alias {
    name                   = aws_lb.ssh_nlb.dns_name
    zone_id                = aws_lb.ssh_nlb.zone_id
    evaluate_target_health = true
  }
}

# NSレコードとSOAレコードはAWSが自動管理するため、Terraformでは管理しない
# ACM 証明書のDNS認証レコードは ACM 証明書のモジュールで管理する