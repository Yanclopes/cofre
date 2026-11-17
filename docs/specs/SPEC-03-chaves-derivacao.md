# SPEC-03: Chaves e derivação

| Campo | Valor |
|---|---|
| Status | Implementada |
| Arquivos | `frontend/src/crypto.ts`, `frontend/src/session.ts`, `backend/src/keys/` |

## Objetivo

Transformar a senha mestra em chaves fortes e guardar no servidor apenas a chave do cofre já protegida.

## Requisitos funcionais

| ID | Requisito |
|---|---|
| RF-01 | No cadastro, gerar a `userKey` (256 bits) e salvar `protectedUserKey` e `recoveryProtectedUserKey` (`PUT /api/keys`) |
| RF-02 | No login, buscar os parâmetros do KDF e abrir a `userKey` (`GET /api/keys`) |
| RF-03 | Bloquear o cofre manualmente ou por inatividade |

## Requisitos de segurança

| ID | Requisito | Mitiga |
|---|---|---|
| SEC-01 | Derivação Argon2id (padrão 64 MiB, 3 iterações) + HKDF separando `encKey` e `authPassword` | T-01 |
| SEC-02 | A API impõe os mínimos do OWASP: `argon2id`, memória ≥ 19456 KiB, iterações ≥ 2 | T-02 |
| SEC-03 | Chaves no navegador são `CryptoKey` não-extraíveis e ficam só em memória | T-03 |
| SEC-04 | Bloqueio automático após 5 min sem uso (`AUTO_LOCK_MS`) | T-03 |
| SEC-05 | Chaves enviadas ao servidor precisam estar no formato cifrado `v1` | T-04 |

## Ameaças (STRIDE)

| ID | Categoria | Ameaça | Controle |
|---|---|---|---|
| T-01 | Information disclosure | Ataque de dicionário offline contra o banco vazado | SEC-01 |
| T-02 | Tampering | Cliente adulterado enfraquecendo o KDF | SEC-02 |
| T-03 | Information disclosure | XSS ou acesso ao computador desbloqueado extraindo a chave | SEC-03, SEC-04, CSP |
| T-04 | Information disclosure | Cliente com defeito enviando a chave em claro | SEC-05 |

## Critérios de aceite

| Requisito | Critério | Evidência |
|---|---|---|
| SEC-01 | Senha mestra errada não abre a chave do cofre | `frontend/src/crypto.test.ts` |
| SEC-02 | Argon2id enfraquecido recusado | `backend/src/keys/keys.dto.spec.ts` |
| SEC-04 | Cofre bloqueia após inatividade | `frontend/src/session.ts`, `e2e/e2e.mjs` |
