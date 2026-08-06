import * as Stores from '@/stores';
import { useAtomValue } from 'jotai';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

// queryClient の onError(React ツリー外)から historyBack が要求されたら navigate(-1) する。
// useNavigate を使うため router コンテキスト内(レイアウト要素)に常駐させる必要がある。
export const HistoryBackHandler = () => {
  const request = useAtomValue(Stores.historyBackRequestAtom);
  const navigate = useNavigate();
  // 処理済みカウンタを ref で単調追跡する。初期マウント時・再マウント時は現在値で初期化されるため
  // 誤発火せず、カウンタが増分したときだけ戻る(navigate の identity 変化にも反応しない)。
  const handledRef = React.useRef(request);

  React.useEffect(() => {
    if (request > handledRef.current) {
      handledRef.current = request;
      void navigate(-1);
    }
  }, [request, navigate]);

  return null;
};
