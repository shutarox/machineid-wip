# Lambda関数のデプロイパッケージを作成
data "archive_file" "lambda_log_monitor_zip" {
  type        = "zip"
  source_dir  = "/app/backend/lambda/ecs-log-monitor"
  output_path = "/app/backend/lambda/ecs-log-monitor.zip"
}

# 既存のECS用ロググループをデータ参照
data "aws_cloudwatch_log_group" "ecs_task" {
  name = "/ecs/${var.environment}-ecs-task-family-main"
}

# Lambda関数
resource "aws_lambda_function" "log_monitor" {
  filename         = data.archive_file.lambda_log_monitor_zip.output_path
  function_name    = "${var.environment}-log-monitor"
  role            = data.aws_iam_role.lambda_ecs_monitoring.arn
  handler         = "index.handler"
  source_code_hash = data.archive_file.lambda_log_monitor_zip.output_base64sha256
  runtime         = "nodejs22.x"
  timeout         = 60
  memory_size     = 256

  environment {
    variables = {
      SLACK_WEBHOOK_URL            = var.slack_webhook_url
      NOTIFICATION_INTERVAL_MINUTES = "10"
    }
  }

  tags = {
    Name = "log-monitor"
  }
}

# CloudWatch Logsサブスクリプションフィルター（Lambda直接接続）
resource "aws_cloudwatch_log_subscription_filter" "log_monitor_filter" {
  name            = "${var.environment}-log-monitor-filter"
  log_group_name  = "/ecs/${var.environment}-ecs-task-family-main"
  filter_pattern  = "{ $.type = \"error\" }"
  destination_arn = aws_lambda_function.log_monitor.arn

  depends_on = [aws_lambda_permission.allow_cloudwatch_logs]
}

# Lambda関数の実行権限をCloudWatch Logsに付与
resource "aws_lambda_permission" "allow_cloudwatch_logs" {
  statement_id  = "AllowExecutionFromCloudWatchLogs"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.log_monitor.function_name
  principal     = "logs.amazonaws.com"
  source_arn    = "${data.aws_cloudwatch_log_group.ecs_task.arn}:*"
}

# CloudWatch Logsグループ（Lambda関数のログ用）
resource "aws_cloudwatch_log_group" "lambda_log_monitor" {
  name              = "/aws/lambda/${aws_lambda_function.log_monitor.function_name}"
  retention_in_days = 14

  tags = {
    Name = "lambda-log-monitor-logs"
  }
}
