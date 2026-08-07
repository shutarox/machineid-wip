# ADR: API クライアントは TanStack Query を「取得状態管理」としてのみ使い、キャッシュ配信をしない

- 状態: **採用**(2026-08-03、3d)
- 関連: `docs/plans/20260803-tanstack-query-plan.md`

## 背景

旧実装の `useApiCall`(349 行)は 7 つの関心事(ブロッキングカウント / abort / JST 変換 / ヘッダ付与 / actions 処理 / トースト / リトライ登録)を単一フックに内包する**自作抽象**だった。

問題は行数ではなく、**独自抽象には LLM の事前知識が効かない**こと。API 呼び出しを 1 箇所触るだけでも独自規約(options の意味、reload コールバックの作法、リトライ登録の手順)の読解が前提になり、誤用とハルシネーションの温床になる。

## 決定

**TanStack Query + openapi-react-query** に解体する。業界標準のパターンなので、エージェントは規約を既に知っている状態で正しいコードを書ける。

### 責務の分割

| ファイル | 責務 |
|---|---|
| `libs/api.ts` | openapi-fetch クライアント本体。Date → JST 正準形の直列化(serializer)、`x-client-version` 等のヘッダ付与とエラーボディ正規化(Middleware) |
| `libs/queryClient.ts` | QueryCache / MutationCache の `onError` にトースト・`actions` 処理(forceLogout / historyBack / reloadApp)・リトライ登録を集約 |

画面からは `$api.useQuery` / `$api.useMutation` を使う(パスとメソッドが生成型で補完される)。

### ノーキャッシュ方針(最重要)

```
staleTime: 0, gcTime: 0, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false
```

**TanStack Query は「取得状態の管理 + 再取得トリガー」としてのみ使い、キャッシュ配信(取得せず保存済みデータを見せる)と自動再取得は一切持ち込まない。** 旧実装の `useEffect` 取得と同じ表示挙動を保つための意図的な設定で、性能チューニングの余地として残しているわけではない。

更新後の再取得は `invalidateQueries` で行う。

### JST 変換は Middleware ではなく serializer で行う

**workplan からの意図的な逸脱。** openapi-fetch の Middleware `onRequest` は直列化後の `Request` しか受け取れず、body の `Date` は既に UTC の `Z` 文字列になっていて正準形(`+09:00`・秒精度)を保証できない。そのため直列化そのものに介入する。

### ブロッキングとリトライは `meta` で指定する

query / mutation の `meta`(型は `ApiMeta`)で宣言する。

| キー | 意味 |
|---|---|
| `blocking` | GlobalSpinner のブロック判定(`false` でクリック透過。既定はブロック) |
| `askRetryOnServerError` | 一過性エラー時に ApiRetryDialog へ再試行を登録する |

## 却下した選択肢

- **`useApiCall` の維持・改良**: 独自抽象である限り、エージェントにとっての読解コストは消えない
- **キャッシュを効かせる(`staleTime` を伸ばす)**: 表示挙動が変わる。必要になった画面で個別に判断すべきで、既定にはしない
- レスポンスの日時を `Date` へ自動変換する仕組み → `20260713-datetime-design.md` を参照(2 方式検討して棄却済み)

## エージェント向けの注意

- **`staleTime` / `gcTime` / `refetchOnWindowFocus` の既定値を「最適化のため」に変更しないこと**。ノーキャッシュは意図的な設計
- API 呼び出しのラッパーを新設しないこと。`$api.useQuery` / `$api.useMutation` を直接使う
- エラー時のトースト・ログアウト・リトライは **`queryClient.ts` で一括処理済み**。画面側で `catch` して再実装しない(成功時の後処理だけ書く)
