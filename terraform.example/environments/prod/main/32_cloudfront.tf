# S3バケット（SPA用）
resource "aws_cloudfront_distribution" "spa" {
  enabled             = true
  comment             = ""
  is_ipv6_enabled     = true
  price_class         = "PriceClass_200"
  default_root_object = "index.html"

  aliases = [var.url_host_name_spa]

  // lifecycle で無視しないと毎回差分が出てしまうので、初回や変更する場合は lifecycle をコメントアウトして実行してください
  origin {
    domain_name = "${aws_s3_bucket.spa.bucket_regional_domain_name}"
    origin_id   = "${aws_s3_bucket.spa.bucket_regional_domain_name}"
    origin_access_control_id = aws_cloudfront_origin_access_control.spa.id

    s3_origin_config {
      origin_access_identity = ""
    }
  }
  lifecycle {
    ignore_changes = [
      origin
    ]
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "${aws_s3_bucket.spa.bucket_regional_domain_name}"

    viewer_protocol_policy = "allow-all"
    compress              = true

    // 658327ea-f89d-4fab-a63d-7e88639e58f6 = preset値: CachingOptimized
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"

    # 必要に応じて追加
    # lambda_function_association {}
    # function_association {}
  }

  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn            = module.acm.certificates[var.url_host_name_spa].arn
    ssl_support_method             = "sni-only"
    minimum_protocol_version       = "TLSv1.2_2021"
    cloudfront_default_certificate = false
  }

  tags = {
    Name = "spa-cloudfront"
  }
}

resource "aws_cloudfront_origin_access_control" "spa" {
  name = "${var.environment}-cloudfront-origin-access-control-spa"
  origin_access_control_origin_type = "s3"
  signing_behavior = "always"
  signing_protocol = "sigv4"
}