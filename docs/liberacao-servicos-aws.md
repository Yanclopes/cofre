# Restrições da conta AWS e como liberá-las

Levantamento das Service Control Policies que limitam a conta usada no trabalho, feito em
**21/11/2026** por teste direto contra a API. O projeto **roda** com essas restrições — a
região passou a ser `us-east-2` e dois serviços de detecção ficaram de fora. Este documento
registra o que foi constatado, o impacto e o procedimento para liberar o que falta.

## 1. A conta

| Dado | Valor |
|---|---|
| Conta do projeto | `918292980331` ("Greenfield Adventures", criada em 10/11/2026) |
| Usuário IAM | `Yan`, com `AdministratorAccess` anexado |
| Organização | `o-ygo7jkxcbu` |
| Conta de gerenciamento | `532262115249` (`bernardo.santos@unidavi.edu.br`) |
| SCPs que negam | `p-szvu9431` (restrição por região) e `p-uqgresae` (GuardDuty) |

O `AdministratorAccess` não contorna nada: uma SCP é avaliada antes da política de IAM, e um
`Deny` nela vence qualquer `Allow`. Nem o usuário root da conta-membro passa.

## 2. O que a restrição realmente é

A primeira leitura — "a conta não pode usar EC2, RDS, Cognito, KMS…" — estava incompleta. O
teste da mesma chamada (`ec2:DescribeVpcs`) em oito regiões mostrou que o deny é **por região**:

| Região | Resultado |
|---|---|
| `us-east-2` (Ohio) | **permitido** |
| `us-east-1`, `us-west-2` | negado por SCP |
| `eu-west-1`, `eu-central-1` | negado por SCP |
| `ap-southeast-1`, `ca-central-1` | negado por SCP |
| `sa-east-1` (São Paulo) | negado por SCP |

Em `us-east-2`, todos os serviços do projeto responderam: EC2/VPC, RDS, Cognito, KMS, ELB,
Auto Scaling, Secrets Manager, SSM, SNS, CloudTrail, CodePipeline, CodeBuild, CodeDeploy,
CodeConnections e WAF. Os serviços globais ou de borda (CloudFront, ACM e WAF em `us-east-1`,
S3, IAM, CloudWatch Logs) funcionam independentemente da região.

Duas exceções continuam negadas **em todas as regiões**, porque o deny delas não é regional:

| Serviço | Onde o projeto usa | Contorno aplicado |
|---|---|---|
| `guardduty` | `infra/audit.tf` | `enable_guardduty = false` |
| `securityhub` | `infra/audit.tf` | `enable_securityhub = false` |

Além das SCPs, a conta está no **plano gratuito** da AWS, que impõe limites próprios. O
apply de 21/11/2026 foi recusado com `FreeTierRestrictionError` ao criar o RDS com os 7 dias
de retenção de backup do projeto; com `db_backup_retention_days = 1` o banco foi criado. Esse
limite não vem das SCPs e não se resolve na conta de gerenciamento — depende de migrar a
conta para um plano pago.

Também é negado `route53domains` (*"Free Tier accounts are not supported for this service"*),
mas isso não afeta o projeto: o domínio é registrado na Cloudflare, que responde pelo DNS.
Nem `route53` nem `route53domains` são necessários.

## 3. Impacto no projeto

| Item | Situação |
|---|---|
| `terraform plan` | passa, propondo **149 recursos sem erro** |
| Região | `us-east-2` em vez de `sa-east-1`; a nota em [arquitetura.md](arquitetura.md) explica a consequência |
| Custo | caiu: Ohio é ~30% mais barata, ~US$ 3,70/dia em vez de ~US$ 5,30 |
| Detecção de ameaças | GuardDuty e Security Hub ausentes. CloudTrail, os alarmes de `monitoring.tf` e o WAF seguem ativos |
| Quota de vCPU | 64 em `us-east-2`, contra 5 nas demais regiões da conta |

