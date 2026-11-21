terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.95"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    # O DNS do domínio é autoritativo na Cloudflare, não no Route 53.
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }

  # Estado remoto no S3 (criado pela pasta bootstrap/), com lock nativo do S3 (use_lockfile).
  # Configuração em env/backend.hcl:  terraform init -backend-config=env/backend.hcl
  backend "s3" {}
}

provider "aws" {
  region = var.region
  default_tags {
    tags = local.tags
  }
}

# O token nunca entra em variável nem no state: o provider lê a variável de ambiente
# CLOUDFLARE_API_TOKEN (na pipeline, injetada do SSM pelo CodeBuild). O token deve ter
# apenas a permissão Zone:DNS:Edit na zona do projeto.
provider "cloudflare" {}

# CloudFront só aceita certificado ACM e Web ACL do WAF criados em us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
  default_tags {
    tags = local.tags
  }
}
