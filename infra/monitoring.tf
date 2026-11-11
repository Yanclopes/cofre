# Alertas para ações que um administrador mal-intencionado tentaria fazer.

resource "aws_sns_topic" "alerts" {
  name              = "${local.name}-alertas"
  kms_master_key_id = aws_kms_key.ops.id
}

resource "aws_sns_topic_policy" "alerts" {
  arn = aws_sns_topic.alerts.arn
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "ServicosPublicam"
        Effect    = "Allow"
        Principal = { Service = ["cloudwatch.amazonaws.com", "cloudtrail.amazonaws.com", "codestar-notifications.amazonaws.com"] }
        Action    = "sns:Publish"
        Resource  = aws_sns_topic.alerts.arn
        Condition = { StringEquals = { "aws:SourceAccount" = local.account_id } }
      },
      {
        Sid       = "PipelinePublica"
        Effect    = "Allow"
        Principal = { AWS = aws_iam_role.codepipeline.arn }
        Action    = "sns:Publish"
        Resource  = aws_sns_topic.alerts.arn
      },
    ]
  })
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

locals {
  # Filtros sobre o CloudTrail (padrões do CIS AWS Foundations, adaptados ao projeto).
  security_alarms = {
    "politica-kms-alterada" = {
      description = "Alguém alterou a política, desabilitou ou agendou a exclusão de uma chave KMS"
      pattern     = "{ ($.eventSource = kms.amazonaws.com) && (($.eventName = PutKeyPolicy) || ($.eventName = DisableKey) || ($.eventName = ScheduleKeyDeletion)) }"
    }
    "trilha-alterada" = {
      description = "Alguém tentou parar, apagar ou alterar o CloudTrail"
      pattern     = "{ ($.eventName = StopLogging) || ($.eventName = DeleteTrail) || ($.eventName = UpdateTrail) }"
    }
    "segredo-do-banco-lido-por-humano" = {
      description = "O segredo do banco foi lido por alguém que não é a aplicação"
      pattern     = "{ ($.eventSource = secretsmanager.amazonaws.com) && ($.eventName = GetSecretValue) && ($.userIdentity.sessionContext.sessionIssuer.userName != \"${local.name}-app-ec2\") }"
    }
    "uso-do-root" = {
      description = "Uso da conta root"
      pattern     = "{ $.userIdentity.type = \"Root\" && $.userIdentity.invokedBy NOT EXISTS && $.eventType != \"AwsServiceEvent\" }"
    }
    "login-console-sem-mfa" = {
      description = "Login no console sem MFA"
      pattern     = "{ ($.eventName = ConsoleLogin) && ($.additionalEventData.MFAUsed != \"Yes\") && ($.responseElements.ConsoleLogin = \"Success\") }"
    }
    "security-group-alterado" = {
      description = "Security group ou NACL alterado fora da pipeline"
      pattern     = "{ (($.eventName = AuthorizeSecurityGroupIngress) || ($.eventName = CreateNetworkAclEntry) || ($.eventName = ReplaceNetworkAclEntry)) && ($.userIdentity.sessionContext.sessionIssuer.userName != \"${local.name}-tf-apply\") }"
    }
  }
}

resource "aws_cloudwatch_log_metric_filter" "security" {
  for_each       = local.security_alarms
  name           = each.key
  log_group_name = aws_cloudwatch_log_group.cloudtrail.name
  pattern        = each.value.pattern
  metric_transformation {
    name      = each.key
    namespace = "${local.name}/seguranca"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "security" {
  for_each            = local.security_alarms
  alarm_name          = "${local.name}-${each.key}"
  alarm_description   = each.value.description
  namespace           = "${local.name}/seguranca"
  metric_name         = each.key
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  depends_on          = [aws_cloudwatch_log_metric_filter.security]
}

# Muitas respostas 5xx ou bloqueios do WAF também viram alerta.
resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "${local.name}-alb-5xx"
  alarm_description   = "Erros 5xx na aplicação"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Target_5XX_Count"
  dimensions          = { LoadBalancer = aws_lb.app.arn_suffix }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 20
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}
