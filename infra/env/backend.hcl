# Estado remoto do Terraform. O bucket é criado pela pasta infra/bootstrap/
# (nome = <project>-tfstate-<account_id>).
#   terraform init -backend-config=env/backend.hcl
bucket       = "cofre-tfstate-918292980331"
key          = "prod/terraform.tfstate"
region       = "us-east-2"
encrypt      = true
use_lockfile = true # lock nativo do S3 (Terraform >= 1.10), sem DynamoDB
