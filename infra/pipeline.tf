# =====================================================================
# CI/CD: GitHub -> SAST + scan do Terraform -> plan -> aprovação -> apply -> build -> deploy
# Cada estágio roda com um papel IAM próprio (menor privilégio).
# =====================================================================

# Após o primeiro apply, conclua a conexão no console (Developer Tools > Connections).
resource "aws_codestarconnections_connection" "github" {
  name          = "${local.name}-github"
  provider_type = "GitHub"
}

# ---------------------------------------------------------------- bucket de artefatos
resource "aws_s3_bucket" "artifacts" {
  #checkov:skip=CKV2_AWS_62:Sem notificações de evento para artefatos temporários
  #checkov:skip=CKV_AWS_144:Replicação entre regiões fora do escopo
  #checkov:skip=CKV_AWS_18:Artefatos temporários; acessos ficam no CloudTrail
  bucket        = "${local.name}-artefatos-${local.account_id}"
  force_destroy = true
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.ops.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    id     = "limpar"
    status = "Enabled"
    filter {}
    expiration {
      days = 90
    }
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_s3_bucket_policy" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "SomenteTls"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.artifacts.arn, "${aws_s3_bucket.artifacts.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

# ---------------------------------------------------------------- papéis
data "aws_iam_policy_document" "codebuild_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["codebuild.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
}

locals {
  build_log_group = "/${local.name}/codebuild"

  # Permissões comuns a todo job de build: logs, artefatos e a chave de operação.
  build_base_statements = [
    {
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "${aws_cloudwatch_log_group.codebuild.arn}:*"
    },
    {
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:GetObjectVersion", "s3:PutObject", "s3:GetBucketLocation"]
      Resource = [aws_s3_bucket.artifacts.arn, "${aws_s3_bucket.artifacts.arn}/*"]
    },
    {
      Effect   = "Allow"
      Action   = ["kms:Decrypt", "kms:GenerateDataKey", "kms:DescribeKey"]
      Resource = aws_kms_key.ops.arn
    },
    {
      Effect   = "Allow"
      Action   = ["codebuild:CreateReportGroup", "codebuild:CreateReport", "codebuild:UpdateReport", "codebuild:BatchPutTestCases"]
      Resource = "arn:${local.partition}:codebuild:${var.region}:${local.account_id}:report-group/${local.name}-*"
    },
  ]

  # Estado do Terraform: leitura e escrita no bucket (inclui o arquivo de lock).
  state_statements = [
    {
      Effect   = "Allow"
      Action   = ["s3:ListBucket"]
      Resource = "arn:${local.partition}:s3:::${var.state_bucket}"
    },
    {
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
      Resource = "arn:${local.partition}:s3:::${var.state_bucket}/*"
    },
  ]
}

resource "aws_cloudwatch_log_group" "codebuild" {
  name              = local.build_log_group
  retention_in_days = 365
  kms_key_id        = aws_kms_key.ops.arn
}

# Papel dos jobs que só leem o código (SAST, scan do Terraform, build da aplicação).
resource "aws_iam_role" "build" {
  name               = "${local.name}-build"
  assume_role_policy = data.aws_iam_policy_document.codebuild_assume.json
}

resource "aws_iam_role_policy" "build" {
  role   = aws_iam_role.build.id
  policy = jsonencode({ Version = "2012-10-17", Statement = local.build_base_statements })
}

# Papel do terraform plan: só leitura na conta + estado.
resource "aws_iam_role" "tf_plan" {
  name               = "${local.name}-tf-plan"
  assume_role_policy = data.aws_iam_policy_document.codebuild_assume.json
}

resource "aws_iam_role_policy_attachment" "tf_plan_readonly" {
  role       = aws_iam_role.tf_plan.name
  policy_arn = "arn:${local.partition}:iam::aws:policy/ReadOnlyAccess"
}

resource "aws_iam_role_policy" "tf_plan" {
  role   = aws_iam_role.tf_plan.id
  policy = jsonencode({ Version = "2012-10-17", Statement = concat(local.build_base_statements, local.state_statements) })
}

# Papel do terraform apply: o único que altera a infraestrutura. Só roda depois da aprovação manual.
resource "aws_iam_role" "tf_apply" {
  name               = "${local.name}-tf-apply"
  assume_role_policy = data.aws_iam_policy_document.codebuild_assume.json
}

resource "aws_iam_role_policy_attachment" "tf_apply_admin" {
  #checkov:skip=CKV_AWS_274:O apply cria IAM, KMS, VPC etc.; acesso amplo restrito a este papel, usado só após aprovação
  role       = aws_iam_role.tf_apply.name
  policy_arn = "arn:${local.partition}:iam::aws:policy/AdministratorAccess"
}

# ---------------------------------------------------------------- projetos CodeBuild
locals {
  codebuild_projects = {
    sast     = { role = aws_iam_role.build.arn, buildspec = "pipeline/buildspecs/sast.yml", description = "SAST com Semgrep no codigo da aplicacao" }
    tf-scan  = { role = aws_iam_role.build.arn, buildspec = "pipeline/buildspecs/tf-scan.yml", description = "terraform fmt/validate + Checkov" }
    tf-plan  = { role = aws_iam_role.tf_plan.arn, buildspec = "pipeline/buildspecs/tf-plan.yml", description = "terraform plan" }
    tf-apply = { role = aws_iam_role.tf_apply.arn, buildspec = "pipeline/buildspecs/tf-apply.yml", description = "terraform apply do plano aprovado" }
    build    = { role = aws_iam_role.build.arn, buildspec = "pipeline/buildspecs/build.yml", description = "Testes e build do NestJS e do React" }
  }
}

resource "aws_codebuild_project" "jobs" {
  for_each       = local.codebuild_projects
  name           = "${local.name}-${each.key}"
  description    = each.value.description
  service_role   = each.value.role
  build_timeout  = 30
  encryption_key = aws_kms_key.ops.arn

  artifacts {
    type = "CODEPIPELINE"
  }

  environment {
    compute_type    = "BUILD_GENERAL1_SMALL"
    image           = "aws/codebuild/amazonlinux-x86_64-standard:5.0"
    type            = "LINUX_CONTAINER"
    privileged_mode = false

    environment_variable {
      name  = "TF_VERSION"
      value = var.terraform_version
    }
  }

  source {
    type      = "CODEPIPELINE"
    buildspec = each.value.buildspec
  }

  logs_config {
    cloudwatch_logs {
      group_name = aws_cloudwatch_log_group.codebuild.name
    }
  }
}

# ---------------------------------------------------------------- CodeDeploy (publicação nas EC2)
resource "aws_iam_role" "codedeploy" {
  name = "${local.name}-codedeploy"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "codedeploy.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "codedeploy" {
  role       = aws_iam_role.codedeploy.name
  policy_arn = "arn:${local.partition}:iam::aws:policy/service-role/AWSCodeDeployRole"
}

resource "aws_codedeploy_app" "app" {
  name             = "${local.name}-app"
  compute_platform = "Server"
}

resource "aws_codedeploy_deployment_group" "app" {
  app_name               = aws_codedeploy_app.app.name
  deployment_group_name  = "${local.name}-producao"
  service_role_arn       = aws_iam_role.codedeploy.arn
  deployment_config_name = "CodeDeployDefault.OneAtATime" # uma instância por vez: sem indisponibilidade
  autoscaling_groups     = [aws_autoscaling_group.app.name]

  deployment_style {
    deployment_option = "WITH_TRAFFIC_CONTROL"
    deployment_type   = "IN_PLACE"
  }

  load_balancer_info {
    target_group_info {
      name = aws_lb_target_group.app.name
    }
  }

  auto_rollback_configuration {
    enabled = true
    events  = ["DEPLOYMENT_FAILURE"]
  }
}

# ---------------------------------------------------------------- CodePipeline
resource "aws_iam_role" "codepipeline" {
  name = "${local.name}-codepipeline"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "codepipeline.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "codepipeline" {
  role = aws_iam_role.codepipeline.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:GetObjectVersion", "s3:PutObject", "s3:GetBucketVersioning"]
        Resource = [aws_s3_bucket.artifacts.arn, "${aws_s3_bucket.artifacts.arn}/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Decrypt", "kms:GenerateDataKey", "kms:DescribeKey"]
        Resource = aws_kms_key.ops.arn
      },
      {
        Effect   = "Allow"
        Action   = ["codestar-connections:UseConnection", "codeconnections:UseConnection"]
        Resource = aws_codestarconnections_connection.github.arn
      },
      {
        Effect   = "Allow"
        Action   = ["codebuild:StartBuild", "codebuild:BatchGetBuilds"]
        Resource = [for p in aws_codebuild_project.jobs : p.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "codedeploy:CreateDeployment", "codedeploy:GetDeployment", "codedeploy:GetDeploymentConfig",
          "codedeploy:GetApplication", "codedeploy:GetApplicationRevision", "codedeploy:RegisterApplicationRevision",
        ]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["sns:Publish"]
        Resource = aws_sns_topic.alerts.arn
      },
    ]
  })
}

