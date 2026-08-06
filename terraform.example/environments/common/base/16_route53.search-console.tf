# Google Search Console の認証用レコード

resource "aws_route53_record" "txt_google_search_console" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "7vod2qiq2b5z.myappdomain.com"
  type    = "CNAME"
  ttl     = 300
  records = [
    "gv-7obtl3bwm2yfea.dv.googlehosted.com",
  ]
}
