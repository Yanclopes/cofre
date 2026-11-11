# =====================================================================
# Amazon Cognito: login com MFA obrigatório.
# A "senha" que chega aqui é o authPassword derivado da senha mestra no navegador
# (Argon2id + HKDF), nunca a senha mestra. Por isso o Cognito não consegue abrir o cofre.
# =====================================================================

resource "aws_cognito_user_pool" "main" {
  name                     = "${local.name}-usuarios"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  deletion_protection      = "ACTIVE"

  # MFA obrigatório por aplicativo autenticador (TOTP).
  mfa_configuration = "ON"
  software_token_mfa_configuration {
    enabled = true
  }

  password_policy {
    minimum_length                   = 32
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 1
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Cofre: seu código de verificação"
    email_message        = "Seu código de verificação do Cofre é {####}"
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "${local.name}-web"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret = false # app de navegador (SPA)
  # Somente SRP: a senha derivada nem trafega; o Cognito recebe uma prova matemática.
  explicit_auth_flows = ["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]

  prevent_user_existence_errors = "ENABLED" # não revela se um e-mail tem conta
  enable_token_revocation       = true

  access_token_validity  = 15
  id_token_validity      = 15
  refresh_token_validity = 12
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "hours"
  }
}

# ---------------------------------------------------------------- WAF no login (regional)
# As chamadas de login vão direto do navegador ao Cognito, então ele ganha uma Web ACL própria.
resource "aws_wafv2_web_acl" "cognito" {
  name        = "${local.name}-cognito"
  description = "Protecao do login contra forca bruta"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "IpReputation"
    priority = 10
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesAmazonIpReputationList"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "CognitoIpReputation"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "KnownBadInputs"
    priority = 15
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "CognitoKnownBadInputs"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "LimiteDeLoginPorIp"
    priority = 20
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = var.cognito_rate_limit
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "CognitoRateLimit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name}-cognito"
    sampled_requests_enabled   = true
  }
}

resource "aws_wafv2_web_acl_association" "cognito" {
  resource_arn = aws_cognito_user_pool.main.arn
  web_acl_arn  = aws_wafv2_web_acl.cognito.arn
}

resource "aws_cloudwatch_log_group" "waf_cognito" {
  name              = "aws-waf-logs-${local.name}-cognito"
  retention_in_days = 365
  kms_key_id        = aws_kms_key.ops.arn
}

resource "aws_wafv2_web_acl_logging_configuration" "cognito" {
  resource_arn            = aws_wafv2_web_acl.cognito.arn
  log_destination_configs = [aws_cloudwatch_log_group.waf_cognito.arn]
}
