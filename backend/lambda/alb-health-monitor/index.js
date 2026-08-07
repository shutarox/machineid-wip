const https = require('https');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');

// Slack の webhook URL は **SSM の SecureString から実行時に読む**。
// terraform の変数や Lambda の環境変数に入れると tfstate や git に平文で残るため
// (雛形では実際に webhook URL が git 履歴へ混入した経緯がある)。
//
// **未設定・空・読めない場合は何も送らずに正常終了する。**
// webhook を設定する前でも監視の配線だけ先に入れておけるようにするため。
const SLACK_WEBHOOK_SSM_PARAMETER = process.env.SLACK_WEBHOOK_SSM_PARAMETER;

const ssm = new SSMClient({});
/** 取得できた値だけキャッシュする(未設定のまま覚えると、後から設定しても拾えない) */
let cachedWebhookUrl = '';

async function getSlackWebhookUrl() {
  if (cachedWebhookUrl) {
    return cachedWebhookUrl;
  }
  if (!SLACK_WEBHOOK_SSM_PARAMETER) {
    return '';
  }
  try {
    const res = await ssm.send(
      new GetParameterCommand({
        Name: SLACK_WEBHOOK_SSM_PARAMETER,
        WithDecryption: true,
      })
    );
    cachedWebhookUrl = (res.Parameter?.Value ?? '').trim();
  } catch (error) {
    // パラメータ未作成でも監視そのものは落とさない
    console.warn(
      `SSM ${SLACK_WEBHOOK_SSM_PARAMETER} を読めませんでした: ${error.name}`
    );
    return '';
  }
  return cachedWebhookUrl;
}

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
    const webhookUrl = await getSlackWebhookUrl();
    if (!webhookUrl) {
      console.log('Slack webhook が未設定のため送信しません');
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Slack webhook not configured' }),
      };
    }

    await sendSlackNotification(blocks, webhookUrl);
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
async function sendSlackNotification(blocks, webhookUrl) {
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

    const req = https.request(webhookUrl, options, (res) => {
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
