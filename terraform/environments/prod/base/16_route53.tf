# アプリの公開 DNS ゾーン
#
# **なぜ main ではなく base に置くか**
#
# 親ゾーン(`kas.jp`)は**別の AWS アカウント**にあり、この terraform の管理外にある。
# そのため「ゾーンを作る → NS を親へ手で登録する → 委任が伝播する」という
# **人手の待ちが必ず挟まる**。
#
# ゾーンと ACM を同じスタックに置くと、`aws_acm_certificate_validation` が
# 委任前の DNS を検証しようとして**タイムアウト(既定 75 分)まで固まる**。
# base に置けば apply の境界が委任の手前に来るので、
#
#   base apply → NS を親へ登録 → 伝播を確認 → main apply
#
# という順序が自然に表現できる(README の「適用順序」)。

resource "aws_route53_zone" "main" {
  name = var.domain_name

  tags = {
    Name = "hosted-zone-public"
  }
}
