output "name_servers" {
  description = "**親ゾーン(コーポレートドメイン)に NS 委任レコードとして手で登録する値**"
  value       = aws_route53_zone.main.name_servers
}

output "url_host_name_spa" {
  value = local.url_host_name_spa
}

output "url_host_name_api" {
  value = local.url_host_name_api
}

output "cloudfront_distribution_id" {
  description = "deploy スクリプトの invalidation に使う"
  value       = aws_cloudfront_distribution.spa.id
}

output "s3_bucket_name_spa" {
  value = aws_s3_bucket.spa.id
}

output "ecr_repository_url" {
  value = aws_ecr_repository.main.repository_url
}

output "lb_target_group_arn_api" {
  value = aws_lb_target_group.api.arn
}
