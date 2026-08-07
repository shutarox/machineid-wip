output "ecs_task_execution_role_arn" {
  value = aws_iam_role.ecs_task_execution.arn
}

output "ecs_task_role_arn" {
  value = aws_iam_role.ecs_task.arn
}

output "eventbridge_ecs_role_arn" {
  value = aws_iam_role.eventbridge_ecs.arn
}

output "lambda_monitoring_role_arn" {
  value = aws_iam_role.lambda_monitoring.arn
}
