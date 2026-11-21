# Configuração do ambiente de produção. Nenhum valor aqui é secreto (versionado de propósito).
# Conta AWS: 918292980331

# ------------------------------------------------------------------ domínio (DNS na Cloudflare)
# Zona yan.tec.br, já delegada à Cloudflare (asa/rommy.ns.cloudflare.com), verificada em
# 21/11/2026. O Terraform cria cofre.yan.tec.br e origin.cofre.yan.tec.br, ambos CNAME e
# em modo DNS only. Os registros ods.yan.tec.br e api.ods.yan.tec.br, de outro projeto na
# mesma zona, não conflitam e seguem com o proxy da Cloudflare ligado.
domain_name        = "cofre.yan.tec.br"
cloudflare_zone_id = "56fb67cabfdb0cf3f527a230c8230de5"

# ------------------------------------------------------------------ contato e origem
alert_email       = "yanclopes08@gmail.com"
github_repository = "Yanclopes/cofre"
github_branch     = "master"
state_bucket      = "cofre-tfstate-918292980331"

# A pipeline precisa de uma versão >= à usada no primeiro apply (feito da máquina
# local com 1.14.9). Uma versão menor recusa o state e o estágio TerraformPlan quebra.
terraform_version = "1.14.9"

# ------------------------------------------------------------------ SonarCloud
# Gratuito só para repositório público. Grave o token no SSM ANTES do primeiro
# push, senão o estágio Seguranca/SonarCloud falha (ver docs/deploy-aws.md, passo 7).
enable_sonarcloud  = true
sonar_organization = "yanclopes"
sonar_project_key  = "Yanclopes_cofre"

# ------------------------------------------------------------------ região
# us-east-2 (Ohio) é a única região permitida pelas SCPs da organização que hospeda a
# conta — confirmado por teste em 8 regiões (ver docs/liberacao-servicos-aws.md).
region = "us-east-2"

# ==================================================================
# Perfil de laboratório: a conta tem US$ 100 de crédito, e esta infraestrutura
# é cobrada por hora mesmo sem ninguém acessando. Com estes valores dá ~US$ 3,70/dia
# em us-east-2 (~27 dias de crédito). Suba, apresente e destrua.
# Para a configuração fiel ao diagrama (2 NAT, Multi-AZ, 2 instâncias), comente
# o bloco inteiro: o custo sobe para ~US$ 11/dia.
# ==================================================================
single_nat_gateway    = true  # 1 NAT em vez de 2: economiza ~US$ 1,10/dia
db_multi_az           = false # banco em uma AZ só: economiza ~US$ 0,40/dia
minimal_vpc_endpoints = true  # 3 endpoints em vez de 9: economiza ~US$ 2,90/dia (o maior corte)
asg_min               = 1     # uma instância: economiza ~US$ 0,50/dia. A quota de vCPU em
asg_max               = 2     # us-east-2 é 64, então 2 instâncias caberiam; é escolha de custo

# O plano gratuito da conta recusa os 7 dias de produção (FreeTierRestrictionError).
db_backup_retention_days = 1

# Permitem desfazer tudo depois da apresentação. Em produção, ambos ficam no default.
db_deletion_protection = false
audit_force_destroy    = true # deixa o destroy esvaziar o bucket de auditoria (Object Lock GOVERNANCE)

# ------------------------------------------------------------------ bloqueados pela organização
# GuardDuty e Security Hub são negados por SCP em TODAS as regiões, inclusive us-east-2
# (o deny deles não é regional). Sem estas duas linhas o apply falha. Para reativá-los é
# preciso editar a SCP na conta de gerenciamento — ver docs/liberacao-servicos-aws.md.
enable_guardduty   = false
enable_securityhub = false

# A SCP de proteção só funciona se o Terraform rodar na conta de gerenciamento
# do Organizations, que não é o caso aqui (a gestão é da instituição).
enable_scp = false
