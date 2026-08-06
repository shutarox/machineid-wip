output "cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "service_name" {
  value = aws_ecs_service.main.name
}

output "container_name" {
  value = local.container_name
}

output "task_definition_arn" {
  description = "deploy スクリプトが run-task(migrate)と update-service に使う"
  value       = aws_ecs_task_definition.main.arn
}

output "task_network_configuration" {
  description = "run-task に渡す awsvpcConfiguration"
  value = {
    subnets          = [data.aws_subnet.public_1a.id, data.aws_subnet.public_1c.id]
    security_groups  = [data.aws_security_group.is_app.id]
    assign_public_ip = "ENABLED"
  }
}
