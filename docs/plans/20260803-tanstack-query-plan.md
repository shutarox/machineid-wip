# Phase 3d: TanStack Query 移行 実装計画

> plan 品質比較実験(`3d-tanstack-query-plan-fable.md` / `3d-tanstack-query-plan-sonnet.md`)の Fable 版を採用し、リファインした正本。実験の経緯とプランニング計測値は各元ファイルを参照。

## 背景と目標

`useApiCall`(frontend/src/libs/apiCall.ts、349 行)は 7 つの関心事(ブロッキングカウント / abort / JST 変換 / ヘッダ / actions 処理 / トースト / リトライ登録)+ convertToDate を単一フックに内包する。これを openapi-react-query + openapi-fetch Middleware + QueryClient グローバル設定に分解する。完了条件は `pnpm verify` 緑 + 手動パリティ確認(§8)。1 PR = 1 テーマ。

### 現状実装のエージェント指向コーディング上の問題

本リポジトリはエージェント駆動開発を前提とした雛形であり、useApiCall の解体は単なるリファクタではなく「エージェントが安全に・速く変更できるコードベース」への転換が目的。現状の具体的な問題:

- **独自抽象には LLM の事前知識が効かない**: useApiCall は本リポジトリ固有の 349 行の自作抽象で、API 呼び出しを 1 箇所触るだけでも独自規約(options の意味、reload コールバック、リトライ登録の作法)の読解が前提になる。TanStack Query は学習データに豊富な業界標準パターンであり、エージェントは規約を既に知っている状態で正しいコードを最短で書ける。独自規約は誤用・ハルシネーションの温床
- **手続き的な再取得は「呼び忘れ」を誘発する**: mutation 後の一覧更新が手動 reload コールバックの配線頼み(現 UsersAdmin で 3 箇所)で、機能追加時にエージェントが配線を忘れても型も lint も落ちず、動作確認まで発覚しない。`invalidateQueries` なら「更新系は該当 queryKey を invalidate する」という 1 行の宣言的規約に還元でき、レビューでの検出も容易
- **暗黙の実行時変換が型と実体の対応を壊す**: convertToDate は生成 JSON スキーマ(openapi-schema.json)を実行時参照してレスポンスを in-place 書き換えする「隠れた魔法」で、型(Date)と実体の一致が生成物 2 系統の同期に依存し、壊れてもサイレント。エージェントが静的に波及を追跡できない構造は事故源
- **エコシステムの検証手段が使えない**: 標準ライブラリなら eslint-plugin-query・TanStack Query Devtools・公式ドキュメントでの裏取りが効くが、自作フックの正しさはコードリーディングでしか担保できない



## 調査で確定した事実(計画の前提)

- 呼び出しは 8 ファイル・13 箇所。**全箇所が** `await callApi()` **の戻り値を直接使う命令的パターン**で、フックの data/error ステートを JSX で読む箇所はゼロ。status 利用は Login のボタン disabled のみ
- `allowUserInteraction` は全箇所未使用(全部ブロッキング)。`askRetryOnServerError` は GET 2 箇所のみ(CommonHeader の master / DebugParamsModal)
- 型生成(backend/src/libs/generateOpenApiSchema.ts:21-39)が openapi-typescript の transform で date-time → `Date` 型にマップ。`openapi-schema.json` は ts-json-schema-generator で生成(:44-52)され、唯一の消費者は convertToDate
- date-time フィールド(users の createdAt/lastLoginAt、debug/wait の now)を**消費する UI はゼロ** → convertToDate 削除の波及は型のみ
- リクエストに Date を送る呼び出しも現状ゼロ(JST 変換はデッドパスだが雛形パターンとして新実装に引き継ぐ)
- **バージョン制約(npm で裏取り済み)**: openapi-react-query latest 0.5.4 は `openapi-fetch ^0.17.0` 要求。既存 `openapi-fetch ^0.13.8` と組めるのは `openapi-react-query@^0.4.2`(peer: `openapi-fetch ^0.13.8` / `@tanstack/react-query ^5.25.0`)。1 PR = 1 テーマの原則から openapi-fetch のメジャー更新は本 PR に含めず 0.4.x を採用、0.17 化は別 PR



## 1. 新アーキテクチャ

```
frontend/src/libs/api.ts          … openapi-fetch client + serializer + Middleware 2本 + $api
frontend/src/libs/queryClient.ts  … QueryClient + QueryCache/MutationCache onError + meta 型
frontend/src/App.tsx              … QueryClientProvider + ToastContainer + HistoryBackHandler
```



### JST 変換は Middleware ではなく serializer(workplan からの意図的逸脱)

