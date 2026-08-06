# Aurora PostgreSQL クラスタ
resource "aws_rds_cluster" "main_pg" {
  cluster_identifier = "${var.environment}-db-cluster-pg"
  engine             = "aurora-postgresql"
  engine_version     = "17.4"
  master_username    = "postgres"
  master_password    = "initialpassword"

  storage_encrypted = true
  kms_key_id       = null  # 新規では自動生成KMSキーを使用

  # パスワードとKMSキーは初回以外は管理対象外
  lifecycle {
    ignore_changes = [master_password, kms_key_id]
  }

  db_subnet_group_name   = aws_db_subnet_group.main_pg.name
  vpc_security_group_ids = [aws_security_group.is_rds.id]

  # クラスタパラメータグループを指定
  db_cluster_parameter_group_name = aws_rds_cluster_parameter_group.main_pg.name

  backup_retention_period      = 7
  preferred_backup_window      = "17:15-17:45"
  preferred_maintenance_window = "sat:18:15-sat:18:45"

  deletion_protection   = true
  copy_tags_to_snapshot = true
  skip_final_snapshot   = false
  final_snapshot_identifier = "${var.environment}-db-cluster-pg-final-snapshot"

  # Serverless V2
  serverlessv2_scaling_configuration {
    min_capacity = 0.5
    max_capacity = 16.0
  }

  tags = {
    Name = "aurora-cluster-pg"
  }
}

# Aurora PostgreSQL インスタンス（Writer）
resource "aws_rds_cluster_instance" "writer_pg" {
  identifier         = "${var.environment}-db-cluster-pg-instance-1"
  cluster_identifier = aws_rds_cluster.main_pg.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.main_pg.engine
  engine_version     = aws_rds_cluster.main_pg.engine_version

  monitoring_interval = 60
  monitoring_role_arn = data.aws_iam_role.rds_monitoring.arn

  performance_insights_enabled    = true
  performance_insights_kms_key_id = null  # 新規では自動生成KMSキーを使用

  auto_minor_version_upgrade = true
  promotion_tier = 1

  tags = {
    Name = "aurora-writer-pg"
  }

  lifecycle {
    ignore_changes = [performance_insights_kms_key_id]
  }
}

# RDS クラスタパラメータグループ（PostgreSQL）
resource "aws_rds_cluster_parameter_group" "main_pg" {
  family      = "aurora-postgresql17"
  name        = "${var.environment}-aurora-parameter-group-pg"
  description = "${var.environment}-aurora-parameter-group-pg"

  parameter {
    name  = "timezone"
    value = "Asia/Tokyo"
  }

  tags = {
    Name = "aurora-parameter-group-pg"
  }
}

# RDS サブネットグループ（PostgreSQL）
resource "aws_db_subnet_group" "main_pg" {
  name        = "rds-dev-subnet-group-pg"
  description = "rds-dev-subnet-group-pg"
  subnet_ids  = [aws_subnet.private_1a.id, aws_subnet.private_1c.id]

  tags = {
    Name = "rds-subnet-group-pg"
  }
}

# Route53 内部 DNS（PostgreSQL）
resource "aws_route53_record" "db_pg_internal" {
  zone_id = aws_route53_zone.internal.id
  name    = "db-pg.${var.environment}.internal"
  type    = "CNAME"
  ttl     = 0
  records = [aws_rds_cluster.main_pg.endpoint]
}
