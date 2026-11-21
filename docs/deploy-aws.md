# Publicar na AWS — roteiro verificado

Roteiro de execução com os valores já preenchidos para a conta do projeto. Levantamento e
validação feitos em **21/11/2026** com Terraform 1.14.9 e AWS CLI 2.34.

**Estado atual:** pronto para aplicar. O `terraform plan` roda contra a conta real e propõe
**149 recursos sem erro** (validado em 21/11/2026). A região é `us-east-2` porque as SCPs da
organização que hospeda a conta negam todas as outras; GuardDuty e Security Hub ficam
desligados pelo mesmo motivo. O detalhamento está em
[liberacao-servicos-aws.md](liberacao-servicos-aws.md).

| Dado da conta | Valor |
|---|---|
| Conta AWS | `918292980331` |
| Perfil local da AWS CLI | `cofre` |
| Região | `us-east-2` (Ohio) — única permitida pelas SCPs |
| Bucket do estado | `cofre-tfstate-918292980331` |
| Repositório / branch | `Yanclopes/cofre` / `master` |
| Domínio | `cofre.yan.tec.br` |
| Zona na Cloudflare | `yan.tec.br` — id `56fb67cabfdb0cf3f527a230c8230de5` (delegação e permissão de escrita conferidas em 21/11/2026) |

---

## Passo 0 — Conferir o alcance das SCPs (1 minuto)

A conta é membro de uma organização cujas SCPs restringem a região. Antes de aplicar,
confirme que nada mudou do lado da instituição:

```bash
export AWS_PROFILE=cofre
aws ec2 describe-availability-zones --region us-east-2 --query 'AvailabilityZones[].ZoneName'
aws rds describe-db-instances --region us-east-2
aws cognito-idp list-user-pools --max-results 5 --region us-east-2
aws kms list-keys --region us-east-2
```

Os quatro devem responder sem `explicit deny in a service control policy`. Se algum falhar,
a política foi alterada — veja [liberacao-servicos-aws.md](liberacao-servicos-aws.md).

> Não troque a região no `prod.tfvars` sem antes testar: em 21/11/2026, das oito regiões
> testadas, somente `us-east-2` passou.

## Passo 1 — Domínio e DNS na Cloudflare

O DNS do domínio é autoritativo na Cloudflare (o registro dela obriga o uso dos nameservers
próprios). O Terraform gerencia os registros pelo provider `cloudflare/cloudflare`, então a
emissão dos certificados ACM e a publicação do endereço acontecem no mesmo apply.

1. **Registre o domínio** na Cloudflare (Registrar → Register Domain). Ela não vende `.com.br`;
   um `.com` sai a preço de custo, ~US$ 10/ano. Se o domínio já existir em outro registrador,
   adicione-o como zona na Cloudflare e aponte os nameservers dela no registrador.
2. **Use um subdomínio**, como `cofre.seudominio.com`, e não o apex: no apex, apontar para a
   CloudFront depende do CNAME flattening da Cloudflare; no subdomínio é um CNAME comum. O
   nome da origem que o projeto cria (`origin.cofre.seudominio.com`) também fica um CNAME comum.
3. **Copie o Zone ID**: painel da Cloudflare → a zona → Overview → API → *Zone ID*.
4. **Crie dois tokens** em My Profile → API Tokens → Create Token → *Edit zone DNS* como base,
   restringindo cada um à sua zona:

   | Token | Permissão | Quem usa |
   |---|---|---|
   | leitura | Zone → DNS → **Read** | `terraform plan` (estágio de leitura da pipeline) |
   | escrita | Zone → DNS → **Edit** | `terraform apply` e o seu primeiro apply local |

   Dois tokens em vez de um preservam a separação de papéis da pipeline, em que o plan roda
   com permissão só de leitura também na AWS (`ReadOnlyAccess`).
5. **Preencha** `domain_name` e `cloudflare_zone_id` em `infra/env/prod.tfvars`.

> Os registros são criados com `proxied = false` (*DNS only*) de propósito. Com o proxy da
> Cloudflare ligado, a CloudFront veria o IP dela em vez do IP do visitante: a regra
> `SomentePaisesPermitidos` bloquearia todos os acessos e a `LimitePorIp` contaria todos os
> visitantes como um só. A explicação está no início de `infra/dns_acm.tf`.

## Passo 2 — Credencial

O perfil `cofre` já está configurado. Confirme:

```bash
export AWS_PROFILE=cofre
aws sts get-caller-identity   # deve devolver a conta 918292980331
```

O primeiro apply sai da sua máquina, então o token de escrita da Cloudflare precisa estar no
ambiente. O provider o lê daí; ele nunca entra em variável do Terraform nem no state:

```bash
export CLOUDFLARE_API_TOKEN=o-token-de-escrita
```

