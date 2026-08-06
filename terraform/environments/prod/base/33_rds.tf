# RDS PostgreSQL
#
# **Aurora Serverless v2 ではなく通常の RDS の最小構成**(ADR 20260806-aws-minimal-prod.md)。
# Aurora は無負荷でも min 0.5 ACU 分(約 $53/月)が下限で、I/O 課金により月額が読めない。
# アプリは Prisma + 素の PostgreSQL しか使っておらず、Aurora 固有機能への依存は無い。
#
# PoC 期は db.t4g.micro(約 $17/月)。負荷が出たら instance_class を上げる
# (再起動を伴うダウンタイムは数分)。

resource "aws_db_subnet_group" "main" {
  name = "${var.project_name}-${var.environment}-db-subnet-group"

  subnet_ids = [
    aws_subnet.private_1a.id,
    aws_subnet.private_1c.id,
  ]

  tags = {
    Name = "db-subnet-group"
  }
}

resource "aws_db_parameter_group" "main" {
  name   = "${var.project_name}-${var.environment}-pg17"
  family = "postgres17"

  # アプリは TZ=Asia/Tokyo 前提だが、DB 側は UTC のままにする。
  # @db.Date の正規化と DateTime のシリアライズはアプリ側で完結しており
  # (ADR 20260713-datetime-design.md)、DB の timezone に依存していない
  parameter {
    name  = "log_min_duration_statement"
    value = "1000" # 1 秒を超えるクエリを記録する
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_db_instance" "main" {
  identifier = "${var.project_name}-${var.environment}-pg"

  engine = "postgres"
  # メジャーバージョンのみ指定し、マイナーは AWS に追従させる。
  # apply 時に実在する最新マイナーへ解決されるため、plan で確認すること
  engine_version             = "17"
  auto_minor_version_upgrade = true

  instance_class = "db.t4g.micro"

  # gp3 の最小は 20GB。max_allocated_storage で自動拡張させる
  # (Aurora の自動拡張の代替)
  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.project_name
  username = "postgres"
  password = var.db_master_password

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.is_rds.id]
  parameter_group_name   = aws_db_parameter_group.main.name
  publicly_accessible    = false

  # **Single-AZ**。障害・メンテナンス時にダウンタイムが出ることを承知で選んでいる
  # (docs/known-issues.md「RDS が Single-AZ で...」)。可用性要件が出たら multi_az = true
  multi_az = false

  backup_retention_period = 7
  backup_window           = "17:15-17:45" # UTC = JST 02:15-02:45
  maintenance_window      = "sat:18:15-sat:18:45"
  copy_tags_to_snapshot   = true

  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.project_name}-${var.environment}-pg-final-snapshot"

  performance_insights_enabled = true # 7 日保持までは無料

  lifecycle {
    # パスワードは作成後 AWS 側でローテーションし、SSM を更新する運用にする。
    # engine_version はマイナー自動更新で動くため差分を追わない
    ignore_changes = [password, engine_version]
  }

  tags = {
    Name = "rds-postgres"
  }
}
