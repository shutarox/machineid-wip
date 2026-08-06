# Lambda関数用のIAMロール
resource "aws_iam_role" "lambda_ecs_monitoring" {
  name = "terraform-lambda-ecs-monitoring-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "terraform-lambda-ecs-monitoring-role"
  }
}

# Lambda関数用のIAMポリシー（AWSLambdaBasicExecutionRoleをアタッチ）
resource "aws_iam_role_policy_attachment" "lambda_ecs_monitoring" {
  role       = aws_iam_role.lambda_ecs_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}
