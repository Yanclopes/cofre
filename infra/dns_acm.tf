# Certificados TLS (ACM) com validação por DNS e registros no Route 53.

data "aws_route53_zone" "main" {
  zone_id = var.hosted_zone_id
}

# ---------------------------------------------------------------- certificado da CloudFront (us-east-1)
resource "aws_acm_certificate" "cdn" {
  provider          = aws.us_east_1
  domain_name       = var.domain_name
  validation_method = "DNS"
  lifecycle {
    create_before_destroy = true
  }
}

# ---------------------------------------------------------------- certificado do ALB (origem)
resource "aws_acm_certificate" "origin" {
  domain_name       = local.origin_domain
  validation_method = "DNS"
  lifecycle {
    create_before_destroy = true
  }
}

locals {
  cert_validations = merge(
    { for o in aws_acm_certificate.cdn.domain_validation_options : "cdn-${o.domain_name}" => o },
    { for o in aws_acm_certificate.origin.domain_validation_options : "origin-${o.domain_name}" => o },
  )
}

resource "aws_route53_record" "cert_validation" {
  for_each        = local.cert_validations
  zone_id         = data.aws_route53_zone.main.zone_id
  name            = each.value.resource_record_name
  type            = each.value.resource_record_type
  records         = [each.value.resource_record_value]
  ttl             = 300
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "cdn" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.cdn.arn
  validation_record_fqdns = [for k, r in aws_route53_record.cert_validation : r.fqdn if startswith(k, "cdn-")]
}

resource "aws_acm_certificate_validation" "origin" {
  certificate_arn         = aws_acm_certificate.origin.arn
  validation_record_fqdns = [for k, r in aws_route53_record.cert_validation : r.fqdn if startswith(k, "origin-")]
}

# ---------------------------------------------------------------- registros
resource "aws_route53_record" "app" {
  for_each = toset(["A", "AAAA"])
  zone_id  = data.aws_route53_zone.main.zone_id
  name     = var.domain_name
  type     = each.value
  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = false
  }
}

# Nome da origem: a CloudFront valida o certificado do ALB por ele.
resource "aws_route53_record" "origin" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = local.origin_domain
  type    = "A"
  alias {
    name                   = aws_lb.app.dns_name
    zone_id                = aws_lb.app.zone_id
    evaluate_target_health = true
  }
}
