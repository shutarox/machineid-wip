output "certificate_arns" {
  description = "ARNs of all ACM certificates"
  value = merge(
    {
      for k, v in aws_acm_certificate.certificates : k => v.arn
    },
    {
      for k, v in aws_acm_certificate.certificates_us_east_1 : k => v.arn
    }
  )
}

output "certificate_domain_validation_options" {
  description = "Domain validation options for all certificates"
  value = merge(
    {
      for k, v in aws_acm_certificate.certificates : k => v.domain_validation_options
    },
    {
      for k, v in aws_acm_certificate.certificates_us_east_1 : k => v.domain_validation_options
    }
  )
}

output "certificates" {
  description = "All ACM certificate resources"
  value = merge(aws_acm_certificate.certificates, aws_acm_certificate.certificates_us_east_1)
} 