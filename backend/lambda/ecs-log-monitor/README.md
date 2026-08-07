# ECSログ監視Lambda関数

ECSから出力されたログで `"type":"error"` のログを監視し、Slackに即時通知するLambda関数です。

## 機能

- CloudWatch Logsサブスクリプションフィルターでエラーログを即時検出
- Lambda関数に直接接続（Kinesis不要）
- Lambdaメモリ内で通知制御（DynamoDB不要）
- エラー内容をJSON.stringifyで整形
- 10分間隔での通知制御（同じエラーは10分に1回まで）
- Slackへのリッチな通知メッセージ

## 設定

### 環境変数

- `SLACK_WEBHOOK_URL`: Slack Webhook URL
- `NOTIFICATION_INTERVAL_MINUTES`: 通知間隔（分、デフォルト: 10）

### 必要な権限

- CloudWatch Logs: `CreateLogGroup`, `CreateLogStream`, `PutLogEvents` (Lambda実行ログ用)

## デプロイ

1. Slack Webhook URLを準備
2. Terraformでデプロイ:

```bash
cd ~/app/terraform/environments/prod/main   # 注: この Lambda は現在どの terraform からも参照されていない
terraform plan -var="slack_webhook_url=YOUR_SLACK_WEBHOOK_URL"
terraform apply -var="slack_webhook_url=YOUR_SLACK_WEBHOOK_URL"
```

## 動作

- CloudWatch Logsサブスクリプションフィルターがエラーログを即時検出
- Lambda関数に直接呼び出し
- Lambda関数がエラー内容をJSON.stringifyで整形
- メモリ内バッファで通知制御（同じエラーは10分に1回まで）
- Slackにエラー詳細を即時送信

## 通知例

```
🚨 ECSエラーログ通知

2 種類のエラーが検出されました

エラー 3 回発生
```
{
  "type": "error",
  "message": "Database connection failed",
  "stack": "Error: Database connection failed\n    at Database.connect (/app/src/db.js:15:10)\n    at async main (/app/src/index.js:25:5)",
  "timestamp": "2024-01-15T14:30:25.123Z"
}
```
最新発生時刻: 2024/01/15 14:30:25
```

## アーキテクチャ

```
ECS → CloudWatch Logs → Subscription Filter → Lambda → Slack
```

## トラブルシューティング

- Lambda関数のログは `/aws/lambda/{function-name}` で確認可能
- CloudWatch Logsサブスクリプションフィルターの設定を確認
- Lambda関数の実行履歴をCloudWatch Logsで確認
