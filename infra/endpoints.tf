# As EC2 falam com os serviços AWS por endpoints privados, sem passar pela internet.

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = aws_route_table.app[*].id
  tags              = { Name = "${local.name}-vpce-s3" }
}

locals {
  # Sem substituto: o Session Manager é o único acesso administrativo (não há SSH).
  endpoints_essenciais = [
    "ssm",         # Session Manager (acesso administrativo sem SSH)
    "ssmmessages", # Session Manager
    "ec2messages", # Session Manager
  ]

  # Privacidade do tráfego, mas com alternativa pelo NAT quando o custo aperta.
  endpoints_opcionais = [
    "secretsmanager",             # senha do banco
    "kms",                        # decifrar o segredo
    "logs",                       # CloudWatch Logs
    "sts",                        # credenciais temporárias
    "codedeploy",                 # agente do CodeDeploy
    "codedeploy-commands-secure", # agente do CodeDeploy
  ]

  interface_endpoints = var.minimal_vpc_endpoints ? local.endpoints_essenciais : concat(local.endpoints_essenciais, local.endpoints_opcionais)
}

resource "aws_vpc_endpoint" "interface" {
  for_each            = toset(local.interface_endpoints)
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.region}.${each.value}"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.app[*].id
  security_group_ids  = [aws_security_group.endpoints.id]
  private_dns_enabled = true
  tags                = { Name = "${local.name}-vpce-${each.value}" }
}
