# current region (ex. ap-northeast-1)
data "aws_region" "current" {}
# current account id (ex. 748051427477)
data "aws_caller_identity" "current" {}
