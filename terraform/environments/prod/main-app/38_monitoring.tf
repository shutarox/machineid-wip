# 本番の異常を Slack へ流す 2 つの Lambda。
#
# **この構成には他に監視が無い。** ALB のヘルスチェックが落ちてもタスクが
# 起動・停止を繰り返すだけで誰も気づかず、アプリのエラーは CloudWatch Logs に
# 溜まるだけになる(実際に `/api/ping` の 500 で踏んだ。`docs/known-issues.md`)。
#
# ## webhook URL の扱い
#
# **値は terraform で持たない。** Lambda が実行時に SSM の SecureString を読む
# (`local.slack_webhook_ssm_parameter`)。terraform の変数や Lambda の環境変数に
# 入れると tfstate に平文で残るため — 雛形では実際に webhook URL が
# terraform の変数の `default` に書かれ、git 履歴に混入した。
#
# **未設定でも apply も実行も通る。** パラメータが無ければ Lambda は
# 「送信しません」とログに出して正常終了する。webhook を作る前に配線だけ入れておける。
#
# パラメータを作るとき(コンソールでも可):
#
#   aws ssm put-parameter --type SecureString --name /machineid-keys/SLACK_NOTICE_WEBHOOK_URL \
#     --value 'https://hooks.slack.com/services/...'
#
# 反映は次のコールドスタート以降(取得できた値だけ関数内にキャッシュする)。

#================================================= ECS のエラーログ → Slack

data "archive_file" "ecs_log_monitor" {
  type        = "zip"
  source_dir  = "${local.lambda_source_dir}/ecs-log-monitor"
  output_path = "${local.lambda_source_dir}/ecs-log-monitor.zip"
}

resource "aws_lambda_function" "ecs_log_monitor" {
  function_name    = "${local.name_prefix}-ecs-log-monitor"
  filename         = data.archive_file.ecs_log_monitor.output_path
  source_code_hash = data.archive_file.ecs_log_monitor.output_base64sha256
  role             = data.aws_iam_role.lambda_monitoring.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  timeout          = 60
  memory_size      = 256

  environment {
    variables = {
      SLACK_WEBHOOK_SSM_PARAMETER = local.slack_webhook_ssm_parameter
      # 同一内容のエラーを再通知するまでの間隔。関数のメモリ内で数えるので、
      # コールドスタートを挟むと数えなおしになる(重複はするが取りこぼさない側に倒す)
      NOTIFICATION_INTERVAL_MINUTES = "10"
    }
  }

  tags = {
    Name = "ecs-log-monitor"
  }
}

# **アプリのログ形式に依存している。** `backend/src/plugins/` のログ出力が
# `{"type":"error", ...}` を出さなくなるとフィルタが無言で何も拾わなくなる
resource "aws_cloudwatch_log_subscription_filter" "ecs_log_monitor" {
  name            = "${local.name_prefix}-ecs-log-monitor"
  log_group_name  = aws_cloudwatch_log_group.app.name
  filter_pattern  = "{ $.type = \"error\" }"
  destination_arn = aws_lambda_function.ecs_log_monitor.arn

  depends_on = [aws_lambda_permission.ecs_log_monitor_logs]
}

resource "aws_lambda_permission" "ecs_log_monitor_logs" {
  statement_id  = "AllowExecutionFromCloudWatchLogs"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ecs_log_monitor.function_name
  principal     = "logs.amazonaws.com"
  source_arn    = "${aws_cloudwatch_log_group.app.arn}:*"
}

resource "aws_cloudwatch_log_group" "ecs_log_monitor" {
  name              = "/aws/lambda/${aws_lambda_function.ecs_log_monitor.function_name}"
  retention_in_days = 14

  tags = {
    Name = "ecs-log-monitor-logs"
  }
}

#================================================= CloudWatch アラーム → SNS → Slack

resource "aws_sns_topic" "alarms" {
  name = "${local.name_prefix}-alarms"

  tags = {
    Name = "alarms"
  }
}

