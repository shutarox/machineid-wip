# ECS Task Role Outputs
output "ecs_task_role_arn" {
  description = "ARN of the ECS task role"
  value       = aws_iam_role.ecs_task_role.arn
}

output "ecs_task_role_name" {
  description = "Name of the ECS task role"
  value       = aws_iam_role.ecs_task_role.name
}

# ECS Task Execution Role Outputs
output "ecs_task_execution_role_arn" {
  description = "ARN of the ECS task execution role"
  value       = aws_iam_role.ecs_task_execution_role.arn
}

output "ecs_task_execution_role_name" {
  description = "Name of the ECS task execution role"
  value       = aws_iam_role.ecs_task_execution_role.name
}

# RDS Monitoring Role Outputs
output "rds_monitoring_role_arn" {
  description = "ARN of the RDS monitoring role"
  value       = aws_iam_role.rds_monitoring.arn
}

output "rds_monitoring_role_name" {
  description = "Name of the RDS monitoring role"
  value       = aws_iam_role.rds_monitoring.name
}

# IAM Policy Outputs
output "tf_user_iam_policy_arn" {
  description = "ARN of the tf-user-iam policy"
  value       = aws_iam_policy.tf_user_iam.arn
}

output "tf_user_main_policy_arn" {
  description = "ARN of the tf-user-main policy"
  value       = aws_iam_policy.tf_user_main.arn
}

output "ecs_task_execution_logs_policy_arn" {
  description = "ARN of the ECS task execution logs policy"
  value       = aws_iam_policy.ecs_task_execution_logs.arn
}

# IAM User Outputs
output "tf_user_iam_name" {
  description = "Name of the tf-user-iam user"
  value       = aws_iam_user.tf_user_iam.name
}

output "tf_user_main_name" {
  description = "Name of the tf-user-main user"
  value       = aws_iam_user.tf_user_main.name
}

output "local_developer_name" {
  description = "Name of the local developer user"
  value       = var.create_local_developer ? aws_iam_user.local_developer[0].name : null
} 