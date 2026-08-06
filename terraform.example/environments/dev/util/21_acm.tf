# ACM証明書モジュール
module "acm" {
  source = "../../../modules/acm"
  
  certificates = {
    "${var.url_host_name}" = {
      domain_name = var.url_host_name
      tags = {
        Purpose = "alb"
      }
    }
  }
  
  route53_zone_id = data.aws_route53_zone.main.zone_id
  name_prefix     = var.environment
  
  providers = {
    aws.us_east_1 = aws.us_east_1
  }
}
