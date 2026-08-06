const https = require('https');
const zlib = require('zlib');

// 環境変数
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const NOTIFICATION_INTERVAL_MINUTES =
  parseInt(process.env.NOTIFICATION_INTERVAL_MINUTES) || 10;

// メモリ内バッファ（通知制御用）
const notificationBuffer = new Map();

/**
 * Lambda関数のメイン処理
 * CloudWatch Logsサブスクリプションフィルターから直接呼び出される
 */
exports.handler = async (event) => {
  console.log('ECSエラーログ通知Lambda関数が開始されました');

  try {
    // CloudWatch Logsサブスクリプションフィルターからのイベントを処理
    let logEvents = [];

    if (event.awslogs && event.awslogs.data) {
      // base64デコードしてgzip展開
      const compressedData = Buffer.from(event.awslogs.data, 'base64');
      const decompressedData = zlib.gunzipSync(compressedData);
      const logData = JSON.parse(decompressedData.toString());
      logEvents = logData.logEvents || [];
    }

    console.log(`エラーログ ${logEvents.length} 件を受信しました`);

    if (logEvents.length === 0) {
      console.log('エラーログはありませんでした');
      return { statusCode: 200, body: 'No error logs found' };
    }

    // エラー内容ごとにグループ化し、通知制御をチェック
    const errorGroups = groupErrorsByContent(logEvents);
    const notificationsToSend = [];

    for (const [errorContent, events] of errorGroups) {
      const shouldNotify = shouldSendNotification(errorContent);
      if (shouldNotify) {
        notificationsToSend.push({
          errorContent,
          events,
          count: events.length,
        });
        // 通知日時を記録
        recordNotificationTime(errorContent);
      }
    }

    // Slackに通知
    if (notificationsToSend.length > 0) {
      await sendSlackNotification(notificationsToSend);
      console.log(
        `${notificationsToSend.length} 件のエラー通知をSlackに送信しました`
      );
    } else {
      console.log('通知制御により、Slack通知は送信されませんでした');
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        errorLogsFound: logEvents.length,
        notificationsSent: notificationsToSend.length,
      }),
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
 * エラー内容ごとにログイベントをグループ化
 */
function groupErrorsByContent(logEvents) {
  const groups = new Map();

  for (const event of logEvents) {
    try {
      const log = JSON.parse(event.message);
      const errorContent = `${log.statusCode} ${log.api}\n\n${log.info?.message}`;

      // SCRIPT でもなく clientVersion がない場合は bot なので無視
      if (!log.clientVersion && !log.api?.match(/^SCRIPT /)) {
        continue;
      }

      if (!groups.has(errorContent)) {
        groups.set(errorContent, []);
      }
      groups.get(errorContent).push(event);
    } catch (parseError) {
      console.warn('ログメッセージのパースに失敗:', event.message);
      // パースできない場合はメッセージ全体をエラー内容として使用
      const errorContent = event.message;
      if (!groups.has(errorContent)) {
        groups.set(errorContent, []);
      }
      groups.get(errorContent).push(event);
    }
  }

  return groups;
}

/**
 * 通知を送信すべきかチェック（メモリ内バッファで10分間隔制御）
 */
function shouldSendNotification(errorContent) {
  // 接続中断エラーは無視
  if (errorContent.includes('500 Error: aborted')) {
    return false;
  }

  const now = Date.now();
  const lastNotificationTime = notificationBuffer.get(errorContent);

  if (!lastNotificationTime) {
    // 初回のエラー
    return true;
  }

  const timeDiffMinutes = (now - lastNotificationTime) / (1000 * 60);
  return timeDiffMinutes >= NOTIFICATION_INTERVAL_MINUTES;
}

/**
 * 通知日時を記録（メモリ内バッファ）
 */
function recordNotificationTime(errorContent) {
  notificationBuffer.set(errorContent, Date.now());
}

/**
 * Slackに通知を送信
 */
async function sendSlackNotification(notifications) {
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '❌️ ECSエラーログ通知',
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `<!channel>\n*${notifications.length}* 種類のエラーが検出されました`,
      },
    },
  ];

  // 各エラーの詳細を追加（ブロック数上限50のため、最大23件まで）
  const maxNotifications = Math.min(notifications.length, 23);
  for (let i = 0; i < maxNotifications; i++) {
    const notification = notifications[i];
    const latestEvent = notification.events[notification.events.length - 1];
    const utcTimestamp = new Date(latestEvent.timestamp);
    const timestamp = utcTimestamp.toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
    });

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*エラー ${
          notification.count
        } 回発生*\n\`\`\`${notification.errorContent.substring(0, 2800)}${
          notification.errorContent.length > 2800 ? '...' : ''
        }\`\`\`\n*最新発生時刻:* ${timestamp} (JST)`,
      },
    });

    blocks.push({ type: 'divider' });
  }

  const payload = {
    blocks: blocks,
    username: 'ECS Log Monitor',
    icon_emoji: ':warning:',
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
