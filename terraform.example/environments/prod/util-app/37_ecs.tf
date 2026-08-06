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
  cpu                      = 2048
  memory                   = 8192
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
      cpu       = 2048
      memory    = 8192
      essential = true

      portMappings = [
        { containerPort = 22,   hostPort = 22,   protocol = "tcp",                       name = "ssh"      },
        { containerPort = 8800, hostPort = 8800, protocol = "tcp", appProtocol = "http", name = "api-http" },
        { containerPort = 8080, hostPort = 8080, protocol = "tcp", appProtocol = "http", name = "spa-http" }
      ]

      environment = [
        {
          name  = "APPX_NODE_ENV"
          value = "development"
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
          value = "https://${var.url_host_name}"
        },
        {
          name  = "APPX_API_SERVER_BASE_URL"
          value = "https://${var.url_host_name}:8443"
        },
        {
          name  = "APPX_COOKIE_DOMAIN"
          value = var.cookie_domain
        },

        // terraform 実行環境特有の環境変数
        {
          name  = "APPX_TF_VAR_AWS_ENV"
          value = "prod"
        },
        // vite 環境特有の環境変数 (API_SERVER_BASE_URL と同じ)
        {
          name  = "APPX_VITE_API_SERVER_BASE_URL"
          value = "https://${var.url_host_name}:8443"
        },
        {
          name  = "APPX_VITE_ENABLE_DEBUG_MODE"
          value = "false"
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
  desired_count   = var.ecs_service_desired_count
  launch_type     = "FARGATE"
  platform_version = "LATEST"

  network_configuration {
    subnets          = [data.aws_subnet.private_1a.id, data.aws_subnet.private_1c.id]
    security_groups  = [
      data.aws_security_group.is_app.id,
      data.aws_security_group.allow_inbound_ssh.id,
      data.aws_security_group.allow_inbound_from_alb_8800.id
    ]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = data.aws_lb_target_group.ssh_nlb.arn
    container_name   = var.container_name
    container_port   = 22
  }
  load_balancer {
    target_group_arn = data.aws_lb_target_group.spa.arn
    container_name   = var.container_name
    container_port   = 8800
  }
  load_balancer {
    target_group_arn = data.aws_lb_target_group.api.arn
    container_name   = var.container_name
    container_port   = 8080
  }

  deployment_circuit_breaker {
    enable   = false
    rollback = false
  }

  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 200
  health_check_grace_period_seconds  = 30

  tags = {
    Name = "ecs-service-main"
  }
}
