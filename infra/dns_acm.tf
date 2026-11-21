# Certificados TLS (ACM) com validação por DNS, e os registros na Cloudflare.
#
# O domínio é registrado na Cloudflare, que exige os nameservers dela — por isso o DNS
# autoritativo fica lá, e não no Route 53. O ACM valida por qualquer servidor DNS, então
# a arquitetura na AWS não muda: CloudFront com certificado próprio na frente, ALB com
# certificado próprio como origem, TLS em todo o caminho.
#
# Os registros ficam em modo DNS only (proxied = false) de propósito. Com o proxy da
# Cloudflare ligado, o CloudFront veria o IP dela em vez do IP do visitante, e as duas
# regras de WAF que dependem disso — bloqueio geográfico e limite por IP (cdn_waf.tf) —
# deixariam de funcionar: a primeira bloquearia todo mundo, a segunda contaria todos os
# visitantes como um só.

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

# ---------------------------------------------------------------- validação dos certificados
# O ACM pede um CNAME por certificado. A Cloudflare não aceita o ponto final do FQDN
# que o ACM devolve, daí o trimsuffix.
resource "cloudflare_dns_record" "cert_validation" {
  for_each = local.cert_validations
  zone_id  = var.cloudflare_zone_id
  name     = trimsuffix(each.value.resource_record_name, ".")
  type     = each.value.resource_record_type
  content  = trimsuffix(each.value.resource_record_value, ".")
  ttl      = 60
  proxied  = false
  comment  = "Validacao do certificado ACM - gerenciado pelo Terraform"
}

resource "aws_acm_certificate_validation" "cdn" {
  provider        = aws.us_east_1
  certificate_arn = aws_acm_certificate.cdn.arn
  validation_record_fqdns = [
    for k, r in cloudflare_dns_record.cert_validation : r.name if startswith(k, "cdn-")
  ]
}

resource "aws_acm_certificate_validation" "origin" {
  certificate_arn = aws_acm_certificate.origin.arn
  validation_record_fqdns = [
    for k, r in cloudflare_dns_record.cert_validation : r.name if startswith(k, "origin-")
  ]
}

# ---------------------------------------------------------------- registros públicos
# Endereço do gerenciador: aponta para a CloudFront.
resource "cloudflare_dns_record" "app" {
  zone_id = var.cloudflare_zone_id
  name    = var.domain_name
  type    = "CNAME"
  content = aws_cloudfront_distribution.main.domain_name
  ttl     = 300
  proxied = false # ver a nota no início do arquivo
  comment = "Cofre - CloudFront"
}

# Nome da origem: a CloudFront valida o certificado do ALB por ele.
resource "cloudflare_dns_record" "origin" {
  zone_id = var.cloudflare_zone_id
  name    = local.origin_domain
  type    = "CNAME"
  content = aws_lb.app.dns_name
  ttl     = 300
  proxied = false
  comment = "Cofre - origem (ALB), acessada so pela CloudFront"
}
