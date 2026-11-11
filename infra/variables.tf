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

variable "region" {
  description = "Região principal."
  type        = string
  default     = "sa-east-1"
}

# ------------------------------------------------------------------ domínio
variable "domain_name" {
  description = "Domínio público do gerenciador (ex.: cofre.seudominio.com.br)."
  type        = string
}

variable "hosted_zone_id" {
  description = "ID da hosted zone do Route 53 que contém o domínio."
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

variable "terraform_version" {
  description = "Versão do Terraform usada na pipeline."
  type        = string
  default     = "1.10.5"
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
