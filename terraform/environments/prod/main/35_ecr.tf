resource "aws_ecr_repository" "main" {
  name                 = "${var.project_name}-app-${var.environment}"
  image_tag_mutability = "MUTABLE" # デプロイは :latest に push し、digest でタスク定義に固定する

  image_scanning_configuration {
    scan_on_push = false
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Name = "ecr"
  }
}

# ストレージ課金の逓増を防ぐ(PoC 期のコストレバー)
resource "aws_ecr_lifecycle_policy" "main" {
  repository = aws_ecr_repository.main.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "直近 10 イメージのみ保持する"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}
