# ECS Cluster
resource "aws_ecs_cluster" "main" {
  name = "${var.environment}-ecs-cluster-main"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = "ecs-cluster-main"
  }
}

# ECS Task Definition

resource "aws_ecs_task_definition" "main" {
  family                   = "${var.environment}-ecs-task-family-main"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 1024
  memory                   = 3072
  execution_role_arn       = data.aws_iam_role.ecs_task_execution_role.arn
  task_role_arn            = data.aws_iam_role.ecs_task_role.arn

  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([
    {
      name      = var.container_name
      image     = "${data.aws_ecr_repository.main.repository_url}:latest@${var.ecr_digest}"
      cpu       = 1024
      memory    = 3072
      essential = true
      command   = ["node", "/app/backend/build/src/index.js"]

      portMappings = [
        { containerPort = 8080,
          hostPort      = 8080
          protocol      = "tcp"
          appProtocol   = "http"
          name          = "8080-http"
        }
      ]

      environment = [
        {
          name  = "APPX_NODE_ENV"
          value = "production"
        },
        {
          name  = "APPX_SERVER_ENV"
          value = "production"
        },
        {
          name  = "APPX_DB_HOST"
          value = "db-pg.${var.local_domain_name}"
        },
        {
          name  = "APPX_ENABLE_DEBUG_MODE"
          value = "false"
        },
        {
          name  = "APPX_SPA_APP_BASE_URL"
          value = "https://${var.url_host_name_spa}"
        },
        {
          name  = "APPX_API_SERVER_BASE_URL"
          value = "https://${var.url_host_name_api}"
        },
        {
          name  = "APPX_COOKIE_DOMAIN"
          value = var.cookie_domain
        },
        {
          name  = "GIT_BRANCH"
          value = var.git_branch
        },
        {
          name  = "GIT_COMMIT"
          value = var.git_commit
        },
      ]

      secrets = [
        {
          name      = "APPX_DB_URL"
          valueFrom = "arn:aws:ssm:${data.aws_region.current.id}:${data.aws_caller_identity.current.account_id}:parameter/${var.project_name}-keys/DB_URL"
        },
        {
          # パスワードは /etc/my.cnf に転記するので APPX_ の接頭語はつけない
          name      = "DB_PASSWORD"
          valueFrom = "arn:aws:ssm:${data.aws_region.current.id}:${data.aws_caller_identity.current.account_id}:parameter/${var.project_name}-keys/DB_PASSWORD"
        },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = "/ecs/${var.environment}-ecs-task-family-main"
          awslogs-region        = "ap-northeast-1"
          awslogs-stream-prefix = "ecs"
          mode                  = "non-blocking"
          awslogs-create-group  = "true"
          max-buffer-size       = "25m"
        }
      }
    }
  ])

  tags = {
    Name = "ecs-task-family-main"
  }
}

# ECS Service

resource "aws_ecs_service" "main" {
  name            = "${var.environment}-ecs-service-main"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.main.arn
  desired_count   = 1
  launch_type     = "FARGATE"
  platform_version = "LATEST"

  network_configuration {
    subnets          = [data.aws_subnet.private_1a.id, data.aws_subnet.private_1c.id]
    security_groups  = [data.aws_security_group.is_app.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = data.aws_lb_target_group.api.arn
    container_name   = var.container_name
    container_port   = 8080
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  health_check_grace_period_seconds  = 30

  tags = {
    Name = "ecs-service-main"
  }
}

# Application Auto Scaling Target

resource "aws_appautoscaling_target" "ecs_target" {
  max_capacity       = 10
  min_capacity       = 1
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.main.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"

  tags = {
    Name = "ecs-autoscaling-target"
  }
}

# Application Auto Scaling Policy (Target Tracking Scaling)

resource "aws_appautoscaling_policy" "cpu_scaling" {
  name               = "${var.environment}-ecs-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_target.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_target.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = 50.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
