resource "aws_ecr_repository" "backend" {
  name = "${local.name_prefix}-backend"
  tags = {
    Name = "${local.name_prefix}-backend"
  }
}

resource "aws_ecr_repository" "frontend" {
  name = "${local.name_prefix}-frontend"
  tags = {
    Name = "${local.name_prefix}-frontend"
  }
}

resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-ecs-cluster"
  tags = {
    Name = "${local.name_prefix}-ecs-cluster"
  }
}

resource "aws_ecs_task_definition" "backend" {
  family      = "${local.name_prefix}-backend-task"
  container_definitions = jsonencode([
    {
      name      = "backend-container"
      image      = "${aws_ecr_repository.backend.repository_url}"
      essential  = true
      port_mappings = [
        {
          container_port = var.container_port_backend
          host_port      = var.container_port_backend
        }
      ]
      environment = [
        {
          name     = "DATABASE_URL"
          value     = "{{secrets.DatabaseCredentials["host"].host}}/{{secrets.DatabaseCredentials["port"].port}}/{{secrets.DatabaseCredentials["database"].name}?sslmode=require""
        },
        {
          name     = "WORKSPACE_DATABASE_URL"
          value     = "{{secrets.DatabaseCredentials["host"].host}}/{{secrets.DatabaseCredentials["port"].port}}/{{secrets.DatabaseCredentials["auth_database"].name}?sslmode=require""
        },
        {
          name     = "REDIS_URL"
          value     = "redis://${aws_resource_block.redis_endpoint.host}:${aws_resource_block.redis_endpoint.port}"
        },
        {
          name     = "APP_URL"
          value     = "https://${var.domain_name}"
        },
        {
          name     = "SESSION_SECRET"
          value     = "{{secrets.DatabaseCredentials["password"].password}}"
        },
        {
          name     = "JWT_SECRET"
          value     = "{{secrets.DatabaseCredentials["password"].password}}"
        },
        {
          name     = "GOOGLE_CLIENT_ID"
          value     = "{{var.GOOGLE_CLIENT_ID}}"
        },
        {
          name     = "GOOGLE_CLIENT_SECRET"
          value     = "{{var.GOOGLE_CLIENT_SECRET}}"
        }
      ]
    }
  ])
  requires_compatibilities = ["FARGATE"]
  cpu        = var.ecs_cpu
  memory     = var.ecs_memory
  network_mode = "bridge"
  task_role  = "ecsTaskExecutionRole"
  execution_role = "ecsTaskExecutionRole"
  depends_on = [aws_security_group.ecs]
}

resource "aws_ecs_service" "backend" {
  name            = "${local.name_prefix}-backend-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.id
  desired_count   = var.desired_count
  launch_type     = "FARGATE"
  service_role    = "service.amazonaws.com"
  health_check    = {
    interval       = 30s
    path           = "/health"
    protocol       = "HTTP"
    successful_exit = 200
  }
  load_balancer = {
    target_group_arn = aws_lb_target_group.main.id
    container_name  = "backend-container"
    container_port  = var.container_port_backend
  }
}

resource "aws_lb" "main" {
  name               = "${local.name_prefix}-alb"
  type               = "application"
  subnets            = aws_subnet.public.*.id
  security_groups    = [aws_security_group.alb.id]
  tags               = {
    Name = "${local.name_prefix}-alb"
  }
}

resource "aws_lb_target_group" "main" {
  name        = "${local.name_prefix}-target-group"
  port        = var.container_port_backend
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  health_check = {
    interval    = 30s
    path        = "/health"
    healthy_threshold = 2
    unhealthy_threshold = 2
    timeout      = 5s
  }
  tags = {
    Name = "${local.name_prefix}-target-group"
  }
}

resource "aws_ecs_service" "frontend" {
  name            = "${local.name_prefix}-frontend-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.frontend.id
  desired_count   = var.desired_count
  launch_type     = "FARGATE"
  service_role    = "service.amazonaws.com"
  health_check    = {
    interval       = 30s
    path           = "/health"
    protocol       = "HTTP"
    successful_exit = 200
  }
  load_balancer = {
    target_group_arn = aws_lb_target_group.main.id
    container_name  = "frontend-container"
    container_port  = var.container_port_frontend
  }
}

resource "aws_ssl_certificate" "main" {
  certificate_hash = var.certificate_arn
  lifecycle { replicate = false }
}