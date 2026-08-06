# RDSモニタリング用IAMロール
resource "aws_iam_role" "rds_monitoring" {
  name = "terraform-rds-monitoring-role"
  description = "Allows RDS to manage CloudWatch Logs resources for Enhanced Monitoring on your behalf."

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "terraform-rds-monitoring-role"
  }
}

# RDSモニタリング用IAMポリシー
resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
} 