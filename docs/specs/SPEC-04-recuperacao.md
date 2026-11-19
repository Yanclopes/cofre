# SPEC-04: Recuperação pelo kit

| Campo | Valor |
|---|---|
| Status | Implementada |
| Arquivos | `frontend/src/components/RecoveryKit.tsx`, `RecoverVault.tsx`, `frontend/src/crypto.ts` |

## Objetivo

Permitir que quem esqueceu a senha mestra recupere o cofre sem que ninguém (nem o suporte) consiga fazê-lo por ele.

## Requisitos funcionais

| ID | Requisito |
|---|---|
| RF-01 | No cadastro, exibir um código de recuperação (kit) para o usuário guardar |
| RF-02 | Após redefinir o login, pedir o kit, abrir a `userKey` e recifrá-la com a nova senha |
| RF-03 | Emitir um kit novo após cada recuperação |

## Requisitos de segurança

| ID | Requisito | Mitiga |
|---|---|---|
| SEC-01 | O kit é gerado no navegador e nunca é enviado ao servidor; o servidor guarda só `recoveryProtectedUserKey` | T-01 |
| SEC-02 | Kit errado é recusado (falha na autenticação do AES-GCM) | T-02 |
| SEC-03 | Após recuperar, um kit novo é emitido e o anterior deixa de valer | T-03 |
| SEC-04 | Sem senha e sem kit, o cofre é irrecuperável (não existe porta dos fundos) | T-04 |
| SEC-05 | Redefinir o login no Cognito exige código por e-mail e MFA | T-02 |

## Ameaças (STRIDE)

| ID | Categoria | Ameaça | Controle |
|---|---|---|---|
| T-01 | Information disclosure | Servidor capaz de recuperar o cofre | SEC-01, SEC-04 |
| T-02 | Spoofing | Atacante tentando recuperar a conta de outro | SEC-02, SEC-05 |
| T-03 | Information disclosure | Kit antigo vazado reutilizado | SEC-03 |
| T-04 | Elevation | Suporte ou administrador abrindo cofres | SEC-04 |

## Critérios de aceite

| Requisito | Critério | Evidência |
|---|---|---|
| SEC-02 | Código de recuperação errado é recusado | `frontend/src/crypto.test.ts`, `e2e/e2e.mjs` |
| SEC-03 | Kit abre o cofre com senha nova e itens antigos continuam legíveis | `frontend/src/crypto.test.ts` |
| RF-02 | Fluxo completo de recuperação no navegador | `e2e/e2e.mjs` |
