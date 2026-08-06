---
name: add-api-endpoint
description: API エンドポイント(ルート)を追加・変更するときの手順。route ファイルの命名と配置、モデル関数、統合テストの 1:1 配置、OpenAPI 型のフロントへの受け渡しに使う。
---

# API エンドポイントの追加

**参照実装は users CRUD。** 迷ったらこれを読んで写す。

```
backend/src/routes/api/private/users.{GET,POST,PATCH}.ts   route(Zod スキーマ・認可)
  └ backend/src/models/users.ts                            tx を受け取るモデル関数 → 純粋関数
backend/test/integration/routes/api/private/users.*.test.ts  ルートテスト
frontend/src/pages/UsersAdmin.tsx                          画面
```

## 1. ルートファイルを置く

`backend/src/routes/api/` 配下に **`<リソース>.<メソッド>.ts`** で置く(例: `announcements.GET.ts`)。`@fastify/autoload` が自動で読み込み、`parseRouteFromFileUrl()` がファイル名から URL とメソッドを解決する。

- 認証が必要なものは **`private/` 配下**に置く
- メソッドは GET / POST / PUT / PATCH / DELETE
- **パスパラメータは使えない。** URL はファイル名から `/<リソース>` に決まるので `/users/:id` は表現できない。単一リソースの指定は **querystring か body の `id`** で行う(PATCH は body、DELETE は querystring が扱いやすい)
- リクエスト検証・レスポンスシリアライズは **Zod スキーマ**(`fastify-type-provider-zod`)
- 日時は `backend/src/libs/zDate.ts` の **`zDateIn()` / `zDateOut()`** を使う(独自に文字列を組まない)
- ロールで弾くなら `models/users.ts` の `requireAdmin` を使う。**行レベルの可視範囲があるなら、可視外は 403 ではなく 404** を返す(403 は id の存在を漏らす)
- **querystring の boolean に `z.coerce.boolean()` を使わない。** `Boolean('false') === true` なので `?flag=false` が `true` になる。`z.enum(['true', 'false']).optional().transform(v => v === 'true')` を使う(生成される OpenAPI 型も `"true" | "false"` になり、呼び出し側で曖昧さが消える)。数値は `z.coerce.number()` でよい

## 2. モデル関数を書く

**route → tx を受け取るモデル関数 → 純粋関数**、の 3 層。service / repository 層は作らない。

- DB に触る関数は `tx` を受け取る。**純粋関数は `tx` を受け取らない**(未使用の `tx` 引数は lint が error)
- クエリは `nestableTransactionWithTenantId` のコンテキスト内で実行する
- **ロールによって見える行を変える場合は、route で分岐せずモデルの純粋関数(where ビルダー)に寄せる**(`buildUserSearchWhere` に倣う)。route 側は条件を渡すだけにする

## 3. 統合テストを置く

**`src/routes/` とディレクトリ階層・ファイル名とも 1:1 対応**させる。

```
src/routes/api/private/users.GET.ts
  → test/integration/routes/api/private/users.GET.test.ts
```

配置ずれは `backend/test/integration/framework/testPlacement.test.ts` が検出する。共通ヘルパーは `_` 始まり(`_helpers.ts`)にすればミラー対象外。

- **`backend/test/integration/routes/_helpers.ts`** の `setupAdminSession` / `setupMemberSession` / `parseResponse` を使う
- データは **`backend/test/factories.ts`** で作る
- **認可(ADMIN 以外が 403 になること)を必ずテストする**

## 4. フロントへ型を渡す

```bash
# backend/ で実行
pnpm gen:openapi
```

`frontend/src/generated/openapi-schema.d.ts` が更新される(手動編集禁止)。以後フロントでは `frontend/src/libs/api.ts` の `$api.useQuery` / `$api.useMutation` にパスとメソッドを渡すと型が効く。

- 更新後の再取得は `invalidateQueries`
- ブロッキング表示・リトライダイアログの要否は query / mutation の `meta`(型は `ApiMeta`)で指定する

## 5. 検証

`pnpm verify` を通す(`verify` スキル参照)。E2E を足すなら `e2e/` に置く。
