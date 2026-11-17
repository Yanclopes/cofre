# SPEC-01: Autenticação e MFA

| Campo | Valor |
|---|---|
| Status | Implementada |
| Arquivos | `infra/cognito.tf`, `backend/src/auth/`, `frontend/src/auth.ts`, `frontend/src/components/AuthScreen.tsx` |

## Objetivo

O usuário cria conta e entra com e-mail, senha mestra e MFA, sem que a senha mestra chegue ao servidor.

## Requisitos funcionais

| ID | Requisito |
|---|---|
| RF-01 | Cadastro com e-mail e senha mestra |
| RF-02 | Login com segundo fator (TOTP) |
| RF-03 | Redefinição da senha de login por código enviado ao e-mail |

## Requisitos de segurança

| ID | Requisito | Mitiga |
|---|---|---|
| SEC-01 | A senha enviada ao Cognito é o `authPassword`, derivado da senha mestra por Argon2id + HKDF; a senha mestra nunca sai do navegador | T-03 |
| SEC-02 | Autenticação via SRP: nem o `authPassword` trafega | T-03 |
| SEC-03 | MFA obrigatório para todos os usuários (`mfa_configuration = "ON"`) | T-01 |
| SEC-04 | A API valida assinatura, emissor, `client_id` e expiração do access token (`aws-jwt-verify`) | T-02 |
| SEC-05 | Limite de 100 tentativas de login por IP a cada 5 min no WAF do Cognito | T-04 |
| SEC-06 | O login simulado (`AUTH_MODE=local`) é recusado quando `NODE_ENV=production` | T-05 |
| SEC-07 | Todas as rotas exigem token, exceto as marcadas com `@Public()` (health e config) | T-02 |

## Ameaças (STRIDE)

| ID | Categoria | Ameaça | Controle |
|---|---|---|---|
| T-01 | Spoofing | Senha vazada usada por terceiro | SEC-03 |
| T-02 | Spoofing / Elevation | Token forjado, expirado ou de outro app | SEC-04, SEC-07 |
| T-03 | Information disclosure | Servidor ou rede capturando a senha mestra | SEC-01, SEC-02 |
| T-04 | DoS / Spoofing | Força bruta no login | SEC-05 |
| T-05 | Elevation | Modo de desenvolvimento ativo em produção | SEC-06 |

## Critérios de aceite

| Requisito | Critério | Evidência |
|---|---|---|
| SEC-01 | Mesma senha + e-mail gera o mesmo `authPassword`; senha diferente gera outro | `frontend/src/crypto.test.ts` |
| SEC-03 | User pool com MFA `ON` e TOTP | `infra/cognito.tf` |
| SEC-04 | Token inválido → 401 | `backend/src/auth/token-verifier.ts`, `auth.guard.ts` |
| SEC-05 | Regra `LimiteDeLoginPorIp` ativa | `infra/cognito.tf` |
| SEC-06 | API não sobe com `AUTH_MODE=local` em produção | `backend/src/config.ts` |
