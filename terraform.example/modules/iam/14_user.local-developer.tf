#==================================== local_developer
resource "aws_iam_user" "local_developer" {
  count = var.create_local_developer ? 1 : 0
  name = "terraform-local-developer"
  force_destroy = var.force_destroy

  tags = {
    Name = "terraform-local-developer"
  }
}

resource "aws_iam_user_policy_attachment" "local_developer" {
  count = var.create_local_developer ? 1 : 0
  user       = aws_iam_user.local_developer[0].name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMReadOnlyAccess"
} 