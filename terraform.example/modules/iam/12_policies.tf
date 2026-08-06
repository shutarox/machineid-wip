# IAM Policies

#==================================== tf-user-iam
resource "aws_iam_policy" "tf_user_iam" {
  name = "terraform-tf-user-iam"
  policy = file("${path.module}/12_policy.tf-user-iam.json")
  
  tags = {
    Name = "terraform-tf-user-iam"
  }
}

#==================================== tf-user-main
resource "aws_iam_policy" "tf_user_main" {
  name = "terraform-tf-user-main"
  policy = file("${path.module}/12_policy.tf-user-main.json")
  
  tags = {
    Name = "terraform-tf-user-main"
  }
}

#==================================== ecs-task-execution
resource "aws_iam_policy" "ecs_task_execution_logs" {
  name = "terraform-ecs-task-execution-logs"
  policy = file("${path.module}/12_policy.ecs-task-execution-logs.json")
  
  tags = {
    Name = "terraform-ecs-task-execution-logs"
  }
}

