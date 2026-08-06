const https = require('https');

// 環境変数
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

/**
 * Lambda関数のメイン処理
 * SNSトピックから呼び出される
 */
exports.handler = async (event) => {
  console.log('ALBヘルスチェック通知Lambda関数が開始されました');
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    // SNSメッセージを解析
    const message = event.Records[0].Sns.Message;
    const subject = event.Records[0].Sns.Subject;
    const utcTimestamp = new Date(event.Records[0].Sns.Timestamp);
    const timestamp = utcTimestamp.toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
    });

    // メッセージをJSONとしてパース
    const alarm = JSON.parse(message);

    // アラームの状態変化を確認
    console.log(
      `アラーム状態変化: ${alarm.OldStateValue} -> ${alarm.NewStateValue}`
    );

    // アラーム種別と状態に応じたアイコンとメッセージを設定
    const getAlarmIconAndDescription = (alarmName, state) => {
      if (alarmName.includes('deployment-failure')) {
        return { icon: '❌️', description: alarm.AlarmDescription };
      }
      if (alarmName.includes('health-check-failure')) {
        return state === 'OK'
          ? {
              icon: '✅',
              description:
                'ALBターゲットグループのヘルスチェックが復帰しました',
            }
          : { icon: '❌', description: alarm.AlarmDescription };
      }
      return { icon: '🔔', description: alarm.AlarmDescription };
    };

    // Slackメッセージを構築
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${getAlarmIconAndDescription(alarm.AlarmName, alarm.NewStateValue).icon} ${alarm.AlarmName}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `<!channel>\n*状態:* ${alarm.NewStateValue}\n*説明:* ${getAlarmIconAndDescription(alarm.AlarmName, alarm.NewStateValue).description}\n*時刻:* ${timestamp} (JST)`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*メトリクス:* ${alarm.Trigger.MetricName}\n*閾値:* ${alarm.Trigger.Threshold}\n*期間:* ${alarm.Trigger.Period}秒\n*評価回数:* ${alarm.Trigger.EvaluationPeriods}回`,
        },
      },
    ];

    // Slackに通知
    await sendSlackNotification(blocks);
    console.log('Slack通知を送信しました');

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Notification sent successfully' }),
    };
  } catch (error) {
    console.error('エラーが発生しました:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

/**
 * Slackに通知を送信
 */
async function sendSlackNotification(blocks) {
  const payload = {
    blocks: blocks,
    username: 'ALB Health Monitor',
    icon_emoji: ':hospital:',
  };

  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(SLACK_WEBHOOK_URL, options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`Slack API error: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}
