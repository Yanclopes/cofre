# SPEC-05: Auditoria e detecção

| Campo | Valor |
|---|---|
| Status | Implementada |
| Arquivos | `backend/src/audit/`, `backend/src/database/migrations/1731300000000-Init.ts`, `infra/audit.tf`, `infra/monitoring.tf`, `infra/scp.tf` |

## Objetivo

Registrar quem fez o quê, sem que ninguém (nem a aplicação, nem administradores) apague os registros, e alertar sobre
ações perigosas de quem tem acesso à infraestrutura.

## Requisitos funcionais

| ID | Requisito |
|---|---|
| RF-01 | O usuário vê o histórico das ações na própria conta (`GET /api/audit`) |
| RF-02 | A equipe recebe alertas por e-mail (SNS) de ações sensíveis na conta AWS |

## Requisitos de segurança

| ID | Requisito | Mitiga |
|---|---|---|
| SEC-01 | Tabela `audit_events` append-only: trigger no PostgreSQL recusa UPDATE e DELETE | T-01 |
| SEC-02 | CloudTrail multi-região grava em S3 com Object Lock (365 dias) e validação de integridade | T-02 |
| SEC-03 | Bucket de auditoria nega exclusão de objetos e acesso sem TLS | T-02 |
| SEC-04 | Alarmes: política KMS alterada, trilha alterada, segredo do banco lido por humano, uso do root, login no console sem MFA, SG/NACL alterado fora da pipeline, 5xx no ALB | T-03 |
| SEC-05 | GuardDuty e Security Hub (AWS Foundational Security Best Practices) ligados | T-04 |
| SEC-06 | SCP opcional impede desligar CloudTrail, GuardDuty e burlar Object Lock | T-02 |
| SEC-07 | Logs não registram o cabeçalho `authorization` | T-05 |

## Ameaças (STRIDE)

| ID | Categoria | Ameaça | Controle |
|---|---|---|---|
| T-01 | Repudiation / Tampering | Apagar rastros pela aplicação ou pelo banco | SEC-01 |
| T-02 | Repudiation | Administrador desligando ou apagando a trilha | SEC-02, SEC-03, SEC-06 |
| T-03 | Elevation | Insider alterando chaves ou regras de rede | SEC-04 |
| T-04 | Spoofing / Elevation | Credencial AWS comprometida | SEC-05 |
| T-05 | Information disclosure | Tokens vazando em logs | SEC-07 |

## Critérios de aceite

| Requisito | Critério | Evidência |
|---|---|---|
| SEC-01 | `DELETE` em `audit_events` é bloqueado pelo banco | `e2e/e2e.mjs`, migração `Init` |
| SEC-02 | `object_lock_enabled = true` e CloudTrail apontando para o bucket | `infra/audit.tf` |
| SEC-04 | Seis filtros de métrica + alarmes com destino SNS | `infra/monitoring.tf` |
