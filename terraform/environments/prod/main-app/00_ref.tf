# base / iam / main スタックのリソースを参照する

data "aws_vpc" "main" {
  tags = {
    Name = "vpc"
  }
}

# **public サブネットに配置する**(NAT を置かないため。ADR 20260806-aws-minimal-prod.md)。
# private + NAT へ移すときは、ここを private サブネットに変え
# assign_public_ip = false にするだけでローリング更新で切り替わる
data "aws_subnet" "public_1a" {
  vpc_id = data.aws_vpc.main.id

  tags = {
    Name = "subnet-public-${var.aws_region}a"
  }
}

data "aws_subnet" "public_1c" {
  vpc_id = data.aws_vpc.main.id

  tags = {
    Name = "subnet-public-${var.aws_region}c"
  }
}

data "aws_security_group" "is_app" {
  vpc_id = data.aws_vpc.main.id

  tags = {
    Name = "sg-is-app"
  }
}

data "aws_iam_role" "ecs_task_execution" {
  name = "${local.name_prefix}-ecs-task-execution-role"
}

data "aws_iam_role" "ecs_task" {
  name = "${local.name_prefix}-ecs-task-role"
}

data "aws_iam_role" "eventbridge_ecs" {
  name = "${local.name_prefix}-eventbridge-ecs-role"
}

data "aws_ecr_repository" "main" {
  name = "${var.project_name}-app-${var.environment}"
}

data "aws_lb_target_group" "api" {
  name = "${local.name_prefix}-tg-api"
}

data "aws_lb" "main" {
  name = "${local.name_prefix}-alb"
}

data "aws_iam_role" "lambda_monitoring" {
  name = "${local.name_prefix}-lambda-monitoring-role"
}
