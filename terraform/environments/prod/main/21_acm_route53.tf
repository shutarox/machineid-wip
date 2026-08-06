# DNS ゾーンと ACM 証明書
#
# **親ゾーン(コーポレートドメイン)は別アカウントにあり、この terraform の管理外。**
# ここで作るサブドメインゾーンの NS レコードを、親ゾーンに手で登録する必要がある
# (apply 後に aws_route53_zone.main.name_servers を出力するので、それを渡す)。
#
# コーポレートサイト向けの設定(MX / SPF / Google Workspace の DKIM / Search Console /
# apex の www リダイレクト)は**一切持ち込まない**。あれは組織のドメイン基盤であって
# アプリのものではない。

resource "aws_route53_zone" "main" {
  name = var.domain_name

  tags = {
    Name = "hosted-zone-${var.domain_name}"
  }
}

#================================================= ACM(ALB 用・ap-northeast-1)

resource "aws_acm_certificate" "api" {
  domain_name       = local.url_host_name_api
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "acm-alb"
  }
}

resource "aws_route53_record" "api_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.api.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id         = aws_route53_zone.main.zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "api" {
  certificate_arn         = aws_acm_certificate.api.arn
  validation_record_fqdns = [for r in aws_route53_record.api_cert_validation : r.fqdn]
}

#================================================= ACM(CloudFront 用・us-east-1)

resource "aws_acm_certificate" "spa" {
  provider = aws.us_east_1

  domain_name       = local.url_host_name_spa
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "acm-cloudfront"
  }
}

# 検証レコードの置き場所は(証明書が us-east-1 でも)このゾーン
resource "aws_route53_record" "spa_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.spa.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id         = aws_route53_zone.main.zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "spa" {
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.spa.arn
  validation_record_fqdns = [for r in aws_route53_record.spa_cert_validation : r.fqdn]
}

#================================================= 公開レコード

resource "aws_route53_record" "spa" {
  zone_id = aws_route53_zone.main.zone_id
  name    = local.url_host_name_spa
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.spa.domain_name
    zone_id                = aws_cloudfront_distribution.spa.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "api" {
  zone_id = aws_route53_zone.main.zone_id
  name    = local.url_host_name_api
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}