resource "aws_codepipeline" "main" {
  name          = "${local.name}-pipeline"
  role_arn      = aws_iam_role.codepipeline.arn
  pipeline_type = "V2"

  artifact_store {
    location = aws_s3_bucket.artifacts.bucket
    type     = "S3"
    encryption_key {
      id   = aws_kms_key.ops.arn
      type = "KMS"
    }
  }

  stage {
    name = "Source"
    action {
      name             = "GitHub"
      category         = "Source"
      owner            = "AWS"
      provider         = "CodeStarSourceConnection"
      version          = "1"
      output_artifacts = ["source"]
      configuration = {
        ConnectionArn    = aws_codestarconnections_connection.github.arn
        FullRepositoryId = var.github_repository
        BranchName       = var.github_branch
      }
    }
  }

  # Quality gate: os dois rodam em paralelo; qualquer achado crítico/alto para a pipeline aqui.
  stage {
    name = "Seguranca"
    action {
      name            = "SAST"
      category        = "Test"
      owner           = "AWS"
      provider        = "CodeBuild"
      version         = "1"
      input_artifacts = ["source"]
      configuration   = { ProjectName = aws_codebuild_project.jobs["sast"].name }
    }
    action {
      name            = "TerraformScan"
      category        = "Test"
      owner           = "AWS"
      provider        = "CodeBuild"
      version         = "1"
      input_artifacts = ["source"]
      configuration   = { ProjectName = aws_codebuild_project.jobs["tf-scan"].name }
    }
  }

  stage {
    name = "TerraformPlan"
    action {
      name             = "Plan"
      category         = "Build"
      owner            = "AWS"
      provider         = "CodeBuild"
      version          = "1"
      input_artifacts  = ["source"]
      output_artifacts = ["plan"]
      configuration    = { ProjectName = aws_codebuild_project.jobs["tf-plan"].name }
    }
  }

  stage {
    name = "Aprovacao"
    action {
      name     = "RevisarPlan"
      category = "Approval"
      owner    = "AWS"
      provider = "Manual"
      version  = "1"
      configuration = {
        NotificationArn = aws_sns_topic.alerts.arn
        CustomData      = "Revise o resultado do terraform plan (logs do estagio TerraformPlan) antes de aprovar."
      }
    }
  }

  stage {
    name = "TerraformApply"
    action {
      name            = "Apply"
      category        = "Build"
      owner           = "AWS"
      provider        = "CodeBuild"
      version         = "1"
      input_artifacts = ["source", "plan"]
      configuration = {
        ProjectName   = aws_codebuild_project.jobs["tf-apply"].name
        PrimarySource = "source"
      }
    }
  }

  stage {
    name = "BuildAplicacao"
    action {
      name             = "Build"
      category         = "Build"
      owner            = "AWS"
      provider         = "CodeBuild"
      version          = "1"
      input_artifacts  = ["source"]
      output_artifacts = ["bundle"]
      configuration    = { ProjectName = aws_codebuild_project.jobs["build"].name }
    }
  }

  stage {
    name = "Deploy"
    action {
      name            = "CodeDeploy"
      category        = "Deploy"
      owner           = "AWS"
      provider        = "CodeDeploy"
      version         = "1"
      input_artifacts = ["bundle"]
      configuration = {
        ApplicationName     = aws_codedeploy_app.app.name
        DeploymentGroupName = aws_codedeploy_deployment_group.app.deployment_group_name
      }
    }
  }
}
