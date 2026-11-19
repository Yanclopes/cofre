# Especificações (SDD com requisitos de segurança)

Cada funcionalidade nasce de uma especificação escrita **antes** do código (Spec-Driven Development). A spec define o
que a feature faz, os requisitos de segurança numerados (`SEC-xx`), as ameaças (STRIDE) e os critérios de aceite que
viram testes ou regras de pipeline.

## Processo

1. **Especificar**: copiar [`_modelo.md`](_modelo.md), descrever objetivo, requisitos funcionais (`RF-xx`) e de
   segurança (`SEC-xx`).
2. **Modelar ameaças**: aplicar STRIDE ao fluxo de dados da feature; cada ameaça aponta o `SEC-xx` que a mitiga.
3. **Definir aceite**: cada `SEC-xx` tem um critério verificável (teste unitário, E2E, regra do Semgrep/Checkov).
4. **Implementar**: o pull request referencia a spec (`Spec: SPEC-02`) e os requisitos atendidos.
5. **Verificar**: a pipeline roda testes, Semgrep e Checkov; nada é publicado sem passar.
6. **Manter**: mudança de comportamento atualiza a spec no mesmo pull request.

## Specs

| ID | Funcionalidade | Status |
|---|---|---|
| [SPEC-01](SPEC-01-autenticacao.md) | Autenticação e MFA | Implementada |
| [SPEC-02](SPEC-02-cofre-itens.md) | Cofre e itens cifrados | Implementada |
| [SPEC-03](SPEC-03-chaves-derivacao.md) | Chaves e derivação | Implementada |
| [SPEC-04](SPEC-04-recuperacao.md) | Recuperação pelo kit | Implementada |
| [SPEC-05](SPEC-05-auditoria.md) | Auditoria e detecção | Implementada |
| [SPEC-06](SPEC-06-infraestrutura.md) | Infraestrutura e rede | Implementada |

## Requisitos transversais (valem para todas as specs)

| ID | Requisito |
|---|---|
| SEC-T1 | Nenhum segredo no repositório; `p/secrets` do Semgrep bloqueia |
| SEC-T2 | Toda entrada da API validada com `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`) |
| SEC-T3 | Todo dado em repouso cifrado (KMS) e todo tráfego em TLS |
| SEC-T4 | Menor privilégio em IAM, SG e banco |
| SEC-T5 | Toda ação sensível gera evento de auditoria |
