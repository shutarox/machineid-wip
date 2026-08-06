/**
 * スクリプト実行用のログユーティリティ
 *
 * 既存の ecs-log-monitor のフィルター `{ $.type = "error" }` に合致するJSON形式でログ出力する。
 * これにより、スクリプト実行時のエラーも Slack に通知される。
 */

export const scriptLog = (
  scriptName: string,
  type: 'script' | 'error',
  message: string,
  info?: Record<string, unknown>
) => {
  // api と statusCode は ecs-log-monitor でエラーのグループ化と
  // Slack通知メッセージの構成に使用される
  // 例: "500 SCRIPT cleanup_uploads\n\nエラーメッセージ"
  const log = {
    timestamp: new Date().toISOString(),
    type,
    api: `SCRIPT ${scriptName}`,
    statusCode: type === 'error' ? 500 : 200,
    info: { message, ...info },
  };

  console.log(JSON.stringify(log));
};
