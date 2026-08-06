# Route53 Hosted Zone
resource "aws_route53_zone" "main" {
  name = "myappdomain.com"
  
  tags = {
    Name = "hosted-zone"
  }
}

# NSレコードとSOAレコードはAWSが自動管理するため、Terraformでは管理しない
# ACM 証明書のDNS認証レコードは ACM 証明書のモジュールで管理する

# MX レコード ( gmail )

resource "aws_route53_record" "mx" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "myappdomain.com"
  type    = "MX"
  ttl     = 300
  records = [
    "1 ASPMX.L.GOOGLE.COM",
    "5 ALT1.ASPMX.L.GOOGLE.COM",
    "5 ALT2.ASPMX.L.GOOGLE.COM",
    "10 ALT3.ASPMX.L.GOOGLE.COM",
    "10 ALT4.ASPMX.L.GOOGLE.COM",
  ]
}

# APEX A/AAAA （ cloudfront の www リダイレクト設定向け）

resource "aws_route53_record" "a" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "myappdomain.com"
  type    = "A"
  alias {
    name                   = aws_cloudfront_distribution.apex.domain_name
    zone_id                = aws_cloudfront_distribution.apex.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "aaaa" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "myappdomain.com"
  type    = "AAAA"
  alias {
    name                   = aws_cloudfront_distribution.apex.domain_name
    zone_id                = aws_cloudfront_distribution.apex.hosted_zone_id
    evaluate_target_health = false
  }
}

# Google Workspace の認証用レコード

resource "aws_route53_record" "txt_google_workspace_dkim" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "google._domainkey.myappdomain.com"
  type    = "TXT"
  ttl     = 300
  records = [
    join("\"\"", [
      "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqx9bEqY",
      "hmlUS6bUHrDAy68b7kzDdjCFUi06vj5kdBnLSm/RX00tIRROg1s6Kgpl4LBxQuHHt8bVl",
      "dewdjJlnuIZojUd9rakOjN+Q3JiVWbYiH+/54FvEGo0nZDRqgX8CrJ3Mw2n7Bgg8z9iul",
      "meG1Syb/stSYRp92MgDuWJYXhlYKZaBWLrq1mU6B9ul+58zQg1vGqRPJ3ZdApOU+g6/pT",
      "hOFJV03GwOMZ8w0njHGx1d/nbRPYE9n3th5Y+rmvaiDA+PE8RRc02nv2VNzCmBbKrHPAd",
      "6XNdg1vc0PTb7DAEK9H/pnoEmns7uIYoHa3vajXgxYQGt2hEeUyoO/Nz8KQIDAQAB"
    ]),
  ]
}

resource "aws_route53_record" "txt_spf" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "myappdomain.com"
  type    = "TXT"
  ttl     = 300
  records = [
    "v=spf1 include:_spf.google.com include:amazonses.com ~all"
  ]
}
