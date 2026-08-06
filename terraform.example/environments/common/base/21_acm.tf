# ACM証明書モジュール
module "acm" {
  source = "../../../modules/acm"
  
  certificates = {
    "${var.domain_name}" = {
      domain_name = var.domain_name
      provider = "us_east_1"
      tags = {
        Name = "acm-cloudfront"
        Purpose = "cloudfront"
      }
    }
  }
  
  route53_zone_id = aws_route53_zone.main.zone_id
  name_prefix     = var.environment
  
  providers = {
    aws.us_east_1 = aws.us_east_1
  }
}
