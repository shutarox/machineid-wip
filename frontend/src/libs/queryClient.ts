import * as Stores from '@/stores';
import {
  MutationCache,
  QueryCache,
  QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { getDefaultStore } from 'jotai';
import { toast } from 'sonner';

// query/mutation の meta を型付けする。
// - askRetryOnServerError: 一過性エラー時に ApiRetryDialog へ再試行を登録する
// - blocking: GlobalSpinner のブロック判定(false でクリック透過。既定はブロック)
export interface ApiMeta extends Record<string, unknown> {
  askRetryOnServerError?: boolean;
  blocking?: boolean;
}

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: ApiMeta;
    mutationMeta: ApiMeta;
  }
}

// トーストは sonner を使う。QueryCache / MutationCache の onError は React ツリーの外で
// 動くため、フックではなくモジュールから直接呼べる実装であることが必須要件。
// 表示先コンテナは App.tsx の <Toaster />(sonner)が 1 つだけ描画する。
export { toast };

const store = getDefaultStore();

type ApiErrorBody = {
  message?: string;
  actions?: string[];
  __transient?: boolean;
};

// QueryCache / MutationCache 共通のエラー処理。旧 useApiCall の副次処理を集約する。
const handleApiError = (
  error: unknown,
  meta: ApiMeta | undefined,
  queryKey?: QueryKey
) => {
  // ネットワークエラー等(fetch reject)は Error インスタンスで届く。
  // サーバ由来のエラーボディ({message, actions})はプレーンオブジェクトで届く。
  const isErrorInstance = error instanceof Error;
  const body = isErrorInstance
    ? undefined
    : (error as ApiErrorBody | null | undefined) ?? undefined;

  // アクション処理(message トーストより先。分岐順が現行パリティ)
  const actions = body?.actions;
  if (actions?.includes('forceLogout')) {
    store.set(Stores.logoutAtom);
    // 現行はキャッシュ自体がないが、TanStack では前ユーザのデータ残留を防ぐ
    void queryClient.removeQueries();
  }
  if (actions?.includes('historyBack')) {
    store.set(Stores.historyBackRequestAtom, (n) => n + 1);
  }
  if (actions?.includes('reloadApp')) {
    store.set(Stores.isOpenReloadAppDialogAtom, true);
  }

  // message があればトースト(actions のみ・message なしはトーストなし = 現行パリティ)
  const message = isErrorInstance ? error.message : body?.message;
  if (message) {
    toast.error(message, { duration: 3000 });
  }

  // リトライ登録: サーバ由来の構造化エラー(message/actions を持つ非 2xx)ではなく、
  // ネットワークエラー or 空ボディの一過性エラー(__transient)のみを対象にする(現行パリティ)。
  const isTransient = isErrorInstance || body?.__transient === true;
  if (meta?.askRetryOnServerError && isTransient && queryKey) {
    store.set(Stores.retryTargetApiCallsAtom, (old) => [
      ...old,
      () => queryClient.refetchQueries({ queryKey }),
    ]);
  }
};

// ノーキャッシュ方針: TanStack Query は「取得状態の管理 + 再取得トリガー」としてのみ使い、
// キャッシュ配信(取得せず保存済みデータを見せる)と自動再取得は一切持ち込まない。
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) =>
      handleApiError(error, query.meta, query.queryKey),
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) =>
      handleApiError(error, mutation.meta),
  }),
  defaultOptions: {
    queries: {
      staleTime: 0, // 常に stale = マウント毎取得(現行 useEffect と同義)
      gcTime: 0, // 非アクティブエントリを即破棄(cache-then-refetch を防ぐ)
      retry: false, // 現行に自動リトライなし(ApiRetryDialog はこれとは別物)
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});
