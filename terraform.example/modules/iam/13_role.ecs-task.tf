# ECS Task Role
resource "aws_iam_role" "ecs_task_role" {
  name = "terraform-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "terraform-ecs-task-role"
  }
}

# SSM ReadOnly Access Policy Attachment
resource "aws_iam_role_policy_attachment" "ecs_task_role_ssm_readonly" {
  role       = aws_iam_role.ecs_task_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMReadOnlyAccess"
} 