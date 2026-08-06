# サブドメイン NS レコード ( myapp.myappdomain.com )

resource "aws_route53_record" "ns_myapp" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "myapp.myappdomain.com"
  type    = "NS"
  ttl     = 300
  records = [
    "ns-1933.awsdns-49.co.uk.",
    "ns-361.awsdns-45.com.",
    "ns-1021.awsdns-63.net.",
    "ns-1104.awsdns-10.org.",
  ]
}

# サブドメイン NS レコード ( 1616.myappdomain.com )

resource "aws_route53_record" "ns_1616" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "1616.myappdomain.com"
  type    = "NS"
  ttl     = 300
  records = [
    "ns-1035.awsdns-01.org.",
    "ns-580.awsdns-08.net.",
    "ns-1569.awsdns-04.co.uk.",
    "ns-509.awsdns-63.com.",
  ]
}
