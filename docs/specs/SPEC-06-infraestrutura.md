# SPEC-06: Infraestrutura e rede

| Campo | Valor |
|---|---|
| Status | Implementada |
| Arquivos | `infra/*.tf`, `pipeline/buildspecs/tf-*.yml` |

## Objetivo

Publicar a aplicação na AWS com a menor superfície de ataque possível, inteiramente por código e por pipeline.

## Requisitos de segurança

| ID | Requisito | Mitiga |
|---|---|---|
| SEC-01 | Banco em sub-rede sem rota para fora da VPC e `publicly_accessible = false` | T-01 |
| SEC-02 | Nenhum security group aceita entrada de `0.0.0.0/0`; SGs encadeados por referência | T-01 |
| SEC-03 | NACL da camada de dados aceita só 5432 dos CIDRs da camada app | T-01 |
| SEC-04 | Toda requisição passa pelo WAF: ALB só aceita CloudFront + `X-Origin-Verify` | T-02 |
| SEC-05 | EC2 sem SSH e sem IP público; IMDSv2 obrigatório | T-03 |
| SEC-06 | Serviços AWS acessados por VPC Endpoints | T-04 |
| SEC-07 | EBS, RDS, S3, logs e estado do Terraform cifrados; TLS obrigatório no RDS e nos buckets | T-04 |
| SEC-08 | Mudanças só pela pipeline: plan com papel somente leitura, aprovação manual, apply do plano aprovado | T-05 |
| SEC-09 | Checkov sem reprovações; exceções justificadas no recurso | T-05 |

## Ameaças (STRIDE)

| ID | Categoria | Ameaça | Controle |
|---|---|---|---|
| T-01 | Information disclosure | Banco exposto à internet ou a outras camadas | SEC-01, SEC-02, SEC-03 |
| T-02 | Tampering / DoS | Ataque de camada 7 contornando o WAF pelo ALB | SEC-04 |
| T-03 | Elevation | SSH exposto; roubo de credenciais via SSRF no metadata | SEC-05 |
| T-04 | Information disclosure | Tráfego ou dados interceptados | SEC-06, SEC-07 |
| T-05 | Tampering | Alteração manual ou infraestrutura insegura no código | SEC-08, SEC-09 |

## Critérios de aceite

| Requisito | Critério | Evidência |
|---|---|---|
| SEC-01 | `aws_route_table.data` sem rotas além da local | `infra/network.tf` |
| SEC-02 | Checkov sem achados de SG aberto | `pipeline/buildspecs/tf-scan.yml` |
| SEC-04 | `curl` direto no ALB retorna 403 | `infra/alb.tf`, [waf.md](../waf.md) |
| SEC-05 | `http_tokens = "required"`, sem `key_name` | `infra/compute.tf` |
| SEC-08 | Estágios Plan → Aprovação → Apply | `infra/pipeline.tf` |
