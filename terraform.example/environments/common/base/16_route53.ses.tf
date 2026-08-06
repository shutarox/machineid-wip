# SES の認証用レコード

resource "aws_route53_record" "cname_ses_dkim_1" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "e5w5kr7cymiwbhszhs5z6rt2ivyvqzbk._domainkey.myappdomain.com"
  type    = "CNAME"
  ttl     = 300
  records = [
    "e5w5kr7cymiwbhszhs5z6rt2ivyvqzbk.dkim.amazonses.com",
  ]
}

resource "aws_route53_record" "cname_ses_dkim_2" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "jh7scfbj2kbhinys4pbr4bv4jxrqmytr._domainkey.myappdomain.com"
  type    = "CNAME"
  ttl     = 300
  records = [
    "jh7scfbj2kbhinys4pbr4bv4jxrqmytr.dkim.amazonses.com",
  ]
}

resource "aws_route53_record" "cname_ses_dkim_3" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "kh4wjcbvavm5ag7ah4pohprh7xdfr2jz._domainkey.myappdomain.com"
  type    = "CNAME"
  ttl     = 300
  records = [
    "kh4wjcbvavm5ag7ah4pohprh7xdfr2jz.dkim.amazonses.com",
  ]
}

resource "aws_route53_record" "txt_ses_dmarc" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "_dmarc.myappdomain.com"
  type    = "TXT"
  ttl     = 300
  records = [
    "v=DMARC1; p=none;",
  ]
}
