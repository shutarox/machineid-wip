resource "aws_cloudfront_distribution" "apex" {
  enabled         = true
  is_ipv6_enabled = true
  aliases         = ["myappdomain.com"]

  # 形だけのオリジン（関数が返すため通常は未到達）
  origin {
    domain_name = "www.myappdomain.com"
    origin_id   = "www-origin"
    custom_origin_config {
      origin_protocol_policy = "https-only"
      http_port              = 80
      https_port             = 443
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "www-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    min_ttl                = 0

    # forwarded_valuesを追加（必須パラメータ）
    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    # ここで Function を関連付け
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.redirect_to_www.arn
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = module.acm.certificates[var.domain_name].arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

resource "aws_cloudfront_function" "redirect_to_www" {
  name    = "redirect-myappdomain-apex-to-www"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<JS
function handler(event) {
  var req = event.request;

  // クエリ文字列を再構成
  var q = req.querystring || {};
  var keys = Object.keys(q);
  var qs = "";
  if (keys.length > 0) {
    var parts = [];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var ent = q[k];
      if (ent.multiValue && ent.multiValue.length > 0) {
        for (var j = 0; j < ent.multiValue.length; j++) {
          parts.push(k + "=" + ent.multiValue[j].value);
        }
      } else if (ent.value !== undefined) {
        parts.push(k + "=" + ent.value);
      }
    }
    qs = "?" + parts.join("&");
  }

  return {
    statusCode: 301,
    statusDescription: "Moved Permanently",
    headers: {
      location: { value: "https://www.myappdomain.com" + req.uri + qs },
      "cache-control": { value: "max-age=3600" }
    }
  };
}
JS
}