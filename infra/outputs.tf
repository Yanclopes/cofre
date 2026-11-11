output "url" {
  description = "Endereço do gerenciador."
  value       = "https://${var.domain_name}"
}

output "cloudfront_domain" {
  value = aws_cloudfront_distribution.main.domain_name
}

output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "cognito_client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "rds_endpoint" {
  value = aws_db_instance.main.address
}

output "github_connection_arn" {
  description = "Conclua esta conexão no console (Developer Tools > Settings > Connections) para a pipeline ler o GitHub."
  value       = aws_codestarconnections_connection.github.arn
}

output "pipeline" {
  value = aws_codepipeline.main.name
}

output "vpc_subnets" {
  description = "Segmentação criada."
  value = {
    publica = local.public_cidrs
    app     = local.app_cidrs
    dados   = local.data_cidrs
  }
}
