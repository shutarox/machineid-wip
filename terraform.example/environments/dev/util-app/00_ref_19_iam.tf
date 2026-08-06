data "aws_iam_role" "ecs_task_execution_role" {
  name = "terraform-ecs-task-execution-role"
}

data "aws_iam_role" "ecs_task_role" {
  name = "terraform-ecs-task-role"
}
