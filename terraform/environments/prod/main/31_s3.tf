# S3 バケット 2 本
#
#  - spa     : SPA のビルド成果物。CloudFront の OAC 経由でのみ読まれる(公開しない)
#  - uploads : アップロード画像。アプリが presigned URL を発行してブラウザへ配信する
#
# **uploads の名前にアカウント ID を含めないこと。** presigned URL はブラウザに露出し、
# バケット名も URL に現れる(docs/known-issues.md「presigned URL から AWS アカウント ID が露出する」)。

#================================================= SPA

resource "aws_s3_bucket" "spa" {
  bucket = var.s3_bucket_name_spa

  tags = {
    Name = "s3-spa"
  }
}

resource "aws_s3_bucket_versioning" "spa" {
  bucket = aws_s3_bucket.spa.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "spa" {
  bucket = aws_s3_bucket.spa.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "spa" {
  bucket = aws_s3_bucket.spa.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

data "aws_iam_policy_document" "spa" {
  statement {
    sid       = "AllowCloudFrontServicePrincipal"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.spa.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    # ディストリビューションを 1 つに限定する(雛形は distribution/* だった)
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.spa.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "spa" {
  bucket = aws_s3_bucket.spa.id
  policy = data.aws_iam_policy_document.spa.json
}

#================================================= アップロード画像

resource "aws_s3_bucket" "uploads" {
  bucket = var.s3_bucket_name_uploads

  tags = {
    Name = "s3-uploads"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# **公開しない。** 配信はアプリが発行する presigned URL 経由
resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# 仮アップロードの回収漏れに対する保険。
# 本体の回収は cleanup_uploads ジョブ(3 日タイムアウト)が行うので、
# ここはそれより十分長い期間にする
resource "aws_s3_bucket_lifecycle_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    id     = "abort-incomplete-multipart-upload"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}
