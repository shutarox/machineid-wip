# EventBridge → ECS RunTask による定期実行
#
# **ここに置くのは「重い・低頻度」のジョブだけ。**
# 軽くて高頻度のものは API プロセス内のスケジューラで回す
# (ADR 20260806-deploy-and-scheduled-jobs.md 決定 4)。
# Fargate はタスクごとに最小 1 分の課金 + 毎回のイメージ pull が発生するため、
# 5 分毎のような頻度をここで回すと割に合わない。

resource "aws_iam_role_policy" "eventbridge_ecs" {
  name = "${local.name_prefix}-eventbridge-ecs"
  role = data.aws_iam_role.eventbridge_ecs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["ecs:RunTask"]
        # 全リビジョンを許可(タスク定義更新時の権限エラーを防ぐ)
        Resource = "${aws_ecs_task_definition.main.arn_without_revision}:*"
        Condition = {
          ArnLike = {
            "ecs:cluster" = aws_ecs_cluster.main.arn
          }
        }
      },
      {
        Effect = "Allow"
        Action = ["iam:PassRole"]
        Resource = [
          data.aws_iam_role.ecs_task_execution.arn,
          data.aws_iam_role.ecs_task.arn,
        ]
      }
    ]
  })
}

# 仮アップロードの後始末(3 日タイムアウト)。1 日 1 回で十分な重いジョブの例
resource "aws_cloudwatch_event_rule" "cleanup_uploads" {
  name                = "${local.name_prefix}-cleanup-uploads"
  description         = "1 日 1 回 cleanup_uploads を実行する"
  schedule_expression = "cron(0 18 * * ? *)" # UTC 18:00 = JST 03:00

  tags = {
    Name = "cleanup-uploads-schedule"
  }
}

resource "aws_cloudwatch_event_target" "cleanup_uploads" {
  rule      = aws_cloudwatch_event_rule.cleanup_uploads.name
  target_id = "cleanup-uploads-ecs-task"
  arn       = aws_ecs_cluster.main.arn
  role_arn  = data.aws_iam_role.eventbridge_ecs.arn

  ecs_target {
    # **リビジョンを固定しない。** 固定すると、デプロイしても
    # 定期実行だけ古いイメージで走り続ける(雛形はここがリビジョン固定だった)
    task_definition_arn = aws_ecs_task_definition.main.arn_without_revision
    task_count          = 1
    launch_type         = "FARGATE"
    platform_version    = "LATEST"

    network_configuration {
      subnets = [
        data.aws_subnet.public_1a.id,
        data.aws_subnet.public_1c.id,
      ]

      security_groups  = [data.aws_security_group.is_app.id]
      assign_public_ip = true
    }
  }

  input = jsonencode({
    containerOverrides = [
      {
        name    = local.container_name
        command = ["node", "/app/backend/build/script/cleanup_uploads.js"]
      }
    ]
  })
}
