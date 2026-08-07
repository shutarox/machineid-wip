resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-ecs-cluster"

  # Container Insights は CloudWatch のカスタムメトリクス課金。
  # PoC 期は無効(必要になったら enhanced に切り替える)
  setting {
    name  = "containerInsights"
    value = "disabled"
  }

  tags = {
    Name = "ecs-cluster"
  }
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${local.name_prefix}"
  retention_in_days = 30 # 既定は無期限。逓増を防ぐ

  tags = {
    Name = "log-group-app"
  }
}

#================================================= タスク定義

resource "aws_ecs_task_definition" "main" {
  family                   = "${local.name_prefix}-task"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]

  # PoC 期は 0.5 vCPU / 2GB(約 $21/月)。負荷を見て上げる
  cpu    = 512
  memory = 2048

  execution_role_arn = data.aws_iam_role.ecs_task_execution.arn
  task_role_arn      = data.aws_iam_role.ecs_task.arn

  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([
    {
      name      = local.container_name
      image     = "${data.aws_ecr_repository.main.repository_url}:latest@${var.ecr_digest}"
      essential = true

      command = ["node", "/app/backend/build/src/index.js"]

      # ECS Exec でシェルを取ったときにゾンビプロセスを残さない
      linuxParameters = {
        initProcessEnabled = true
      }

      portMappings = [
        {
          containerPort = 8080
          hostPort      = 8080
          protocol      = "tcp"
          appProtocol   = "http"
          name          = "api-http"
        }
      ]

      environment = [
        { name = "APPX_NODE_ENV", value = "production" },
        { name = "APPX_SERVER_ENV", value = "production" },
        # **アプリはこれを読まない**(接続先は SSM の DB_URL)。
        # ECS Exec で入って `psql -h $DB_HOST` を叩くときの利便のために残している
        { name = "APPX_DB_HOST", value = "db-pg.${var.local_domain_name}" },
        { name = "APPX_ENABLE_DEBUG_MODE", value = "false" },
        { name = "APPX_SPA_APP_BASE_URL", value = "https://${local.url_host_name_spa}" },
        { name = "APPX_API_SERVER_BASE_URL", value = "https://${local.url_host_name_api}" },
        { name = "APPX_COOKIE_DOMAIN", value = var.domain_name },

        # オブジェクトストレージ。本番は S3_ENDPOINT を設定せず SDK の既定に任せる
        { name = "APPX_S3_BUCKET", value = var.s3_bucket_name_uploads },

        # RDS の CA バンドル(イメージに同梱)。**RDS は SSL 接続を要求し**、
        # @prisma/adapter-pg は Node の信頼ストアで検証するため、これが無いと
        # `self-signed certificate in certificate chain` で接続できない。
        #
        # **`APPX_` 接頭辞が必須。** entrypoint(etc/onstart-prod-main.sh)は
        # `exec su - appuser` でアプリを起動する = **ログインシェルが環境変数を捨てる**ため、
        # `APPX_*` を `/etc/environment` へ転記したものだけが子プロセスに届く。
        # 接頭辞なしで渡した変数は**黙って消える**。
        { name = "APPX_NODE_EXTRA_CA_CERTS", value = "/etc/ssl/certs/rds-global-bundle.pem" },

        { name = "GIT_BRANCH", value = var.git_branch },
        { name = "GIT_COMMIT", value = var.git_commit },
      ]

      secrets = [
        {
          name      = "APPX_DB_URL"
          valueFrom = "${local.ssm_prefix}/DB_URL"
        },
        {
          # /etc/environment へ転記しないので APPX_ 接頭辞は付けない
          name      = "DB_PASSWORD"
          valueFrom = "${local.ssm_prefix}/DB_PASSWORD"
        },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.app.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
          mode                  = "non-blocking"
          max-buffer-size       = "25m"
        }
      }
    }
  ])

  tags = {
    Name = "ecs-task-definition"
  }
}

#================================================= サービス

resource "aws_ecs_service" "main" {
  name             = "${local.name_prefix}-ecs-service"
  cluster          = aws_ecs_cluster.main.id
  task_definition  = aws_ecs_task_definition.main.arn
  desired_count    = 1
  launch_type      = "FARGATE"
  platform_version = "LATEST"

  # 踏み台サーバの代わり。`aws ecs execute-command` で入る
  enable_execute_command = true

  network_configuration {
    subnets = [
      data.aws_subnet.public_1a.id,
      data.aws_subnet.public_1c.id,
    ]

    security_groups = [data.aws_security_group.is_app.id]

    # NAT を置かないため、ECR pull・SSM・CloudWatch Logs は
    # パブリック IP から IGW 経由で出る
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = data.aws_lb_target_group.api.arn
    container_name   = local.container_name
    container_port   = 8080
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  # **100 にする。** 雛形の既定 50 では desired_count = 1 のとき
  # 「旧タスクを止めてから新タスクを起動」になり得る
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  # 起動時マイグレーションはしない(run-task で別途流す)ので短くてよいが、
  # アプリの初期化(Prisma のスキーマ読み込み等)の分は見ておく
  health_check_grace_period_seconds = 60

  lifecycle {
    # **イメージのロールアウトは deploy スクリプトの責務。**
    # desired_count は autoscaling が動かす
    ignore_changes = [task_definition, desired_count]
  }

  tags = {
    Name = "ecs-service"
  }
}

#================================================= オートスケーリング

resource "aws_appautoscaling_target" "ecs" {
  # PoC 相応。雛形の 10 は過剰で、事故時の青天井にもなる
  min_capacity       = 1
  max_capacity       = 3
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.main.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "${local.name_prefix}-ecs-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }

    target_value       = 50.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