> **Rotacione a access key atual.** Ela foi compartilhada em texto puro durante o levantamento.
> Console → IAM → Users → Yan → Security credentials → desative a chave antiga, crie outra e
> rode `aws configure --profile cofre`.

## Passo 3 — Proteger o crédito (recomendado, 2 minutos)

Esta infraestrutura é cobrada por hora mesmo sem acesso. Um orçamento com alerta por e-mail
evita a surpresa de acordar com o crédito zerado. Crie dois arquivos:

`budget.json`

```json
{ "BudgetName": "cofre-credito", "BudgetType": "COST", "TimeUnit": "MONTHLY",
  "BudgetLimit": { "Amount": "90", "Unit": "USD" } }
```

`notif.json`

```json
[ { "Notification": { "NotificationType": "ACTUAL", "ComparisonOperator": "GREATER_THAN",
      "Threshold": 50, "ThresholdType": "PERCENTAGE" },
    "Subscribers": [ { "SubscriptionType": "EMAIL", "Address": "yanclopes08@gmail.com" } ] } ]
```

```bash
aws budgets create-budget --account-id 918292980331 \
  --budget file://budget.json --notifications-with-subscribers file://notif.json
```

## Passo 4 — Estado do Terraform (uma vez só)

```bash
cd infra/bootstrap
terraform init
terraform apply -var="project=cofre" -var="region=us-east-2"
terraform output state_bucket    # confere: cofre-tfstate-918292980331
```

## Passo 5 — Primeiro apply

Feito da sua máquina, porque é ele que cria a própria pipeline.

```bash
cd ../            # infra/
terraform init -backend-config=env/backend.hcl
terraform plan -var-file=env/prod.tfvars -out=tfplan      # leia o plano antes
terraform apply tfplan
```

Demora de 20 a 30 minutos — o RDS e a distribuição CloudFront são os mais lentos. Ao final:

```bash
terraform output
```

Faça commit do `infra/.terraform.lock.hcl` (já gerado: aws 5.100.0, random 3.9.1).

## Passo 6 — Conexão com o GitHub

A conexão nasce em estado *pending*; a pipeline não lê o repositório até ser concluída **no
console**: Developer Tools → Settings → Connections → `cofre-prod-github` →
*Update pending connection* → autorizar o GitHub. Depois confirme:

```bash
aws codeconnections list-connections --region us-east-2 \
  --query 'Connections[].{Nome:ConnectionName,Status:ConnectionStatus}' --output table
```

Deve aparecer `AVAILABLE`.

## Passo 7 — Assinatura de alertas e tokens da pipeline

1. **Tokens da Cloudflare no SSM.** O apply cria os dois parâmetros com valor provisório;
   grave os tokens de verdade antes do primeiro push, senão os estágios de Terraform da
   pipeline falham ao configurar o provider:

   ```bash
   aws ssm put-parameter --name /cofre-prod/cloudflare-token-ro --type SecureString --key-id alias/cofre-prod-ops --overwrite --value TOKEN_DE_LEITURA --region us-east-2
   aws ssm put-parameter --name /cofre-prod/cloudflare-token-rw --type SecureString --key-id alias/cofre-prod-ops --overwrite --value TOKEN_DE_ESCRITA --region us-east-2
   ```

2. Confirme a assinatura do SNS no e-mail `yanclopes08@gmail.com` (link *Confirm subscription*).
   Sem isso você não recebe o pedido de aprovação manual da pipeline.
3. No SonarCloud: crie o projeto a partir do repositório, **desligue a *Automatic Analysis***
   (ela conflita com o scanner da pipeline) e gere um token. Grave-o antes do primeiro push:

   ```bash
   aws ssm put-parameter --name /cofre-prod/sonarcloud-token --type SecureString \
     --key-id alias/cofre-prod-ops --overwrite --value TOKEN --region us-east-2
   ```

   Sem o token, o estágio `Seguranca/SonarCloud` falha e para a pipeline. Para dispensá-lo,
   use `enable_sonarcloud = false` no tfvars e aplique de novo.

## Passo 8 — Primeiro deploy da aplicação

O apply cria a infraestrutura, mas as instâncias sobem vazias: o código chega pelo CodeDeploy.
Um push na `master` dispara a pipeline inteira:

```bash
git push origin master
aws codepipeline get-pipeline-state --name cofre-prod-pipeline --region us-east-2 \
  --query 'stageStates[].{Estagio:stageName,Status:latestExecution.status}' --output table
```

A aprovação manual chega por e-mail no estágio `Aprovacao`. Depois do `Deploy`:

```bash
curl -s https://SEU-DOMINIO/api/health     # {"status":"ok"}
curl -s https://SEU-DOMINIO/api/config     # authMode cognito, userPoolId, clientId
```

Abra o domínio no navegador, cadastre-se (vai pedir e-mail, senha mestra e MFA por TOTP),
guarde o kit de recuperação e salve um acesso. Para comprovar o conhecimento zero na
apresentação, mostre que o banco só tem texto cifrado.

