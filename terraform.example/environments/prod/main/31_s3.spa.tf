# S3バケット（SPA用）
resource "aws_s3_bucket" "spa" {
  bucket = var.s3_bucket_name_spa
  
  tags = {
    Name = "s3-bucket-spa"
  }
}

# S3バケットのバージョニング設定
resource "aws_s3_bucket_versioning" "spa" {
  bucket = aws_s3_bucket.spa.id
  
  versioning_configuration {
    status = "Enabled"
  }
}

# S3バケットの暗号化設定
resource "aws_s3_bucket_server_side_encryption_configuration" "spa" {
  bucket = aws_s3_bucket.spa.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    blocked_encryption_types = ["NONE"]
  }
}

# S3バケットのパブリックアクセスブロック設定
resource "aws_s3_bucket_public_access_block" "spa" {
  bucket = aws_s3_bucket.spa.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# S3バケットのポリシー設定
resource "aws_s3_bucket_policy" "spa" {
  bucket = aws_s3_bucket.spa.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontServicePrincipal"
        Effect    = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.spa.arn}/*"
        Condition = {
          StringLike = {
            "AWS:SourceArn" = "arn:aws:cloudfront::${var.aws_account_id}:distribution/*"
          }
        }
      }
    ]
  })
}
