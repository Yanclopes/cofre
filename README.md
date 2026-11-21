# Cofre: gerenciador de senhas e acessos com conhecimento zero na AWS

O usuário guarda N acessos (site, usuário, senha, notas) e consulta quando quiser com **uma** senha mestra, como no Bitwarden.
A premissa de segurança: **nem um atacante externo nem quem tem acesso à infraestrutura** (administrador da AWS, DBA,
desenvolvedor, suporte) consegue ler ou recuperar as senhas guardadas.

| Parte | Tecnologia | Pasta |
|---|---|---|
| Front-end (criptografia no navegador) | React + Vite + TypeScript, WebCrypto, Argon2id (hash-wasm) | `frontend/` |
| API (só guarda dados cifrados) | NestJS + TypeORM + PostgreSQL | `backend/` |
| Infraestrutura | Terraform (AWS provider 5.x, Cloudflare provider 5.x para o DNS) | `infra/` |
| Pipeline (SAST + Terraform) | CodePipeline, CodeBuild, CodeDeploy | `pipeline/`, `deploy/` |

---

## 1. Como o conhecimento zero funciona

```
senha mestra ──Argon2id(64 MiB, 3 it.)──► chave mestra ──HKDF──┬─► encKey       (fica no navegador)
                                                                └─► authPassword  (vai para o Cognito)

userKey = 256 bits aleatórios, gerada no navegador no cadastro
  ├─ cada item é cifrado com AES-256-GCM usando a userKey
  ├─ protectedUserKey         = AES-GCM(encKey, userKey)        → guardada no servidor
  └─ recoveryProtectedUserKey = AES-GCM(chaveDoKit, userKey)    → guardada no servidor
```

- O servidor recebe só `v1.<iv>.<texto cifrado>`. A API **recusa** qualquer item que não esteja nesse formato (`backend/src/items/items.dto.ts`).
- O Cognito recebe o `authPassword` derivado, e por SRP (o valor nem trafega). Ele não serve para decifrar nada.
- Chaves no navegador são `CryptoKey` **não-extraíveis**, só em memória. Bloqueio automático após 5 min sem uso; área de transferência limpa 30 s depois de copiar.

### Recuperação (igual ao Bitwarden: ninguém recupera por você)
| Situação | O que acontece |
|---|---|
| Esqueceu a senha de login | “Esqueci a senha” redefine o login no Cognito (código por e-mail + MFA). O cofre continua cifrado. |
| Esqueceu a senha mestra | No próximo login o sistema pede o **kit de recuperação** (código gerado no cadastro). Ele abre a userKey no navegador, que é recifrada com a nova senha; um kit novo é emitido e o antigo deixa de valer. |
| Perdeu senha **e** kit | O cofre é irrecuperável. Nem o suporte consegue. É o preço do conhecimento zero. |

---

## 2. Arquitetura implementada (mapa do diagrama → código)

| Elemento do diagrama | Onde está |
|---|---|
| VPC 10.0.0.0/16, 3 camadas × 2 AZs, rotas | `infra/network.tf` |
| NACLs por camada (dados só aceita 5432 da camada app) | `infra/network.tf` |
| Security groups encadeados CloudFront → ALB → App → DB | `infra/security_groups.tf` |
| VPC Endpoints (sem internet para serviços AWS) | `infra/endpoints.tf` |
| CloudFront + **AWS WAF** (regras gerenciadas, rate limit, geo) | `infra/cdn_waf.tf` |
| DNS na Cloudflare (*DNS only*, para o WAF ver o IP real) e certificados ACM | `infra/dns_acm.tf` |
| ALB só aceita CloudFront + cabeçalho secreto | `infra/alb.tf` |
| EC2 em Auto Scaling, IMDSv2, sem SSH | `infra/compute.tf`, `infra/templates/user_data.sh.tftpl` |
| RDS PostgreSQL isolado, TLS obrigatório, senha no Secrets Manager | `infra/rds.tf` |
| Cognito com MFA obrigatório + WAF próprio no login | `infra/cognito.tf` |
| KMS com separação de funções (quem administra não usa) | `infra/kms.tf` |
| CloudTrail → S3 com **Object Lock**, GuardDuty, Security Hub | `infra/audit.tf` — os dois últimos negados por SCP nesta conta |
| Alarmes contra ações de administradores (política KMS, trilha, segredo lido por humano…) | `infra/monitoring.tf` |
| SCP do Organizations (opcional) | `infra/scp.tf` |
| Pipeline: Source → **SAST** + **Terraform scan** → plan → aprovação → apply → build → deploy | `infra/pipeline.tf`, `pipeline/buildspecs/` |
| Deploy nas EC2 (CodeDeploy, uma instância por vez, rollback automático) | `deploy/` |
| Diagrama da arquitetura (PNG, SVG e draw.io editável) | `docs/` |
| Documentação de arquitetura, rede, WAF, pipeline e specs de segurança (SDD) | [`docs/README.md`](docs/README.md) |

