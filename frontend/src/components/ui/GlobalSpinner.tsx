import { Spinner } from '@/components/ui/spinner';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import * as React from 'react';

export const GlobalSpinner = () => {
  // アクティブな取得/更新数を TanStack Query から集計する。
  // blocking 判定: meta.blocking !== false(既定はブロック。false でクリック透過)。
  const isBlocking = (meta: { blocking?: boolean } | undefined) =>
    meta?.blocking !== false;
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const fetchingBlocking = useIsFetching({
    predicate: (query) => isBlocking(query.meta),
  });
  const mutatingBlocking = useIsMutating({
    predicate: (mutation) => isBlocking(mutation.meta),
  });

  const activeApiCalls = fetching + mutating;
  const activeBlockingApiCalls = fetchingBlocking + mutatingBlocking;
  const [showSpinner, setShowSpinner] = React.useState(false);
  const [blockUserInteraction, setBlockUserInteraction] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    // APIコールがアクティブになった場合
    if (activeApiCalls > 0) {
      // すでにタイマーが設定されていれば何もしない
      if (timerRef.current === null) {
        // 100ms後にスピナーを表示するタイマーを設定
        timerRef.current = setTimeout(() => {
          setShowSpinner(true);
        }, 100);
      }
    } else {
      // APIコールがなくなった場合
      // タイマーがあればクリア
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // スピナーを非表示に
      setShowSpinner(false);
    }

    if (activeBlockingApiCalls > 0) {
      setBlockUserInteraction(true);
    } else {
      // 10ms 後にユーザー操作を許可する
      setTimeout(() => {
        setBlockUserInteraction(false);
      }, 10);
    }

    // クリーンアップ関数
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [activeApiCalls, activeBlockingApiCalls]);

  if (!activeApiCalls && !blockUserInteraction) {
    return null;
  }

  const blocking = activeBlockingApiCalls > 0 || blockUserInteraction;

  return (
    <div
      // ブロック中以外はクリックを透過する
      className={
        blocking
          ? 'fixed inset-0 z-9999 flex items-center justify-center'
          : 'pointer-events-none fixed inset-0 z-9999 flex items-center justify-center'
      }
    >
      {showSpinner && <Spinner className="size-8" />}
    </div>
  );
};
