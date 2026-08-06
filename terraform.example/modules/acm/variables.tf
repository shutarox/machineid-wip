variable "certificates" {
  description = "Map of ACM certificates to create"
  type = map(object({
    domain_name               = string
    subject_alternative_names = optional(list(string))
    provider                  = optional(string, null)
    tags                     = optional(map(string), {})
  }))
  default = {}
}

variable "route53_zone_id" {
  description = "Route53 zone ID for DNS validation"
  type        = string
}

variable "name_prefix" {
  description = "Name prefix for the certificate"
  type        = string
}

variable "tags" {
  description = "Tags to apply to all certificates"
  type        = map(string)
  default     = {}
} 