resource "aws_sns_topic_policy" "alarms" {
  arn = aws_sns_topic.alarms.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudWatchAlarms"
        Effect    = "Allow"
        Principal = { Service = "cloudwatch.amazonaws.com" }
        Action    = "SNS:Publish"
        Resource  = aws_sns_topic.alarms.arn

        Condition = {
          StringEquals = {
            "AWS:SourceOwner" = var.aws_account_id
          }
        }
      }
    ]
  })
}

data "archive_file" "alb_health_monitor" {
  type        = "zip"
  source_dir  = "${local.lambda_source_dir}/alb-health-monitor"
  output_path = "${local.lambda_source_dir}/alb-health-monitor.zip"
}

resource "aws_lambda_function" "alb_health_monitor" {
  function_name    = "${local.name_prefix}-alb-health-monitor"
  filename         = data.archive_file.alb_health_monitor.output_path
  source_code_hash = data.archive_file.alb_health_monitor.output_base64sha256
  role             = data.aws_iam_role.lambda_monitoring.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  timeout          = 60
  memory_size      = 256

  environment {
    variables = {
      SLACK_WEBHOOK_SSM_PARAMETER = local.slack_webhook_ssm_parameter
    }
  }

  tags = {
    Name = "alb-health-monitor"
  }
}

resource "aws_sns_topic_subscription" "alb_health_monitor" {
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.alb_health_monitor.arn
}

resource "aws_lambda_permission" "alb_health_monitor_sns" {
  statement_id  = "AllowExecutionFromSNS"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.alb_health_monitor.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.alarms.arn
}

resource "aws_cloudwatch_log_group" "alb_health_monitor" {
  name              = "/aws/lambda/${aws_lambda_function.alb_health_monitor.function_name}"
  retention_in_days = 14

  tags = {
    Name = "alb-health-monitor-logs"
  }
}

#================================================= アラーム
#
# **ここに足すのは「人が今すぐ知るべきこと」だけ。** 通知が多いと読まれなくなり、
# 監視が無いのと同じになる。CPU やメモリの逼迫は autoscaling が吸収するので入れない。

# 健全なターゲットがゼロ = 全断。`treat_missing_data = "ignore"` は
# デプロイ中の一時的な欠測で誤報を出さないため
resource "aws_cloudwatch_metric_alarm" "alb_no_healthy_host" {
  alarm_name          = "${local.name_prefix}-alb-no-healthy-host"
  alarm_description   = "ALB のターゲットグループに健全なホストが 1 台もありません"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HealthyHostCount"
  statistic           = "Minimum"
  comparison_operator = "LessThanThreshold"
  threshold           = 1
  period              = 60
  evaluation_periods  = 1
  treat_missing_data  = "ignore"

  # **復旧も通知する。** 落ちた通知だけだと、直ったかどうかが分からない
  alarm_actions = [aws_sns_topic.alarms.arn]
  ok_actions    = [aws_sns_topic.alarms.arn]

  dimensions = {
    TargetGroup  = data.aws_lb_target_group.api.arn_suffix
    LoadBalancer = data.aws_lb.main.arn_suffix
  }

  tags = {
    Name = "alb-no-healthy-host"
  }
}

# デプロイしたタスクが起動に失敗して circuit breaker が戻したとき。
# deploy スクリプトは待たずに戻るので、これが無いと失敗に気づけない
resource "aws_cloudwatch_metric_alarm" "ecs_task_failure" {
  alarm_name          = "${local.name_prefix}-ecs-task-failure"
  alarm_description   = "ECS タスクの起動に失敗しています(デプロイのロールバックを含む)"
  namespace           = "AWS/ECS"
  metric_name         = "FailedTasks"
  statistic           = "Sum"
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  period              = 60
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alarms.arn]

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.main.name
  }

  tags = {
    Name = "ecs-task-failure"
  }
}
