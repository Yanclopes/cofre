# =====================================================================
# Chaves KMS com SEPARAÇÃO DE FUNÇÕES
#   - quem administra a chave (conta/root, admins) NÃO pode cifrar/decifrar com ela;
#   - quem usa (EC2 da aplicação, serviços via RDS/Secrets Manager) NÃO pode mudar a política.
# Mudanças de política são alertadas (monitoring.tf) e podem ser bloqueadas por SCP (scp.tf).
# =====================================================================

locals {
  account_root = "arn:${local.partition}:iam::${local.account_id}:root"

  key_admin_actions = [
    "kms:Create*", "kms:Describe*", "kms:Enable*", "kms:List*", "kms:Put*", "kms:Update*",
    "kms:Revoke*", "kms:Disable*", "kms:Get*", "kms:Delete*", "kms:TagResource", "kms:UntagResource",
    "kms:ScheduleKeyDeletion", "kms:CancelKeyDeletion", "kms:RotateKeyOnDemand",
  ]
}

# ---------------------------------------------------------------- dados (RDS, segredo do banco)
resource "aws_kms_key" "data" {
  description             = "${local.name} - dados (RDS e segredo do banco)"
  enable_key_rotation     = true
  deletion_window_in_days = 30

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AdministracaoSemUso"
        Effect    = "Allow"
        Principal = { AWS = local.account_root }
        Action    = local.key_admin_actions
        Resource  = "*"
      },
      {
        # RDS e Secrets Manager usam a chave em nome da conta, só através desses serviços.
        Sid       = "UsoSomenteViaRdsESecretsManager"
        Effect    = "Allow"
        Principal = { AWS = local.account_root }
        Action    = ["kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:CreateGrant", "kms:DescribeKey"]
        Resource  = "*"
        Condition = {
          StringEquals = {
            "kms:CallerAccount" = local.account_id
            "kms:ViaService"    = ["rds.${var.region}.amazonaws.com", "secretsmanager.${var.region}.amazonaws.com"]
          }
        }
      },
      {
        # A aplicação só decifra (o segredo do banco), e só via Secrets Manager.
        Sid       = "AplicacaoDecifraSegredo"
        Effect    = "Allow"
        Principal = { AWS = aws_iam_role.app.arn }
        Action    = ["kms:Decrypt"]
        Resource  = "*"
        Condition = { StringEquals = { "kms:ViaService" = "secretsmanager.${var.region}.amazonaws.com" } }
      },
    ]
  })
}

resource "aws_kms_alias" "data" {
  name          = "alias/${local.name}-data"
  target_key_id = aws_kms_key.data.key_id
}

# ---------------------------------------------------------------- operação (logs, trilha, artefatos)
resource "aws_kms_key" "ops" {
  description             = "${local.name} - logs, CloudTrail, artefatos da pipeline e SNS"
  enable_key_rotation     = true
  deletion_window_in_days = 30

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "Administracao"
        Effect    = "Allow"
        Principal = { AWS = local.account_root }
        Action    = local.key_admin_actions
        Resource  = "*"
      },
      {
        Sid       = "UsoPorPapeisDaConta"
        Effect    = "Allow"
        Principal = { AWS = local.account_root }
        Action    = ["kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:DescribeKey"]
        Resource  = "*"
        Condition = { StringEquals = { "kms:CallerAccount" = local.account_id } }
      },
      {
        Sid       = "CloudWatchLogs"
        Effect    = "Allow"
        Principal = { Service = "logs.${var.region}.amazonaws.com" }
        Action    = ["kms:Encrypt*", "kms:Decrypt*", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"]
        Resource  = "*"
        Condition = {
          ArnLike = { "kms:EncryptionContext:aws:logs:arn" = "arn:${local.partition}:logs:${var.region}:${local.account_id}:*" }
        }
      },
      {
        Sid       = "CloudTrail"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = ["kms:GenerateDataKey*", "kms:DescribeKey"]
        Resource  = "*"
        Condition = {
          StringLike = { "kms:EncryptionContext:aws:cloudtrail:arn" = "arn:${local.partition}:cloudtrail:*:${local.account_id}:trail/*" }
        }
      },
      {
        Sid       = "AlarmesParaSns"
        Effect    = "Allow"
        Principal = { Service = ["cloudwatch.amazonaws.com", "events.amazonaws.com", "codestar-notifications.amazonaws.com", "cloudtrail.amazonaws.com"] }
        Action    = ["kms:Decrypt", "kms:GenerateDataKey*"]
        Resource  = "*"
      },
    ]
  })
}

resource "aws_kms_alias" "ops" {
  name          = "alias/${local.name}-ops"
  target_key_id = aws_kms_key.ops.key_id
}
