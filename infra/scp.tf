# =====================================================================
# SCP (AWS Organizations) — opcional, só na conta de gerenciamento.
# Mesmo um administrador da conta da aplicação (inclusive o root dela) fica impedido de
# apagar rastros ou sequestrar as chaves. Só o papel da pipeline pode alterar as chaves.
# =====================================================================

resource "aws_organizations_policy" "protect" {
  count       = var.enable_scp ? 1 : 0
  name        = "${local.name}-protecao-seguranca"
  description = "Impede desligar auditoria, apagar logs e alterar chaves fora da pipeline"
  type        = "SERVICE_CONTROL_POLICY"

  content = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "NaoDesligaAuditoria"
        Effect   = "Deny"
        Action   = ["cloudtrail:StopLogging", "cloudtrail:DeleteTrail", "cloudtrail:UpdateTrail", "cloudtrail:PutEventSelectors"]
        Resource = "*"
        Condition = {
          ArnNotLike = { "aws:PrincipalArn" = "arn:${local.partition}:iam::*:role/${local.name}-tf-apply" }
        }
      },
      {
        Sid      = "NaoDesligaDeteccao"
        Effect   = "Deny"
        Action   = ["guardduty:DeleteDetector", "guardduty:DisassociateFromMasterAccount", "guardduty:UpdateDetector", "securityhub:DisableSecurityHub", "ec2:DeleteFlowLogs", "logs:DeleteLogGroup"]
        Resource = "*"
        Condition = {
          ArnNotLike = { "aws:PrincipalArn" = "arn:${local.partition}:iam::*:role/${local.name}-tf-apply" }
        }
      },
      {
        Sid      = "NaoBurlaObjectLock"
        Effect   = "Deny"
        Action   = ["s3:BypassGovernanceRetention", "s3:PutBucketObjectLockConfiguration", "s3:DeleteObjectVersion"]
        Resource = ["arn:${local.partition}:s3:::${local.name}-auditoria-*", "arn:${local.partition}:s3:::${local.name}-auditoria-*/*"]
      },
      {
        Sid      = "ChavesSoPelaPipeline"
        Effect   = "Deny"
        Action   = ["kms:PutKeyPolicy", "kms:CreateGrant", "kms:ScheduleKeyDeletion", "kms:DisableKey"]
        Resource = "*"
        Condition = {
          ArnNotLike = {
            "aws:PrincipalArn" = [
              "arn:${local.partition}:iam::*:role/${local.name}-tf-apply",
              "arn:${local.partition}:iam::*:role/aws-service-role/*",
            ]
          }
          "Null" = { "aws:CalledVia" = "true" } # chamadas feitas pelo RDS/Secrets Manager continuam permitidas
        }
      },
    ]
  })
}

resource "aws_organizations_policy_attachment" "protect" {
  count     = var.enable_scp ? 1 : 0
  policy_id = aws_organizations_policy.protect[0].id
  target_id = var.scp_target_id
}