openapi-fetch の Middleware onRequest は直列化後の Request しか受け取れず、body の Date は既に UTC `Z` 文字列化済みで JST 正準形(+09:00・秒精度)を保証できない。よって JST 変換は `bodySerializer` **/** `querySerializer` で client 生成時に注入する。Middleware 2 本は「①ヘッダ付与(x-for-preflight / x-client-version)」「②エラー正規化(message/actions なしの非 2xx に `通信エラーが発生しました（status）` を付与 = 現行パリティ)」とする。逸脱理由をコード内コメントと PR 説明に明記。

- bodySerializer: `JSON.stringify(body, function(key, value) { return this[key] instanceof Date ? dateToJstCanonical(this[key]) : value })`(replacer には toJSON 適用後の値が来るため `this[key]` 判定が必須)
- querySerializer: query の Date を変換してから openapi-fetch の `createQuerySerializer` に委譲



### queryClient.ts

- `declare module '@tanstack/react-query'` の Register 拡張で meta を型付け: `{ askRetryOnServerError?: boolean; blocking?: boolean }`
- Chakra `createStandaloneToast()` でフック外トースト(App.tsx に `<ToastContainer />`)
- QueryCache.onError / MutationCache.onError → 共通 `handleApiError(error, meta, retry?)`:
  - `actions.forceLogout` → Jotai `getDefaultStore().set(logoutAtom)` + `queryClient.removeQueries()`
  - `actions.historyBack` → **stores.ts に** `historyBackRequestAtom` **を新設**し、レイアウト内常駐の `HistoryBackHandler` コンポーネントが `navigate(-1)`(memory router のため window.history 不可、React 外から router を触ると循環 import になるため)
  - `actions.reloadApp` → `isOpenReloadAppDialogAtom`
  - message があればトースト(actions のみ・message なしはトーストなし = 現行パリティ。分岐順に注意)
  - `meta.askRetryOnServerError` なら `retryTargetApiCallsAtom` に `() => queryClient.refetchQueries({queryKey})` を push
- **ノーキャッシュ方針**: TanStack Query は「取得状態の管理 + 再取得トリガー」としてのみ使い、キャッシュ配信(取得せずに保存済みデータを見せる挙動)は一切使わない。defaultOptions(queries):
  - `staleTime: 0`(既定値を明示。常に stale = マウント毎取得、現行 useEffect と同義)
  - **`gcTime: 0`**(observer が消えたエントリを即破棄。既定 5 分のままだと、ページ再訪時に前回データを即表示してから裏で再取得する cache-then-refetch が発生する = 現行にないキャッシュ配信)
  - `retry: false`(現行に自動リトライなし。既定 3 回だとリトライダイアログが遅延)
  - `refetchOnWindowFocus: false` + **`refetchOnReconnect: false`**(既定 true。現行にない自動再取得を持ち込まない)
  - `invalidateQueries` はマウント中の query への再取得指示であり、キャッシュ配信とは無関係に機能する(gcTime 0 で非アクティブエントリが即消えることとも両立)



### GlobalSpinner

atom カウンタ → `useIsFetching()` + `useIsMutating()`(blocking 判定は `meta.blocking !== false` の predicate)。100ms 遅延スピナー・10ms 遅延アンブロックのロジックは温存。QueryClientProvider は GlobalSpinner より外側(ChakraProvider 直下)。

## 2. 13 箇所の移行対応表


| 箇所                                  | 移行後                                                                                           | 備考                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| UsersAdmin GET                      | `$api.useQuery` + `placeholderData: keepPreviousData`                                         | page/search が init に入り自動再取得。users/total ステートと reload コールバック削除。keepPreviousData はキャッシュ配信ではなく「取得完了まで旧リストを表示し続ける」現行の state 保持と同じ表示パリティ(gcTime 0 との両立は §8 で確認、不成立なら本 query のみ gcTime を個別指定)                |
| UsersAdmin POST/PATCH               | `$api.useMutation` + onSuccess で `invalidateQueries({queryKey:['get','/api/private/users']})` | **workplan の「reservationReloadAtom 相当 → invalidateQueries」の本体**              |
| CommonHeader master GET             | `useQuery` + `enabled: !!loginUser` + `meta.askRetryOnServerError`                            | queryKey に loginUser が入らないため、ユーザ切替時の再取得は debug/changeUser 側の全 invalidate で担保 |
| CommonHeader logout POST            | `useMutation` + onSuccess で `setLogout(); qc.removeQueries(); navigate('/')`                  | キャッシュ残留対策(現行はキャッシュ自体がない)                                                     |
| Login POST                          | `useMutation`、`disabled={isPending}`(唯一の status 利用の置換)                                        | `'use no memo'` 維持                                                           |
| debug/Users GET / changeUser POST   | useQuery / useMutation + **全 invalidate** + navigate                                          | ユーザ切替の master 再取得を担保                                                         |
| DebugParamsModal GET/POST           | `enabled: isOpen` + askRetry meta / onSuccess で invalidate(手動二度目 GET を置換)                     | remount + staleTime 0 で開くたび再取得 = 現行パリティ                                      |
| PasswordChange / PasswordReset POST | useMutation。PasswordReset は 2 モード直列フローのため `mutateAsync` + try/catch(catch 空 = グローバル処理済み)      |                                                                              |
| debug/RemoteIp GET(計測ループ)           | **TanStack を通さず素の** `client.GET` **直呼び**(serializer/ヘッダは client 側で自動適用)                       | キャッシュ・スピナー・トーストは計測に有害。スピナーが出なくなるのは意図した変更                                     |




## 3. ApiRetryDialog: 温存(中身だけ差し替え)

`retryTargetApiCallsAtom` / ApiRetryDialog.tsx は無変更。push されるクロージャが `refetchQueries` になるだけ。refetch 再失敗 → onError 再発火 → 再登録、で現行の再追加セマンティクスと一致。TanStack の自動 retry(既定 3 回)とは別物のため `retry: false` で無効化する。

## 4. convertToDate 削除と型生成変更

- generateOpenApiSchema.ts: transform 削除(date-time → string に戻す)+ ts-json-schema-generator ブロックと `openapi-schema.json` 生成を削除。backend の `ts-json-schema-generator` 依存を除去
- 新方針: **ワイヤー正準形(オフセット付き ISO 文字列)を末端まで string で貫く**。表示等で Date が要る画面は画面ローカルで `new Date(s)`(サーバ出力は +09:00・秒精度なので安全にパース可能)
- createdAt/lastLoginAt の UI 消費ゼロのため型エラーは出ない見込み
- **検討済みの棄却案(2026-07-14 決定、蒸し返し不要)**: レスポンスを Date 型で受ける自動変換の再実装は 2 方式検討して棄却。①スキーマ駆動(現行 convertToDate 方式の温存)= openapi-schema.json と手書きウォーカーの同期問題(anyOf/$ref 非対応・ズレてもサイレント・テストのオラクル問題)。②パターン駆動(値が正準形に全文一致したら Date 化)= 自由入力文字列がたまたま正準形だった場合の偽陽性が原理的に排除できず、排除にはフィールド命名規約+起動時検証の追加が必要で雛形が複雑化。string 貫通 + 使用箇所 `new Date()` が最もシンプルで型と実体が常に一致する



## 5. Abort 意味論の変化


| 現行 useApiCall            | 移行後                                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| 同一フックの多重呼出で前リクエストを abort | query: queryKey 変更で observer ゼロ → 自動 abort(openapi-react-query は signal 消費済み)— パリティ維持                     |
| unmount 時 abort          | query: 同上 — パリティ維持。mutation: TanStack は signal を渡さず**中断されない — 挙動変更**(全 mutation はブロッキング中のため実質発生せず。許容して記録) |
| abort 時はトーストなし           | キャンセルは CancelledError で onError 不発火 → トーストなし — パリティ維持                                                     |




## 6. 削除物 / 温存物 / 追加物

- 削除: apiCall.ts 全体、activeApiCallsAtom / activeBlockingApiCallsAtom、openapi-schema.json、useApiCall 用の `useMemo` オプション安定化(CommonHeader / DebugParamsModal)
- 温存: retryTargetApiCallsAtom / isOpenReloadAppDialogAtom / logoutAtom、ApiRetryDialog / ReloadAppDialog、stores.ts の型ヘルパ
- 追加: historyBackRequestAtom、HistoryBackHandler.tsx、pages/debug/Test.tsx(`/debug/test` ルート。動作テスト用ページ、§8 参照)



## 7. 実装ステップ(1 PR・5 コミット、各コミットで verify 緑)

1. **型正準化**: transform 削除 + JSON 生成削除 + 再生成 + convertToDate 削除(useApiCall 本体は残す)。先にやらないと中間コミットが型嘘になる
2. **基盤導入**(useApiCall と共存): 依存追加(`@tanstack/react-query` + `openapi-react-query@^0.4.2`)、api.ts / queryClient.ts / HistoryBackHandler 新規、App.tsx、GlobalSpinner は atom + useIsFetching の合算(移行期両立)。pages/debug/Test.tsx + `/debug/test` ルートを新設し、新基盤の最初の消費者としてスモークを兼ねる(§8)
3. **UsersAdmin 移行**(参照実装。e2e smoke が CRUD 一巡をカバー)
4. **残り全ページ移行**
5. **クリーンアップ**: apiCall.ts 削除、atom 削除、依存除去、`grep useApiCall\|activeApiCalls` ゼロ確認



## 8. 手動パリティ確認チェックリスト(E2E で検出不能な項目)



### 動作テスト用ページ pages/debug/Test.tsx の新設

スピナー / ブロック系の確認は、ネットワークスロットリングではなく `GET /api/debug/wait?sleep=N`(認証不要。サーバ側で N ms 待って `{waited, now}` を返す)で任意の待ち時間を作って行う。そのための動作テスト用ページ `pages/debug/Test.tsx` を新設する(ルート `/debug/test`。RemoteIp 同様 URL 直打ちで開き、移行後も雛形の動作確認ページとして残す)。機能:

- **sleep ミリ秒入力 + 「ブロッキング実行」**: `$api.useQuery('get', '/api/debug/wait', {params: {query: {sleep}}}, {enabled: false})` を `refetch()` で発火(refetch は enabled を無視して実行できる)。完了後に `waited` / `now` を画面表示
- **「非ブロッキング実行」**: 同クエリを `meta: {blocking: false}` で発火(GlobalSpinner の blocking predicate の検証)
- **「3 連同時実行」**: sleep=1000 / 2000 / 3000 の 3 クエリを同時発火(fetching カウント合算の検証)

コミット 2(基盤導入)に含め、新 API 基盤($api / meta 型 / GlobalSpinner predicate)の最初の消費者としてスモークを兼ねる。


| 項目               | 手順                                      | 期待                                                                  |
| ---------------- | --------------------------------------- | ------------------------------------------------------------------- |
| エラートースト          | backend 停止 → users 画面で検索                | トースト表示(duration 3000・closable)、クラッシュなし                              |
| ApiRetryDialog   | backend 停止 → ログイン済みでリロード(master GET 失敗) | ダイアログ表示。再起動 → 再試行 → 閉・正常                                            |
| リトライ再失敗の再登録      | backend 停止のまま再試行                        | ダイアログが再度開く                                                          |
| forceLogout      | cookie 削除 → private API 実行              | トースト + ログイン画面遷移 + キャッシュ破棄                                           |
| reloadApp        | x-client-version を旧値に偽装                 | ReloadAppDialog 表示・**トーストなし**(actions のみ・message なしのパリティ)           |
| スピナー遅延表示・ブロック    | /debug/test で sleep=3000 ブロッキング実行       | 100ms 後スピナー表示・クリック不可、約 3 秒後解除                                       |
| 短時間はスピナー抑止       | sleep=50 ブロッキング実行                       | スピナーが一瞬も表示されない(100ms 遅延表示の効果)                                       |
| 非ブロッキング          | sleep=3000 非ブロッキング実行                    | スピナーは出るがクリックは透過(現行の activeApiCalls / activeBlockingApiCalls の関係と同じ) |
| 多重カウント合算         | 3 連同時実行                                 | 最長 sleep(3 秒)完了までスピナー維持、途中で消えない                                     |
| ワイヤー正準形の目視       | ブロッキング実行後の `now` 表示                     | `YYYY-MM-DDTHH:mm:ss+09:00`(string のまま表示されること)                      |
| ノーキャッシュ(再訪) | users 一覧表示 → home へ遷移 → users へ戻る | 前回リストが一瞬も表示されず、取得完了後に表示(gcTime 0 の効果 = 現行パリティ) |
| ページ切替の表示維持 | users でページ切替・検索変更 | 取得完了まで旧リストが表示されたまま(keepPreviousData が gcTime 0 でも機能すること。不成立なら §2 のフォールバック) |
| ユーザ切替            | debug/Users でユーザ変更                      | ヘッダ・tenantConfig が新ユーザで再取得                                          |
| ログアウト後キャッシュ      | ログアウト → 別ユーザでログイン                       | 前ユーザの一覧が一瞬でも表示されない                                                  |
| DebugParamsModal | 開閉・適用一巡                                 | 現行同等(開くたび最新値)                                                       |
| RemoteIp         | /debug/remoteIp                         | 計測完走(スピナーなしは意図した変更)                                                 |
| ヘッダ              | DevTools Network                        | x-for-preflight / x-client-version が全 API に付与                       |
| JST serializer   | `dateToJstCanonical(new Date())` を確認    | `YYYY-MM-DDTHH:mm:ss+09:00`(ミリ秒なし)                                  |




## 9. React Compiler 相性

TanStack Query v5 は useSyncExternalStore ベースで Compiler と互換。RHF 4 ファイルの `'use no memo'` は維持(3e で再評価)。`@tanstack/eslint-plugin-query` は任意(PR を薄く保つなら見送り)。

## 10. 意図的なパリティ逸脱一覧(PR 説明に記載)

1. JST 変換は Middleware でなく serializer(技術的制約)
2. mutation は unmount で abort されない
3. RemoteIp 計測中にスピナーが出ない
4. logout/forceLogout 時の removeQueries 追加
5. ノーキャッシュ方針の明示: `staleTime: 0` / `gcTime: 0` / `retry: false` / `refetchOnWindowFocus: false` / `refetchOnReconnect: false`(キャッシュ配信と自動再取得を一切持ち込まない)