---

## 3. Rodar na sua máquina (sem AWS)

O modo `AUTH_MODE=local` troca o Cognito por um login simulado da própria API (bloqueado se `NODE_ENV=production`).
Toda a criptografia é a mesma de produção.

```bash
docker compose up -d                       # PostgreSQL local

cd backend
cp .env.example .env
npm install && npm run build
npm run start:local                        # http://localhost:3000/api/health

cd ../frontend                             # outro terminal
npm install
npm run dev                                # http://localhost:5173
```

Testes:
```bash
cd backend  && npm test                    # regras da API (dono do item, formato cifrado, Argon2 mínimo)
cd frontend && npm test                    # criptografia: cifrar/decifrar, senha errada, kit de recuperação
```

Teste de ponta a ponta no navegador (cadastro, cofre, bloqueio, recuperação pelo kit e conferência de que o banco só tem texto cifrado):
```bash
cd frontend && npm run build
cd ../backend && FRONTEND_DIR=../frontend/dist npm run start:local
cd ../e2e && npm install && npx playwright install chromium && node e2e.mjs
```

---

## 4. Publicar na AWS

Roteiro completo, com os valores da conta já preenchidos, custo por dia e erros conhecidos:
[`docs/deploy-aws.md`](docs/deploy-aws.md). O resumo abaixo é o caminho principal.

