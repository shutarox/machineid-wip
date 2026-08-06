#==================================== tf-user-main
resource "aws_iam_user" "tf_user_main" {
  name = "terraform-tf-user-main"
  force_destroy = var.force_destroy

  tags = {
    Name = "terraform-tf-user-main"
  }
}

resource "aws_iam_user_policy_attachment" "tf_user_main" {
  user       = aws_iam_user.tf_user_main.name
  policy_arn = aws_iam_policy.tf_user_main.arn
} 