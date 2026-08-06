# studio.design でホスティング

resource "aws_route53_record" "a_www" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "www.myappdomain.com"
  type    = "A"
  ttl     = 300
  records = [
    "34.111.141.225",
  ]
}
