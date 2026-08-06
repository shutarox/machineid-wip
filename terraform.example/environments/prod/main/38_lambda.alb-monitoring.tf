# SNSトピック（ALBヘルスチェック通知用）
resource "aws_sns_topic" "alb_health_check" {
  name = "${var.environment}-alb-health-check"

  tags = {
    Name = "alb-health-check-notifications"
  }
}

# SNSトピックポリシー（CloudWatchアラームからの通知を許可）
resource "aws_sns_topic_policy" "alb_health_check" {
  arn = aws_sns_topic.alb_health_check.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudWatchAlarms"
        Effect = "Allow"
        Principal = {
          AWS = "*"
        }
        Action   = "SNS:Publish"
        Resource = aws_sns_topic.alb_health_check.arn
        Condition = {
          ArnLike = {
            "aws:SourceArn": "arn:aws:cloudwatch:${var.aws_region}:${var.aws_account_id}:alarm:*"
          }
        }
      },
      {
        Sid    = "AllowAccountAccess"
        Effect = "Allow"
        Principal = {
          AWS = "*"
        }
        Action = [
          "SNS:GetTopicAttributes",
          "SNS:SetTopicAttributes",
          "SNS:AddPermission",
          "SNS:RemovePermission",
          "SNS:DeleteTopic",
          "SNS:Subscribe",
          "SNS:ListSubscriptionsByTopic",
          "SNS:Publish"
        ]
        Resource = aws_sns_topic.alb_health_check.arn
        Condition = {
          StringEquals = {
            "AWS:SourceOwner" = var.aws_account_id
          }
        }
      }
    ]
  })
}

# Lambda関数のデプロイパッケージを作成
data "archive_file" "alb_health_monitor_zip" {
  type        = "zip"
  source_dir  = "/app/backend/lambda/alb-health-monitor"
  output_path = "/app/backend/lambda/alb-health-monitor.zip"
}

# Lambda関数
resource "aws_lambda_function" "alb_health_monitor" {
  filename         = data.archive_file.alb_health_monitor_zip.output_path
  function_name    = "${var.environment}-alb-health-monitor"
  role            = data.aws_iam_role.lambda_ecs_monitoring.arn
  handler         = "index.handler"
  source_code_hash = data.archive_file.alb_health_monitor_zip.output_base64sha256
  runtime         = "nodejs22.x"
  timeout         = 60
  memory_size     = 256

  environment {
    variables = {
      SLACK_WEBHOOK_URL = var.slack_webhook_url
    }
  }

  tags = {
    Name = "alb-health-monitor"
  }
}

# SNSトピックサブスクリプション（Lambda経由でSlack通知）
resource "aws_sns_topic_subscription" "alb_health_check_lambda" {
  topic_arn = aws_sns_topic.alb_health_check.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.alb_health_monitor.arn
}

# Lambda関数の実行権限をSNSトピックに付与
resource "aws_lambda_permission" "allow_sns" {
  statement_id  = "AllowExecutionFromSNS"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.alb_health_monitor.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.alb_health_check.arn
}

# CloudWatch Logsグループ（Lambda関数のログ用）
resource "aws_cloudwatch_log_group" "alb_health_monitor" {
  name              = "/aws/lambda/${aws_lambda_function.alb_health_monitor.function_name}"
  retention_in_days = 14

  tags = {
    Name = "alb-health-monitor-logs"
  }
}

# ALBターゲットグループのヘルスチェック失敗アラーム
resource "aws_cloudwatch_metric_alarm" "alb_health_check_failure" {
  alarm_name          = "${var.environment}-alb-health-check-failure"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "HealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = "30"
  statistic           = "Minimum"
  threshold           = "1"
  alarm_description   = "ALBターゲットグループのヘルスチェック失敗"
  alarm_actions       = [aws_sns_topic.alb_health_check.arn]
  ok_actions          = [aws_sns_topic.alb_health_check.arn]
  treat_missing_data  = "ignore"

  dimensions = {
    TargetGroup  = aws_lb_target_group.api.arn_suffix
    LoadBalancer = aws_lb.main.arn_suffix
  }

  tags = {
    Name = "alb-health-check-failure"
  }
}

# ECSデプロイ失敗アラーム
resource "aws_cloudwatch_metric_alarm" "ecs_deployment_failure" {
  alarm_name          = "${var.environment}-ecs-deployment-failure"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "FailedTasks"
  namespace           = "AWS/ECS"
  period              = "60"
  statistic           = "Sum"
  threshold           = "0"
  alarm_description   = "ECSデプロイメントが失敗し、ロールバックが発生しました"
  alarm_actions       = [aws_sns_topic.alb_health_check.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    ClusterName = "${var.environment}-ecs-cluster-main"
    ServiceName = "${var.environment}-ecs-service-main"
  }

  tags = {
    Name = "ecs-deployment-failure"
  }
}