A premissa de conhecimento zero não é afetada pela mudança de região: o que sai do país é
cofre cifrado, e a chave só existe no navegador do usuário.

## 4. Como liberar o que falta

Só é possível a partir da **conta de gerenciamento** (`532262115249`). Confirme que é nela
que você está:

```bash
aws sts get-caller-identity --profile CONTA_DE_GERENCIAMENTO   # Account deve ser 532262115249
```

Depois levante o conteúdo e, principalmente, **onde cada política está anexada** — é isso que
determina o que pode ser feito:

```bash
aws organizations describe-policy --policy-id p-szvu9431 --query 'Policy.Content' --output text
aws organizations list-targets-for-policy --policy-id p-szvu9431
aws organizations list-targets-for-policy --policy-id p-uqgresae
```

| Onde está anexada | O que fazer |
|---|---|
| Na conta `918292980331`, ou numa OU que contém só ela | `aws organizations detach-policy --policy-id p-szvu9431 --target-id 918292980331` — simples e reversível |
| Na **root** da organização | **Não desanexe:** afetaria todas as contas da instituição. Condicione o `Deny` para isentar só esta conta |

A edição cirúrgica consiste em acrescentar `aws:PrincipalAccount` à `Condition` do `Statement`
de `Deny`. As chaves dentro de uma mesma `Condition` se combinam com **E**, então o deny passa
a valer apenas quando a região não é permitida **e** o principal não pertence a esta conta:

```json
"Condition": {
  "StringNotEquals": {
    "aws:RequestedRegion": ["us-east-2"],
    "aws:PrincipalAccount": "918292980331"
  }
}
```

Pelo console, o caminho é o mesmo: **AWS Organizations → Policies → Service control policies**
→ a política → aba *Targets* para ver os alvos, *Edit* para o JSON.

Lembre-se de que `Deny` em SCP não se resolve adicionando `Allow` em lugar nenhum: é preciso
remover ou condicionar o próprio deny.

## 5. Texto sugerido, caso o pedido vá para o administrador

> Assunto: Conta AWS 918292980331 — liberação de região e de dois serviços
>
> Prof. Bernardo, bom dia.
>
> Estou usando a conta 918292980331 para o trabalho de Auditoria e Segurança de Sistemas: um
> gerenciador de senhas com arquitetura de conhecimento zero, com a infraestrutura descrita em
> Terraform (https://github.com/Yanclopes/cofre).
>
> Identifiquei que as Service Control Policies da organização (p-szvu9431 e p-uqgresae)
> permitem apenas a região us-east-2 e negam o GuardDuty e o Security Hub em todas elas.
> Consegui adaptar o projeto e ele já roda em us-east-2, então não há urgência — o pedido é
> para aproximá-lo do que a documentação descreve:
>
> 1. Liberar a região sa-east-1 (São Paulo), para que os dados fiquem no Brasil, o que importa
>    no enquadramento do trabalho;
> 2. Liberar GuardDuty e Security Hub, que são dois dos controles de detecção documentados.
>
> O dimensionamento é mínimo (uma instância t3.small, banco db.t4g.micro, um NAT Gateway), com
> custo de ~US$ 3,70 por dia dentro dos US$ 100 de crédito da conta, e eu destruo a
> infraestrutura após a apresentação. Se a liberação envolver risco para as outras contas da
> organização, uma exceção condicionada apenas à minha conta resolve — posso indicar como.
>
> Obrigado,
> Yan Capistrano Lopes

## 6. Nota de auditoria

Vale registrar o episódio na apresentação. A mensagem de erro inicial sugeria que a conta não
tinha acesso aos serviços; o diagnóstico mostrou que o controle era **regional**, e a diferença
entre as duas leituras é a diferença entre "o projeto não pode subir" e "o projeto sobe em
outra região". Mapear o alcance real de um controle de acesso — em vez de aceitar a primeira
negativa — é exatamente o exercício da disciplina. O método foi repetir a mesma chamada
variando uma dimensão por vez (região, depois serviço) e ler a política citada na mensagem de
negação.
