variable "project" {
  description = "Nome curto do projeto (prefixo dos recursos)."
  type        = string
  default     = "cofre"
}

variable "environment" {
  description = "Ambiente (prod, staging...)."
  type        = string
  default     = "prod"
}

# us-east-2 (Ohio) e não sa-east-1 (São Paulo): as SCPs da organização que hospeda a conta
# negam todas as regiões exceto us-east-2. O efeito colateral é positivo no custo — Ohio é
# ~30% mais barata —, mas os dados passam a residir fora do Brasil. Ver docs/arquitetura.md.
variable "region" {
  description = "Região principal."
  type        = string
  default     = "us-east-2"
}

# ------------------------------------------------------------------ domínio
variable "domain_name" {
  description = "Domínio público do gerenciador (ex.: cofre.seudominio.com.br)."
  type        = string
}

# O DNS fica na Cloudflare (o registro do domínio obriga o uso dos nameservers dela).
# O ID da zona aparece no painel da Cloudflare, em Overview > API > Zone ID.
variable "cloudflare_zone_id" {
  description = "ID da zona da Cloudflare que contém o domínio."
  type        = string
}

# ------------------------------------------------------------------ rede
variable "vpc_cidr" {
  description = "Faixa da VPC. As sub-redes são /24 dentro dela."
  type        = string
  default     = "10.0.0.0/16"
}

variable "single_nat_gateway" {
  description = "true = um NAT só (mais barato, para laboratório); false = um NAT por AZ (alta disponibilidade)."
  type        = bool
  default     = false
}

# ------------------------------------------------------------------ aplicação
# Os endpoints de interface são o item mais caro da arquitetura (9 serviços x 2 AZs,
# cobrados por hora por ENI). Com true, ficam só os três do Session Manager, que não
# têm substituto: o resto do tráfego para a AWS sai pelo NAT, ainda sem passar por
# endereço público da aplicação. Mantenha false em produção.
variable "minimal_vpc_endpoints" {
  description = "true = só os endpoints do Session Manager (laboratório, mais barato); false = todos (produção)."
  type        = bool
  default     = false
}

variable "app_port" {
  description = "Porta em que a API NestJS escuta nas EC2."
  type        = number
  default     = 3000
}

variable "instance_type" {
  type    = string
  default = "t3.small"
}

variable "asg_min" {
  type    = number
  default = 2
}

variable "asg_max" {
  type    = number
  default = 4
}

variable "node_version" {
  description = "Versão do Node.js instalada nas EC2."
  type        = string
  default     = "22.12.0"
}

# ------------------------------------------------------------------ banco
variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_multi_az" {
  type    = bool
  default = true
}

# O plano gratuito da AWS limita a retenção de backup do RDS; o apply de 21/11/2026 foi
# recusado com FreeTierRestrictionError usando os 7 dias de produção.
variable "db_backup_retention_days" {
  description = "Dias de retenção dos backups automáticos do RDS."
  type        = number
  default     = 7
}

variable "db_deletion_protection" {
  description = "Mantenha true em produção. Use false só para destruir um laboratório."
  type        = bool
  default     = true
}

# ------------------------------------------------------------------ WAF
variable "waf_rate_limit" {
  description = "Máximo de requisições por IP a cada 5 minutos antes de bloquear."
  type        = number
  default     = 1000
}

variable "cognito_rate_limit" {
  description = "Máximo de requisições por IP a cada 5 minutos no login (Cognito), contra força bruta."
  type        = number
  default     = 100
}

variable "allowed_country_codes" {
  description = "Países que podem acessar (ISO 3166). Lista vazia = sem bloqueio geográfico."
  type        = list(string)
  default     = ["BR"]
}

# ------------------------------------------------------------------ auditoria
variable "audit_retention_days" {
  description = "Dias em que os logs de auditoria ficam imutáveis (Object Lock)."
  type        = number
  default     = 365
}

variable "audit_object_lock_mode" {
  description = "COMPLIANCE = ninguém apaga, nem o root (produção). GOVERNANCE = permite remoção com permissão especial (laboratório)."
  type        = string
  default     = "GOVERNANCE"
  validation {
    condition     = contains(["GOVERNANCE", "COMPLIANCE"], var.audit_object_lock_mode)
    error_message = "Use GOVERNANCE ou COMPLIANCE."
  }
}

# Só para laboratório: permite que o terraform destroy apague os logs ainda sob
# Object Lock em modo GOVERNANCE. Em COMPLIANCE nem isso funciona, e é justamente
# essa a garantia que o trabalho demonstra. Nunca true em produção.
variable "audit_force_destroy" {
  description = "true = o destroy esvazia o bucket de auditoria (ignora a retenção GOVERNANCE)."
  type        = bool
  default     = false
}

variable "enable_guardduty" {
  description = "false se a conta já tiver o GuardDuty ligado por outro meio."
  type        = bool
  default     = true
}

variable "enable_securityhub" {
  description = "false se a conta já tiver o Security Hub ligado por outro meio."
  type        = bool
  default     = true
}

variable "alert_email" {
  description = "E-mail que recebe alertas de segurança e pedidos de aprovação da pipeline."
  type        = string
}

# ------------------------------------------------------------------ pipeline
variable "github_repository" {
  description = "Repositório no formato usuario/repositorio."
  type        = string
}

variable "github_branch" {
  type    = string
  default = "main"
}

variable "state_bucket" {
  description = "Bucket do estado do Terraform (saída do bootstrap)."
  type        = string
}

# Precisa ser >= a versão usada no primeiro apply: um state escrito por uma versão
# mais nova é recusado por uma mais antiga, e a pipeline quebraria no TerraformPlan.
variable "terraform_version" {
  description = "Versão do Terraform usada na pipeline."
  type        = string
  default     = "1.14.9"
}

variable "enable_sonarcloud" {
  description = "Adiciona o SonarCloud ao estágio Seguranca, em paralelo ao Semgrep. Gratuito só para repositório público."
  type        = bool
  default     = true
}

variable "sonar_organization" {
  description = "Chave da organização no SonarCloud (normalmente o usuário do GitHub)."
  type        = string
  default     = ""
  validation {
    condition     = !var.enable_sonarcloud || var.sonar_organization != ""
    error_message = "Defina sonar_organization ou use enable_sonarcloud = false."
  }
}

variable "sonar_project_key" {
  description = "Chave do projeto no SonarCloud (ex.: usuario_cofre)."
  type        = string
  default     = ""
  validation {
    condition     = !var.enable_sonarcloud || var.sonar_project_key != ""
    error_message = "Defina sonar_project_key ou use enable_sonarcloud = false."
  }
}

# ------------------------------------------------------------------ organização (opcional)
variable "enable_scp" {
  description = "Cria a SCP de proteção. Só funciona se o Terraform rodar na conta de gerenciamento do AWS Organizations."
  type        = bool
  default     = false
}

variable "scp_target_id" {
  description = "ID da conta ou OU onde a SCP é anexada (quando enable_scp = true)."
  type        = string
  default     = ""
}
