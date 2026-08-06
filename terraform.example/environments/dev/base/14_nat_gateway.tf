resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public_1a.id
  tags = {
    Name = "nat-public1-${var.aws_region}a"
  }
  depends_on = [aws_internet_gateway.main]
}