Pré-requisitos: conta AWS, um domínio com o DNS na Cloudflare (o Terraform cria os registros pelo
provider `cloudflare/cloudflare`, em modo *DNS only* — ver [`docs/deploy-aws.md`](docs/deploy-aws.md#passo-1--domínio-e-dns-na-cloudflare)),
Terraform ≥ 1.10 e repositório no GitHub.

> **Estado em 21/11/2026:** o `terraform plan` roda contra a conta real e propõe 149 recursos
> sem erro. A conta é membro de uma organização administrada pela instituição, cujas SCPs
> permitem apenas a região **`us-east-2`** (das oito testadas) e negam GuardDuty e Security Hub
> em todas elas — por isso `region = "us-east-2"` e os dois serviços desligados no `prod.tfvars`.
> O levantamento e o procedimento de liberação estão em
> [`docs/liberacao-servicos-aws.md`](docs/liberacao-servicos-aws.md).

1. **Estado do Terraform** (uma vez):
   ```bash
   cd infra/bootstrap && terraform init && terraform apply
   ```
2. **Configuração**: copie `infra/env/backend.hcl.example` → `infra/env/backend.hcl` e `infra/env/prod.tfvars.example` → `infra/env/prod.tfvars`, preencha e **faça commit** (não há segredos neles).
3. **Primeiro apply** (da sua máquina, cria inclusive a pipeline):
   ```bash
   cd infra
   terraform init -backend-config=env/backend.hcl
   terraform apply -var-file=env/prod.tfvars
   ```
   Faça commit do `infra/.terraform.lock.hcl` gerado.
4. **Ative a conexão com o GitHub**: Console → Developer Tools → Settings → Connections → conexão `cofre-prod-github` → *Update pending connection*.
5. **Confirme a assinatura** do e-mail de alertas (SNS).
6. **SonarCloud**: desligue a *Automatic Analysis* no projeto do SonarCloud e grave o token no SSM:
   `aws ssm put-parameter --name /cofre-prod/sonarcloud-token --type SecureString --key-id alias/cofre-prod-ops --overwrite --value <token>`.
   Passo a passo em [docs/pipeline-devsecops.md](docs/pipeline-devsecops.md). Para não usar, `enable_sonarcloud = false`.
7. A partir daqui, todo `git push` na branch configurada em `github_branch` (neste repositório, `master`) roda a pipeline. A aprovação manual chega por e-mail.

### Pipeline
| Estágio | O que faz | Bloqueia quando |
|---|---|---|
| Source | Lê o GitHub via CodeConnections | — |
| Seguranca / SAST | Semgrep (`p/ci`, `p/typescript`, `p/react`, `p/nodejsscan`, `p/jwt`, `p/secrets`) | achado de severidade ERROR |
| Seguranca / SonarCloud | SonarScanner + consulta à API do SonarCloud | vulnerabilidade BLOCKER ou CRITICAL aberta |
| Seguranca / TerraformScan | `terraform fmt -check`, `validate`, **Checkov** | qualquer verificação reprovada |
| TerraformPlan | `terraform plan -out=tfplan` (papel só leitura) | erro no plan |
| Aprovacao | Revisor lê o plan e aprova | rejeição |
| TerraformApply | Aplica **o mesmo** plano aprovado | plano desatualizado |
| BuildAplicacao | Testes + build do NestJS e do React | teste falhando |
| Deploy | CodeDeploy, 1 instância por vez | health check falha → rollback |

### Custo
NAT Gateway, interface endpoints, ALB e RDS Multi-AZ são cobrados por hora mesmo sem uso, e os nove endpoints de
interface (× 2 AZs) custam mais que o NAT. O `prod.tfvars` deste repositório já vem no perfil de laboratório —
um NAT, banco em uma AZ, uma instância e `minimal_vpc_endpoints = true`, que deixa só os três endpoints do
Session Manager: **~US$ 3,70/dia** em `us-east-2`, contra ~US$ 11/dia na configuração fiel ao diagrama.
Detalhamento item por item em [`docs/deploy-aws.md`](docs/deploy-aws.md#custo).

Para destruir depois da apresentação são necessários `db_deletion_protection = false` e
`audit_force_destroy = true` (o Object Lock em modo `GOVERNANCE` exige o bypass na remoção);
em modo `COMPLIANCE` os logs ficam retidos até o fim do prazo, e isso é intencional.

---

## 5. Verificações feitas neste código

- `npm test` da API (6 testes) e do front (6 testes de criptografia): passando.
- Teste E2E no Chrome: cadastro → kit → salvar acessos → bloquear/desbloquear → senha errada recusada → reset de senha → kit errado recusado → recuperação com o kit → auditoria; conferido que o banco **não** contém nenhuma senha em texto puro e que `DELETE` na auditoria é bloqueado.
- **SAST** (Semgrep, regras TypeScript/JavaScript/segredos): 0 achados bloqueantes.
- **Checkov** no Terraform: 353 verificações aprovadas, 0 reprovadas, 27 dispensadas (Checkov 3.4.6). As exceções estão justificadas no próprio recurso (`#checkov:skip=...`).
- Formatação HCL conferida com o formatador oficial (`hclwrite`); argumentos conferidos contra a documentação do provider AWS 5.95.
- **SonarCloud**: estágio configurado, mas ainda não executado (depende do projeto criado no SonarCloud e do token no SSM).
- `terraform validate` e `terraform fmt -check -recursive`: aprovados em `infra/` e em `infra/bootstrap/`
  (Terraform 1.14.9, provider aws 5.100.0).
- `terraform plan` contra a conta AWS real: **149 recursos propostos, 0 erros**, com
  `region = us-east-2` (ver seção 4). O plan destravou um defeito que estava encoberto: a AMI
  era buscada em `/aws/service/ami-amazon-linux-latest/...`, caminho que responde
  `ParameterNotFound` nesta conta; passou a vir de `data "aws_ami"` via `ec2:DescribeImages`.
- **Não executado aqui:** `terraform apply`. Nada foi criado na AWS.

## 6. Próximos passos possíveis
- Acesso de emergência (contato de confiança com prazo de espera), compartilhamento de itens entre usuários com chaves públicas (X25519).
- Login com passkey (WebAuthn PRF) para abrir o cofre sem digitar a senha mestra.
- WAF também no ALB e replicação dos logs de auditoria para outra região.
