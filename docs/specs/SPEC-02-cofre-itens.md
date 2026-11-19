# SPEC-02: Cofre e itens cifrados

| Campo | Valor |
|---|---|
| Status | Implementada |
| Arquivos | `backend/src/items/`, `backend/src/common/enc-string.ts`, `frontend/src/components/Vault.tsx`, `ItemEditor.tsx` |

## Objetivo

O usuário guarda, consulta, edita e apaga acessos (site, usuário, senha, notas); o servidor só vê texto cifrado.

## Requisitos funcionais

| ID | Requisito |
|---|---|
| RF-01 | Listar, criar, editar e apagar itens (`/api/items`) |
| RF-02 | Gerar senhas aleatórias com tamanho e tipos de caractere escolhidos |
| RF-03 | Copiar senha para a área de transferência |

## Requisitos de segurança

| ID | Requisito | Mitiga |
|---|---|---|
| SEC-01 | Cada item é cifrado no navegador com AES-256-GCM e IV aleatório de 12 bytes | T-01 |
| SEC-02 | A API recusa qualquer `data` fora do formato `v1.<iv>.<cifrado>` | T-01 |
| SEC-03 | Todas as consultas filtram por `userId` do token; item de outro usuário → 404 | T-02 |
| SEC-04 | Item limitado a 64 KB e número máximo de itens por usuário | T-03 |
| SEC-05 | Edição exige `revision` atual; revisão desatualizada → 409 | T-04 |
| SEC-06 | Área de transferência é limpa 30 s após copiar | T-05 |
| SEC-07 | Criação, edição e exclusão geram evento de auditoria | T-06 |

## Ameaças (STRIDE)

| ID | Categoria | Ameaça | Controle |
|---|---|---|---|
| T-01 | Information disclosure | DBA, administrador ou invasor lendo senhas no banco | SEC-01, SEC-02 |
| T-02 | Elevation / Information disclosure | IDOR: acessar item de outro usuário pelo id | SEC-03 |
| T-03 | DoS | Encher o banco com itens enormes | SEC-04 |
| T-04 | Tampering | Dois dispositivos sobrescrevendo um ao outro | SEC-05 |
| T-05 | Information disclosure | Senha esquecida na área de transferência | SEC-06 |
| T-06 | Repudiation | Negar ter apagado ou alterado um item | SEC-07 |

## Critérios de aceite

| Requisito | Critério | Evidência |
|---|---|---|
| SEC-01 | Cifra e decifra um item; outra chave não abre | `frontend/src/crypto.test.ts` |
| SEC-02 | Item em texto puro recusado; formato `v1` aceito | `backend/src/keys/keys.dto.spec.ts` |
| SEC-03 | Usuário não lê, altera nem apaga item de outro | `backend/src/items/items.service.spec.ts` |
| SEC-05 | Revisão desatualizada recusada | `backend/src/items/items.service.spec.ts` |
| SEC-07 | Auditoria registrada em cada alteração | `backend/src/items/items.service.spec.ts` |
| SEC-01/02 | Banco não contém senha em texto puro após uso real | `e2e/e2e.mjs` |
