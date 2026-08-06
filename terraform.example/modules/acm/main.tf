# ACM証明書（任意数）
resource "aws_acm_certificate" "certificates" {
  for_each = {
    for k, v in var.certificates : k => v
    if v.provider != "us_east_1"
  }
  
  domain_name               = each.value.domain_name
  validation_method         = "DNS"
  subject_alternative_names = try(each.value.subject_alternative_names, [])
  
  lifecycle {
    create_before_destroy = true
  }
  
  tags = merge(var.tags, each.value.tags, {
    Name = "${var.name_prefix}-certificate-${each.key}"
  })
}

# ACM証明書（us-east-1用）
resource "aws_acm_certificate" "certificates_us_east_1" {
  for_each = {
    for k, v in var.certificates : k => v
    if v.provider == "us_east_1"
  }
  
  provider = aws.us_east_1
  
  domain_name               = each.value.domain_name
  validation_method         = "DNS"
  subject_alternative_names = try(each.value.subject_alternative_names, [])
  
  lifecycle {
    create_before_destroy = true
  }
  
  tags = merge(var.tags, each.value.tags, {
    Name = "${var.name_prefix}-certificate-${each.key}"
  })
}

# ACM証明書のDNS認証レコード
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for cert_key, cert in var.certificates : cert_key => cert
    if cert.provider != "us_east_1"
  }
  
  allow_overwrite = true
  name            = [for dvo in aws_acm_certificate.certificates[each.key].domain_validation_options : dvo.resource_record_name][0]
  records         = [for dvo in aws_acm_certificate.certificates[each.key].domain_validation_options : dvo.resource_record_value]
  ttl             = 300
  type            = [for dvo in aws_acm_certificate.certificates[each.key].domain_validation_options : dvo.resource_record_type][0]
  zone_id         = var.route53_zone_id
}

# ACM証明書のDNS認証レコード（us-east-1用）
resource "aws_route53_record" "cert_validation_us_east_1" {
  for_each = {
    for cert_key, cert in var.certificates : cert_key => cert
    if cert.provider == "us_east_1"
  }
  
  allow_overwrite = true
  name            = [for dvo in aws_acm_certificate.certificates_us_east_1[each.key].domain_validation_options : dvo.resource_record_name][0]
  records         = [for dvo in aws_acm_certificate.certificates_us_east_1[each.key].domain_validation_options : dvo.resource_record_value]
  ttl             = 300
  type            = [for dvo in aws_acm_certificate.certificates_us_east_1[each.key].domain_validation_options : dvo.resource_record_type][0]
  zone_id         = var.route53_zone_id
}

# ACM証明書の認証完了
resource "aws_acm_certificate_validation" "certificates" {
  for_each = {
    for cert_key, cert in var.certificates : cert_key => cert
    if cert.provider != "us_east_1"
  }
  
  certificate_arn = aws_acm_certificate.certificates[each.key].arn
  validation_record_fqdns = [aws_route53_record.cert_validation[each.key].fqdn]
}

# ACM証明書の認証完了（us-east-1用）
resource "aws_acm_certificate_validation" "certificates_us_east_1" {
  for_each = {
    for cert_key, cert in var.certificates : cert_key => cert
    if cert.provider == "us_east_1"
  }
  
  provider = aws.us_east_1
  
  certificate_arn = aws_acm_certificate.certificates_us_east_1[each.key].arn
  validation_record_fqdns = [aws_route53_record.cert_validation_us_east_1[each.key].fqdn]
} 