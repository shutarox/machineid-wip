# EventBridge用IAMポリシー（ECSタスクを実行する権限）
# ロール本体はIAMモジュールで定義（terraform-eventbridge-ecs-role）
resource "aws_iam_role_policy" "eventbridge_ecs_policy" {
  name = "${var.environment}-eventbridge-ecs-policy"
  role = data.aws_iam_role.eventbridge_ecs_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecs:RunTask"
        ]
        # 全リビジョンを許可（タスク定義更新時の権限エラーを防ぐ）
        Resource = "${aws_ecs_task_definition.main.arn_without_revision}:*"
        Condition = {
          ArnLike = {
            "ecs:cluster" = aws_ecs_cluster.main.arn
          }
        }
      },
      {
        Effect = "Allow"
        Action = [
          "iam:PassRole"
        ]
        Resource = [
          data.aws_iam_role.ecs_task_execution_role.arn,
          data.aws_iam_role.ecs_task_role.arn
        ]
      }
    ]
  })
}

# 定期実行スクリプトの雛形。
#
# 報告書に添付されないまま放置された仮アップロード画像を、3日後にS3とDBから回収する
# （backend/script/cleanup_uploads.ts）。案件固有のバッチを足すときは、このリソース2つ
# （aws_cloudwatch_event_rule / aws_cloudwatch_event_target）を写して名前とcommandを変える。
#
# NAT GW データ転送費がかかるので、実行頻度は必要最小限にすること。
resource "aws_cloudwatch_event_rule" "cleanup_uploads" {
  name                = "${var.environment}-cleanup-uploads-schedule"
  description         = "1日1回 cleanup_uploads スクリプトを実行"
  schedule_expression = "cron(0 18 * * ? *)" # UTC 18:00 = JST 03:00

  tags = {
    Name = "cleanup-uploads-schedule"
  }
}

# EventBridgeターゲット（ECSタスク）
resource "aws_cloudwatch_event_target" "cleanup_uploads" {
  rule      = aws_cloudwatch_event_rule.cleanup_uploads.name
  target_id = "cleanup-uploads-ecs-task"
  arn       = aws_ecs_cluster.main.arn
  role_arn  = data.aws_iam_role.eventbridge_ecs_role.arn

  ecs_target {
    task_definition_arn = aws_ecs_task_definition.main.arn
    task_count          = 1
    launch_type         = "FARGATE"
    platform_version    = "LATEST"

    network_configuration {
      subnets          = [data.aws_subnet.private_1a.id, data.aws_subnet.private_1c.id]
      security_groups  = [data.aws_security_group.is_app.id]
      assign_public_ip = false
    }
  }

  input = jsonencode({
    containerOverrides = [
      {
        name    = var.container_name
        command = ["node", "/app/backend/build/script/cleanup_uploads.js"]
      }
    ]
  })
}
