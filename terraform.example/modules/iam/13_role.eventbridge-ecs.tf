# EventBridge用IAMロール（ECSタスクを実行する権限）
resource "aws_iam_role" "eventbridge_ecs_role" {
  name = "terraform-eventbridge-ecs-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "events.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "terraform-eventbridge-ecs-role"
  }
}


