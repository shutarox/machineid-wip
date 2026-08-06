#==================================== tf-user-iam
resource "aws_iam_user" "tf_user_iam" {
  name = "terraform-tf-user-iam"
  force_destroy = var.force_destroy

  tags = {
    Name = "terraform-tf-user-iam"
  }
}

resource "aws_iam_user_policy_attachment" "tf_user_iam" {
  user       = aws_iam_user.tf_user_iam.name
  policy_arn = aws_iam_policy.tf_user_iam.arn
} 