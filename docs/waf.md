# WAF e proteção em camada 7

Duas Web ACLs do AWS WAFv2 protegem as portas de entrada: a CloudFront (aplicação) e o Cognito (login). O ALB recusa
tudo que não vem da CloudFront, então não há como contornar o WAF.

## Web ACL da CloudFront (`infra/cdn_waf.tf`)

Escopo `CLOUDFRONT`, criada em `us-east-1`, ação padrão `allow`.

| Prioridade | Regra | Ação | Protege contra |
|---|---|---|---|
| 5 | `SomentePaisesPermitidos` (`allowed_country_codes`, padrão `["BR"]`) | block | Acesso de outros países |
| 10 | `AWSManagedRulesAmazonIpReputationList` | block | IPs maliciosos conhecidos, bots |
| 20 | `AWSManagedRulesCommonRuleSet` | block | OWASP Top 10 (XSS, LFI, RFI, path traversal) |
| 30 | `AWSManagedRulesKnownBadInputsRuleSet` | block | Payloads maliciosos, Log4Shell |
| 40 | `AWSManagedRulesSQLiRuleSet` | block | SQL injection |
| 50 | `LimitePorIp` (`waf_rate_limit`, padrão 1000 / 5 min) | block | Força bruta, abuso da API |

`SizeRestrictions_BODY` (da regra comum) está em modo `count`: itens cifrados podem passar de 8 KB. A API limita cada
item a 64 KB (`MAX_ITEM_LENGTH`).

## Web ACL do Cognito (`infra/cognito.tf`)

Escopo `REGIONAL`, associada ao user pool.

| Regra | Protege contra |
|---|---|
| `IpReputation` | IPs maliciosos |
| `KnownBadInputs` | Payloads maliciosos |
| `LimiteDeLoginPorIp` (`cognito_rate_limit`, padrão 100 / 5 min) | Força bruta no login |

## Origem fechada (`infra/alb.tf`)

1. O SG do ALB só aceita a prefix list `com.amazonaws.global.cloudfront.origin-facing`.
2. O listener HTTPS (`ELBSecurityPolicy-TLS13-1-2-2021-06`) responde **403** por padrão.
3. Só encaminha quando o cabeçalho `X-Origin-Verify` traz o segredo de 48 caracteres (`random_password`) que a
   CloudFront injeta.
4. `drop_invalid_header_fields = true`.

## Logs e cabeçalhos

- Logs das duas Web ACLs em CloudWatch (`aws-waf-logs-*`, 365 dias), com o cabeçalho `authorization` omitido.
- A CloudFront aplica a política gerenciada `SecurityHeadersPolicy` (HSTS, X-Frame-Options, X-Content-Type-Options,
  Referrer-Policy).
- A API complementa com Helmet (Content-Security-Policy) e `@nestjs/throttler` (120 requisições/min).

## Como testar

```bash
# SQLi deve ser bloqueado (403 do WAF)
curl -i "https://<dominio>/api/items?id=1%27%20OR%20%271%27=%271"
# Acesso direto ao ALB deve ser recusado (403 do listener)
curl -ik "https://origin.<dominio>/api/health"
```
