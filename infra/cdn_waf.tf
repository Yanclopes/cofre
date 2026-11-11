# =====================================================================
# Borda: CloudFront + AWS WAF (Web ACL em us-east-1, escopo CLOUDFRONT)
# =====================================================================

locals {
  # Políticas gerenciadas da CloudFront (IDs fixos publicados pela AWS).
  cache_policy_disabled       = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled
  origin_request_all_but_host = "b689b0a8-53d0-40ab-baf2-68738e2966ac" # Managed-AllViewerExceptHostHeader
  response_headers_security   = "67f7725c-6f97-4210-82d7-5512b31e9d03" # Managed-SecurityHeadersPolicy
  waf_managed_rule_groups = [
    { name = "AWSManagedRulesAmazonIpReputationList", priority = 10 },
    { name = "AWSManagedRulesCommonRuleSet", priority = 20 },
    { name = "AWSManagedRulesKnownBadInputsRuleSet", priority = 30 },
    { name = "AWSManagedRulesSQLiRuleSet", priority = 40 },
  ]
}

resource "aws_wafv2_web_acl" "cdn" {
  provider    = aws.us_east_1
  name        = "${local.name}-cdn"
  description = "Protecao da aplicacao na borda"
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  # Regras gerenciadas pela AWS: reputação de IP, OWASP Top 10, entradas maliciosas, SQL injection.
  dynamic "rule" {
    for_each = local.waf_managed_rule_groups
    content {
      name     = rule.value.name
      priority = rule.value.priority
      override_action {
        none {}
      }
      statement {
        managed_rule_group_statement {
          vendor_name = "AWS"
          name        = rule.value.name

          # Itens cifrados podem passar de 8 KB; o limite de corpo da regra comum vira só contagem.
          dynamic "rule_action_override" {
            for_each = rule.value.name == "AWSManagedRulesCommonRuleSet" ? ["SizeRestrictions_BODY"] : []
            content {
              name = rule_action_override.value
              action_to_use {
                count {}
              }
            }
          }
        }
      }
      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = rule.value.name
        sampled_requests_enabled   = true
      }
    }
  }

  # Limite de taxa por IP (contra força bruta e abuso da API).
  rule {
    name     = "LimitePorIp"
    priority = 50
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = var.waf_rate_limit
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "LimitePorIp"
      sampled_requests_enabled   = true
    }
  }

  # Bloqueio geográfico: só os países permitidos.
  dynamic "rule" {
    for_each = length(var.allowed_country_codes) > 0 ? [1] : []
    content {
      name     = "SomentePaisesPermitidos"
      priority = 5
      action {
        block {}
      }
      statement {
        not_statement {
          statement {
            geo_match_statement {
              country_codes = var.allowed_country_codes
            }
          }
        }
      }
      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "Geo"
        sampled_requests_enabled   = true
      }
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name}-cdn"
    sampled_requests_enabled   = true
  }
}

# O nome do log group precisa começar com "aws-waf-logs-".
resource "aws_cloudwatch_log_group" "waf_cdn" {
  #checkov:skip=CKV_AWS_158:Log group fica em us-east-1 (exigência do WAF da CloudFront); a chave KMS do projeto é regional
  provider          = aws.us_east_1
  name              = "aws-waf-logs-${local.name}-cdn"
  retention_in_days = 365
}

resource "aws_wafv2_web_acl_logging_configuration" "cdn" {
  provider                = aws.us_east_1
  resource_arn            = aws_wafv2_web_acl.cdn.arn
  log_destination_configs = [aws_cloudwatch_log_group.waf_cdn.arn]

  # Não grava o cabeçalho com o token de acesso nos logs.
  redacted_fields {
    single_header {
      name = "authorization"
    }
  }
}

# ---------------------------------------------------------------- CloudFront
resource "aws_cloudfront_distribution" "main" {
  #checkov:skip=CKV_AWS_86:Logs de acesso ficam no WAF (todas as requisições) e no ALB
  #checkov:skip=CKV_AWS_310:Origem única (ALB multi-AZ); não há segunda origem para failover
  #checkov:skip=CKV_AWS_374:Restrição geográfica é feita pela regra do WAF (allowed_country_codes)
  #checkov:skip=CKV2_AWS_32:Usa a política gerenciada SecurityHeadersPolicy (ID fixo)
  #checkov:skip=CKV2_AWS_42:Certificado ACM próprio configurado (viewer_certificate)
  #checkov:skip=CKV2_AWS_47:A Web ACL inclui AWSManagedRulesKnownBadInputsRuleSet (regras de Log4j) via bloco dynamic, que o Checkov não resolve
  enabled             = true
  default_root_object = "index.html"
  is_ipv6_enabled     = true
  http_version        = "http2and3"
  comment             = "${local.name} - gerenciador de senhas"
  aliases             = [var.domain_name]
  price_class         = "PriceClass_All" # inclui pontos de presença na América do Sul
  web_acl_id          = aws_wafv2_web_acl.cdn.arn

  origin {
    origin_id   = "alb"
    domain_name = local.origin_domain

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    # Segredo que prova ao ALB que a requisição passou pela CloudFront (e pelo WAF).
    custom_header {
      name  = "X-Origin-Verify"
      value = random_password.origin_verify.result
    }
  }

  default_cache_behavior {
    target_origin_id           = "alb"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = local.cache_policy_disabled
    origin_request_policy_id   = local.origin_request_all_but_host
    response_headers_policy_id = local.response_headers_security
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.cdn.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}
