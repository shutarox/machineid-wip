output "vpc_id" {
  value = aws_vpc.main.id
}

output "public_subnet_ids" {
  value = [aws_subnet.public_1a.id, aws_subnet.public_1c.id]
}

output "private_subnet_ids" {
  value = [aws_subnet.private_1a.id, aws_subnet.private_1c.id]
}

output "security_group_ids" {
  value = {
    alb = aws_security_group.is_alb.id
    app = aws_security_group.is_app.id
    rds = aws_security_group.is_rds.id
  }
}

output "db_endpoint" {
  description = "アプリからは db-pg.<local_domain_name> で参照する。こちらは確認用"
  value       = aws_db_instance.main.address
}

output "db_host" {
  description = "タスク定義の DB_HOST に渡す値"
  value       = aws_route53_record.db_pg.name
}
