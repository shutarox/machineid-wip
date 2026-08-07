# EventBridge → ECS RunTask による定期実行
#
# **ここに置くのは「重い・低頻度」のジョブだけ。**
# 軽くて高頻度のものは API プロセス内のスケジューラで回す
# (ADR 20260806-deploy-and-scheduled-jobs.md 決定 4)。
# Fargate はタスクごとに最小 1 分の課金 + 毎回のイメージ pull が発生するため、
# 5 分毎のような頻度をここで回すと割に合わない。

resource "aws_iam_role_policy" "eventbridge_ecs" {
  name = "${local.name_prefix}-eventbridge-ecs"
  role = data.aws_iam_role.eventbridge_ecs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["ecs:RunTask"]
        # 全リビジョンを許可(タスク定義更新時の権限エラーを防ぐ)
        Resource = "${aws_ecs_task_definition.main.arn_without_revision}:*"
        Condition = {
          ArnLike = {
            "ecs:cluster" = aws_ecs_cluster.main.arn
          }
        }
      },
      {
        Effect = "Allow"
        Action = ["iam:PassRole"]
        Resource = [
          data.aws_iam_role.ecs_task_execution.arn,
          data.aws_iam_role.ecs_task.arn,
        ]
      }
    ]
  })
}

# **いまのところ EventBridge で回すジョブは無い。**
#
# `cleanup_uploads` はここにあったが、**API プロセス内のスケジューラへ移した**
# (ADR docs/decisions/20260806-deploy-and-scheduled-jobs.md 決定 4)。
# 軽い(数秒 / I/O 中心 / バッチサイズで区切れる)ジョブなので、
# 使い捨てタスクの起動コスト(Fargate の最小課金 1 分 + 毎回のイメージ pull)に見合わない。
#
# ここに足すのは**重い・低頻度**のものだけ:
#
#   - 日次の集計、大量データの削除、外部への一括送信
#   - CPU バウンドな処理(API のイベントループを止めるとヘルスチェックが落ちる)
#   - 取りこぼしが許されないもの(スケジューラは at-most-once)
#
# 足すときは `aws_cloudwatch_event_rule` と `aws_cloudwatch_event_target` を対で書き、
# **`task_definition_arn` には `arn_without_revision` を渡すこと**
# (リビジョン固定にすると、デプロイしても定期実行だけ古いイメージで走り続ける)。
# 上の `aws_iam_role_policy.eventbridge_ecs` は残してあるので、ルールを足すだけで動く。