---

## Custo

Perfil do `prod.tfvars` atual (1 NAT, banco em uma AZ, 1 instância, 3 VPC endpoints),
em `us-east-2`:

| Item | US$/dia |
|---|---|
| NAT Gateway | 1,10 |
| 3 VPC endpoints de interface × 2 AZs | 0,50 |
| ALB | 0,60 |
| EC2 `t3.small` | 0,50 |
| RDS `db.t4g.micro` + 20 GB | 0,45 |
| WAF (2 Web ACLs + regras) | 0,63 |
| KMS, logs, CloudTrail, CloudFront, Secrets | ~0,40 |
| **Total** | **~US$ 3,70/dia → ~27 dias de crédito** |

Sem o perfil de laboratório (2 NAT, Multi-AZ, 2 instâncias, 9 endpoints) sobe para
~US$ 11/dia, ou 9 dias de crédito. A região obrigatória acabou ajudando: Ohio custa cerca de
30% menos que São Paulo, onde o mesmo perfil daria ~US$ 5,30/dia.

**Não existe "pausar".** O NAT Gateway, o ALB, o RDS e os endpoints cobram por hora
independentemente de uso. Para economizar entre a implantação e a apresentação, o caminho é
destruir e aplicar de novo (são ~25 minutos), ou pelo menos zerar o Auto Scaling, que
economiza só os US$ 0,50/dia da instância:

```bash
aws autoscaling update-auto-scaling-group --auto-scaling-group-name cofre-prod-app \
  --min-size 0 --desired-capacity 0 --region us-east-2
```

## Destruir depois da apresentação

O `prod.tfvars` já vem com `db_deletion_protection = false` e `audit_force_destroy = true`,
que são o que permite desfazer. Com os defaults de produção, o destroy falha.

```bash
cd infra
terraform destroy -var-file=env/prod.tfvars
```

Se o bucket de auditoria resistir (Object Lock em modo `GOVERNANCE`), apague as versões com
bypass e repita:

```bash
aws s3api list-object-versions --bucket cofre-prod-auditoria-918292980331 \
  --query '{Objects: Versions[].{Key:Key,VersionId:VersionId}}' > versoes.json
aws s3api delete-objects --bucket cofre-prod-auditoria-918292980331 \
  --delete file://versoes.json --bypass-governance-retention
```

O bucket do estado (`infra/bootstrap`) tem `prevent_destroy` e sobrevive de propósito — é o que
guarda o histórico. Apague-o à mão se quiser zerar tudo.

## Erros conhecidos

| Erro | Causa e solução |
|---|---|
| `explicit deny in a service control policy` | Passo 0 pendente. Não há contorno pelo IAM. |
| `Authentication error` / `10000` do provider Cloudflare | `CLOUDFLARE_API_TOKEN` ausente no ambiente, ou token sem permissão na zona (passo 1.4). |
| `record already exists` na Cloudflare | Já existe um registro com esse nome na zona. Apague o antigo no painel: o Terraform não assume registros que não criou. |
| ACM recusa emitir o certificado | Algum registro CAA na zona que não autorize a Amazon. A zona `yan.tec.br` não tem CAA (conferido), então não deve ocorrer. |
| Apply parado em `aws_acm_certificate_validation` | Os CNAMEs de validação não resolvem. Confira se a zona na Cloudflare é a do `cloudflare_zone_id` e se os nameservers dela estão ativos no registrador. |
| Site responde mas bloqueia todo acesso (403 do WAF) | Registro ficou *proxied* na Cloudflare. Mude para *DNS only* — ver a nota do passo 1. |
| `state snapshot was created by Terraform vX` | `terraform_version` no tfvars menor que a versão do primeiro apply. Já fixado em `1.14.9`. |
| `FreeTierRestrictionError` no RDS | A conta está no plano gratuito, que limita a retenção de backup. O `prod.tfvars` usa `db_backup_retention_days = 1`; o default do projeto (7) é recusado. |
| `VcpuLimitExceeded` | Improvável: a quota em us-east-2 é de 64 vCPUs (conferida). Em outras regiões da conta é 5. |
| `ParameterNotFound` em `/aws/service/ami-amazon-linux-latest/...` | Era o defeito corrigido em 21/11/2026 — a AMI agora vem de `data "aws_ami"` via `ec2:DescribeImages`. Se reaparecer, alguém reverteu `infra/compute.tf`. |
| Pipeline para em `Source` | Conexão do GitHub ainda *pending* (passo 6). |
| `Seguranca/SonarCloud` falha | Token não gravado no SSM (passo 7.2). |
| Health check do ALB falhando | Veja o log da instância com `aws logs tail /cofre-prod/app --region us-east-2`. O acesso à instância é por Session Manager (`aws ssm start-session --target ID`), sem SSH. |
