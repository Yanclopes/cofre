data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

data "aws_availability_zones" "available" {
  #checkov:skip=CKV_AWS_394:O resultado é limitado às duas primeiras AZs com slice() em local.azs
  state = "available"
}

locals {
  name       = "${var.project}-${var.environment}"
  account_id = data.aws_caller_identity.current.account_id
  partition  = data.aws_partition.current.partition

  azs = slice(data.aws_availability_zones.available.names, 0, 2)

  # Segmentação: três camadas, uma sub-rede /24 por AZ em cada camada.
  public_cidrs = [for i in range(2) : cidrsubnet(var.vpc_cidr, 8, 1 + i)]  # 10.0.1.0/24, 10.0.2.0/24
  app_cidrs    = [for i in range(2) : cidrsubnet(var.vpc_cidr, 8, 11 + i)] # 10.0.11.0/24, 10.0.12.0/24
  data_cidrs   = [for i in range(2) : cidrsubnet(var.vpc_cidr, 8, 21 + i)] # 10.0.21.0/24, 10.0.22.0/24

  origin_domain = "origin.${var.domain_name}"

  tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
