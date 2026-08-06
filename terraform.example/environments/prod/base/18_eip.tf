# NAT Gateway EIP
resource "aws_eip" "nat" {
  domain = "vpc"
  
  tags = {
    Name = "eip-nat-gateway"
  }
  
  depends_on = [aws_internet_gateway.main]
}