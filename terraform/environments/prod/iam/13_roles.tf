#================================================= ECS タスク実行ロール
#
# ECS エージェントが使う。イメージの pull・ログ出力・secrets の解決を行う。
# **アプリのコードが使うロールではない**(それは下の task role)

data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_task_execution" {
  name               = "${local.name_prefix}-ecs-task-execution-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json

  tags = {
    Name = "ecs-task-execution-role"
  }
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_managed" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# タスク定義の secrets(valueFrom)を解決するために必要。
# SecureString は KMS の既定キーで復号するので kms:Decrypt も要る
data "aws_iam_policy_document" "ecs_task_execution_ssm" {
  statement {
    actions   = ["ssm:GetParameters"]
    resources = [local.ssm_key_arn]
  }

  statement {
    actions   = ["kms:Decrypt"]
    resources = ["arn:aws:kms:${var.aws_region}:${var.aws_account_id}:key/*"]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${var.aws_region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "ecs_task_execution_ssm" {
  name   = "${local.name_prefix}-ecs-task-execution-ssm"
  role   = aws_iam_role.ecs_task_execution.id
  policy = data.aws_iam_policy_document.ecs_task_execution_ssm.json
}

#================================================= ECS タスクロール
#
# アプリのコードが使う。**静的アクセスキーの代わりがこれ**

resource "aws_iam_role" "ecs_task" {
  name               = "${local.name_prefix}-ecs-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json

  tags = {
    Name = "ecs-task-role"
  }
}

data "aws_iam_policy_document" "ecs_task" {
  # ECS Exec(aws ecs execute-command)。踏み台サーバの代わりなので必須
  statement {
    sid = "EcsExec"

    actions = [
      "ssmmessages:CreateControlChannel",
      "ssmmessages:CreateDataChannel",
      "ssmmessages:OpenControlChannel",
      "ssmmessages:OpenDataChannel",
    ]

    resources = ["*"]
  }

  # アップロード画像の読み書き。libs/storage.ts が使う
  statement {
    sid = "UploadsBucket"

    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
    ]

    resources = ["arn:aws:s3:::${var.s3_bucket_name_uploads}/*"]
  }

  statement {
    sid       = "UploadsBucketList"
    actions   = ["s3:ListBucket"]
    resources = ["arn:aws:s3:::${var.s3_bucket_name_uploads}"]
  }

  # メール送信(SES)
  statement {
    sid       = "SendEmail"
    actions   = ["ses:SendEmail", "ses:SendRawEmail"]
    resources = ["*"]
  }

  # 起動時に config.ts が SSM から設定を読む
  statement {
    sid       = "ReadConfig"
    actions   = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
    resources = [local.ssm_key_arn]
  }
}

resource "aws_iam_role_policy" "ecs_task" {
  name   = "${local.name_prefix}-ecs-task"
  role   = aws_iam_role.ecs_task.id
  policy = data.aws_iam_policy_document.ecs_task.json
}

#================================================= EventBridge → ECS RunTask
#
# 定期実行のうち「重い・低頻度」のものだけがここを通る。
# 軽い定期実行は API プロセス内のスケジューラで回す
# (ADR 20260806-deploy-and-scheduled-jobs.md)

data "aws_iam_policy_document" "eventbridge_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "eventbridge_ecs" {
  name               = "${local.name_prefix}-eventbridge-ecs-role"
  assume_role_policy = data.aws_iam_policy_document.eventbridge_assume.json

  tags = {
    Name = "eventbridge-ecs-role"
  }
}

# ポリシー本体(RunTask 対象のクラスタ / タスク定義に依存する)は
# main-app スタック側で aws_iam_role_policy として貼る。
# ここではロールだけ作り、参照を一方向(main-app → iam)に保つ

#================================================= 監視 Lambda
#
# ECS のエラーログと CloudWatch アラームを Slack へ流す 2 つの Lambda が使う
# (`main-app/38_monitoring.tf`)。**アプリのデータには一切触らない**ので、
# 権限はログ出力と Slack webhook の読み取りだけに絞る。

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda_monitoring" {
  name               = "${local.name_prefix}-lambda-monitoring-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json

  tags = {
    Name = "lambda-monitoring-role"
  }
}

resource "aws_iam_role_policy_attachment" "lambda_monitoring_basic" {
  role       = aws_iam_role.lambda_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# **webhook URL は Lambda が実行時に SSM から読む。**
# terraform の変数や Lambda の環境変数に値を入れると tfstate に平文で残るため
# (雛形では実際に webhook URL が git 履歴へ混入した)。
# ECS タスク実行ロールと違い `GetParameter`(単数)を使う
data "aws_iam_policy_document" "lambda_monitoring_ssm" {
  statement {
    actions   = ["ssm:GetParameter"]
    resources = [local.ssm_key_arn]
  }

  statement {
    actions   = ["kms:Decrypt"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "kms:EncryptionContext:PARAMETER_ARN"
      values   = [local.ssm_key_arn]
    }
  }
}

resource "aws_iam_role_policy" "lambda_monitoring_ssm" {
  name   = "${local.name_prefix}-lambda-monitoring-ssm"
  role   = aws_iam_role.lambda_monitoring.id
  policy = data.aws_iam_policy_document.lambda_monitoring_ssm.json
}
