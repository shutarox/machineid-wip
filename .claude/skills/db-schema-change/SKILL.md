---
name: db-schema-change
description: DB スキーマ(Prisma)を変更するときの手順。テーブル・カラムの追加/変更/削除、マイグレーションの生成と適用、Prisma クライアントの再生成に使う。
---

# DB スキーマ変更

## 前提

- 編集するのは **`backend/prisma/schema.prisma`** のみ。`schema.prisma.generated` は `db:case-format` が作る中間生成物なので手で触らない(Prisma CLI は `backend/prisma.config.ts` の指定でこちらを参照する)
- **`backend/prisma/migrations/*` を直接書かない。** 必ずコマンドで生成する
- 接続 URL はスキーマに書かない。CLI は `prisma.config.ts`、実行時は driver adapter(`@prisma/adapter-pg`)が環境変数 `DB_URL` から受け取る(Prisma 7 方式)

## 手順

すべて `backend/` で実行する。

```bash
# 1. backend/prisma/schema.prisma を編集する

# 2. マイグレーションを生成(内部で db:case-format → prisma migrate dev --create-only)
pnpm db:migrate:create --name <migration_name>

# 3. DB へ適用(内部で prisma generate も走る)
pnpm db:migrate:deploy

# 4. 生成された Prisma クライアントを含めてコミットする
```

`backend/src/generated/prisma/` は **git にコミットする**運用(`prisma-client` generator)。CI が「再生成して差分ゼロ」を検証するので、**生成物のコミット漏れは CI で落ちる**。import は `@/generated/prisma/client.js` から行い、生成物は手動編集しない。

## モデルを書くときの制約

| 制約 | 内容 |
|---|---|
| **`tenantId`** | テナントに属するモデルには `tenantId` を持たせる。持たせた時点で Prisma 拡張の RLS 検査対象になり、`tenantId` の欠落・不一致は実行時に throw する |
| **`@db.Date`** | **カラム名が `date` のときだけ**使える(起動時にスキーマを検証し、違反があれば例外)。つまり **1 モデルが持てる `@db.Date` は事実上 1 本**。日付が複数必要なら 2 本目以降は `DateTime` にする |
| **`DateTime`** | `@db.Timestamptz(3)` で保存する |

## 変更後にやること

- ルートの request / response スキーマが変わったなら **`pnpm gen:openapi`**(フロントへ型を渡す。`add-api-endpoint` スキル参照)
- 統合テストのデータ生成は `backend/test/factories.ts` に足す
- **`pnpm verify`** を通す(`verify` スキル参照)

## やってはいけないこと

- `prisma db push` を通常の変更フローに使う(マイグレーション履歴が残らない)
- `migration.sql` を手で書く・後から書き換える
- `schema.prisma.generated` を編集する
