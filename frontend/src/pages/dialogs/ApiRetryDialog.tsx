import { BasicDialog } from '@/components/ui/BasicDialog';
import * as Stores from '@/stores';
import * as Jotai from 'jotai';
import * as React from 'react';

export const ApiRetryDialog: React.FC = () => {
  const [retryTargetApiCalls, setRetryTargetApiCalls] = Jotai.useAtom(
    Stores.retryTargetApiCallsAtom
  );
  const [isOpen, setIsOpen] = React.useState(false);
  const [isRetrying, setIsRetrying] = React.useState(false);

  // リトライ関数リストが変更されたときにダイアログの表示状態を更新
  React.useEffect(() => {
    // リトライ関数がある場合はダイアログを開く
    if (retryTargetApiCalls.length > 0 && !isOpen) {
      setIsOpen(true);
    }
    // リトライ関数がなくなった場合はダイアログを閉じる
    else if (retryTargetApiCalls.length === 0 && isOpen) {
      setIsOpen(false);
    }
  }, [retryTargetApiCalls, isOpen]);

  const handleRetry = () => {
    (async () => {
      setIsRetrying(true);

      // 現在のリトライリストをコピー
      const currentRetries = [...retryTargetApiCalls];

      // リトライリストをクリア（これにより、新たに失敗するAPIコールのみが追加される）
      setRetryTargetApiCalls([]);

      try {
        // 各リトライ関数を個別に実行
        await Promise.allSettled(currentRetries.map((retryFn) => retryFn()));

        // 注: 失敗したリクエストは queryClient.ts の onError で自動的に再追加される
      } catch (_) {
        // Promise.allSettledは例外をスローしないため、
        // 通常ここには到達しないはず
      } finally {
        setIsRetrying(false);
      }
    })();
  };

  const handleCancel = () => {
    // ユーザーがリトライをキャンセルした場合、リトライリストをクリアしてダイアログを閉じる
    setRetryTargetApiCalls([]);
    setIsOpen(false);
  };

  const errorCount = retryTargetApiCalls.length;

  return (
    <BasicDialog
      isOpen={isOpen}
      onClose={handleCancel}
      title="通信エラー"
      mode="confirm"
      button1Text="キャンセル"
      button2Text="再試行"
      button1Disabled={isRetrying}
      button2Disabled={isRetrying}
      button2Loading={isRetrying}
      onButton1={handleCancel}
      onButton2={handleRetry}
    >
      <p>
        サーバーとの通信中にエラーが発生しました。
        {errorCount > 1 && ` (${errorCount}件)`}
      </p>
      <p>再試行しますか？</p>
    </BasicDialog>
  );
};
