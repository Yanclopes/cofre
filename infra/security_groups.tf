# =====================================================================
# Security groups encadeados por referência:
#   CloudFront --443--> SG-ALB --app_port--> SG-App --5432--> SG-DB
# Nenhum SG libera porta de entrada para 0.0.0.0/0.
# =====================================================================

# Lista gerenciada pela AWS com os IPs que a CloudFront usa para falar com a origem.
data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

resource "aws_security_group" "alb" {
  name        = "${local.name}-sg-alb"
  description = "ALB: aceita HTTPS somente da CloudFront"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "${local.name}-sg-alb" }
}

resource "aws_security_group" "app" {
  name        = "${local.name}-sg-app"
  description = "EC2 da aplicacao: aceita trafego somente do ALB"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "${local.name}-sg-app" }
}

resource "aws_security_group" "db" {
  name        = "${local.name}-sg-db"
  description = "RDS: aceita PostgreSQL somente das EC2 da aplicacao"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "${local.name}-sg-db" }
}

resource "aws_security_group" "endpoints" {
  name        = "${local.name}-sg-endpoints"
  description = "VPC endpoints: HTTPS somente das EC2 da aplicacao"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "${local.name}-sg-endpoints" }
}

# ---------------------------------------------------------------- ALB
resource "aws_vpc_security_group_ingress_rule" "alb_from_cloudfront" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTPS da CloudFront"
  prefix_list_id    = data.aws_ec2_managed_prefix_list.cloudfront.id
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_egress_rule" "alb_to_app" {
  security_group_id            = aws_security_group.alb.id
  description                  = "Encaminha para a aplicacao"
  referenced_security_group_id = aws_security_group.app.id
  ip_protocol                  = "tcp"
  from_port                    = var.app_port
  to_port                      = var.app_port
}

# ---------------------------------------------------------------- App
resource "aws_vpc_security_group_ingress_rule" "app_from_alb" {
  security_group_id            = aws_security_group.app.id
  description                  = "Somente do ALB"
  referenced_security_group_id = aws_security_group.alb.id
  ip_protocol                  = "tcp"
  from_port                    = var.app_port
  to_port                      = var.app_port
}

resource "aws_vpc_security_group_egress_rule" "app_to_db" {
  security_group_id            = aws_security_group.app.id
  description                  = "PostgreSQL"
  referenced_security_group_id = aws_security_group.db.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

resource "aws_vpc_security_group_egress_rule" "app_https" {
  security_group_id = aws_security_group.app.id
  description       = "HTTPS de saida (VPC endpoints, Cognito JWKS, atualizacoes via NAT)"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

# ---------------------------------------------------------------- DB (sem regra de saída)
resource "aws_vpc_security_group_ingress_rule" "db_from_app" {
  security_group_id            = aws_security_group.db.id
  description                  = "Somente das EC2 da aplicacao"
  referenced_security_group_id = aws_security_group.app.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

# ---------------------------------------------------------------- Endpoints
resource "aws_vpc_security_group_ingress_rule" "endpoints_from_app" {
  security_group_id            = aws_security_group.endpoints.id
  description                  = "HTTPS das EC2"
  referenced_security_group_id = aws_security_group.app.id
  ip_protocol                  = "tcp"
  from_port                    = 443
  to_port                      = 443
}
