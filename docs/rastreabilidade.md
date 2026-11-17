# Rastreabilidade: requisito do enunciado → evidência

| Requisito do enunciado | Como é atendido | Evidência | Pendência |
|---|---|---|---|
| Código no GitHub com SAST | Semgrep bloqueia achados ERROR; Checkov analisa a IaC | `pipeline/buildspecs/sast.yml`, `tf-scan.yml`, [pipeline-devsecops.md](pipeline-devsecops.md) | Avaliar SonarCloud se SonarQube for exigido |
| Desenvolvimento seguro (SDD) | Specs com `SEC-xx`, STRIDE e critérios de aceite ligados a testes | [specs/](specs/README.md) | — |
| Infraestrutura com Terraform | Toda a AWS em `infra/`; estado remoto cifrado; plan/apply só pela pipeline | `infra/`, `infra/bootstrap/` | Executar `terraform plan` numa conta real |
| WAF em camada 7 | Web ACL na CloudFront e no Cognito; origem fechada | `infra/cdn_waf.tf`, `infra/cognito.tf`, `infra/alb.tf`, [waf.md](waf.md) | — |
| Isolamento de rede | 3 camadas × 2 AZs, banco sem rota externa, NACLs, SGs encadeados, VPC Endpoints | `infra/network.tf`, `security_groups.tf`, `endpoints.tf`, [rede-e-isolamento.md](rede-e-isolamento.md) | — |
| Aplicação funcional | Gerenciador de senhas com conhecimento zero, MFA, recuperação e auditoria | `frontend/`, `backend/`, `e2e/` | — |

## Testes automatizados

| Suíte | Testes | Resultado (17/11/2026) |
|---|---|---|
| `backend` (`npm test`, Jest) | 6 | 6 passando |
| `frontend` (`npm test`, Vitest) | 6 | 6 passando |
| `e2e` (Playwright, Chrome) | fluxo completo | não executado nesta revisão |
