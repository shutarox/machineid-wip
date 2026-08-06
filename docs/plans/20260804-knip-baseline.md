# knip 導入と未使用コードの整理(4-4)

作成: 2026-08-04

## このドキュメントの位置づけ

`pnpm knip` を導入した経緯と、**検出項目をどう仕分けたかの記録**。ベースライン(整理後に残る報告)が何であり、なぜ残っているのかを説明する。

次に knip を流したときに**新しく出た項目だけが意味を持つ**ようにするのが目的。

## 目的の定義: 「掃除」ではなく「掃除の道具を用意する」

workplan の 4-4 は「knip 導入 + 最終掃除 / 未使用コード検出を **lint 群に追加**」と、一度きりの掃除と常設のゲートを束ねていた。雛形ではこの 2 つが逆方向を向く。

- 雛形が価値として出荷する足場(参照実装・注入点・DatePicker・debug ページ)は、**定義上すべて「未使用」に見える**
- 下流プロジェクトにとって「未使用」の大半は「**まだ**使っていない」であり、CI で落とすと**スキャフォールディングという行為そのものが罰される**

そこで `pnpm knip` は**手動コマンド**として用意し、`pnpm verify` には入れない。**まとまった削除やリファクタのあとに明示的に流す**運用にする(CLAUDE.md のルールに記載)。

## 導入根拠: 「消すと決めたのに残る」が 3 回起きている

| 項目 | 削除を決定 | 実際 |
|---|---|---|
| `exceljs` | 1-5(2026-07-10)で明記 | 3e-3(2026-08-03)まで残存。UI 移行中に偶然発見 |
| `pgdump` 系 | 1-5 で「全削除」と決定 | **現在も残存**(`docs/known-issues.md` 参照) |
| `uuid` / `date-fns` / `jotai-cache` / `tsconfig-paths` | 1-16 の依存掃除の趣旨 | 同じく 3e-3 まで残存 |

加えて **grep は「参照 0 件」しか見られない**。互いに参照し合う到達不能なファイル群(ドメインを丸ごと削除して作ったこの雛形では起きやすい)は grep では発見できず、エントリポイントからの到達可能性を見る knip でしか出ない。

## 整理の結果

```
導入直後:    ファイル 15 / 依存 6 / devDep 14 / export 58  = 93 件
設定調整後:  ファイル  4 / 依存 4 / devDep 13 / export 58  = 79 件  ← 偽陽性の解消
判断・削除後: ファイル  0 / 依存 0 / devDep  0 / export 17  = 17 件
```

### 削除したもの(17 件)

| 対象 | 種別 | 理由 |
|---|---|---|
| `backend/src/libs/datesToJSTString.ts` | ファイル | MySQL 時代の「+9h 一律適用」の名残。日時設計 ADR(`20260713-datetime-design.md`)に置換済み |
| `backend/src/libs/stringify.ts` | ファイル | 同上。JST 正準形の replacer は `prisma-connection.ts` にある |
| `@googleapis/sheets` / `google-auth-library` | 依存 | Google Sheets 連携は **1-5 で削除決定済み**なのに依存だけ残っていた |
| `pino` | 依存 | `app.ts` は `logger: false`。import 0 件 |
| `@fastify/helmet` | 依存 | セキュリティヘッダはインフラ層の責務とする方針。ADR `20260804-security-headers.md` |
| `@types/eslint` / `@types/eslint-config-prettier` / `@types/eslint__eslintrc` | devDep | ESLint 9 と `@eslint/eslintrc` は型を同梱 |
| `@types/extract-domain` | devDep | **本体の `extract-domain` が存在しない**孤立した型定義 |
| `eslint-plugin-promise`(backend / frontend) | devDep | どちらの eslint 設定にも登録されていない |
| `prettier-eslint` / `typesync` | devDep | scripts にもコードにも参照なし |
| `@typescript-eslint/eslint-plugin` / `parser`(frontend) | devDep | frontend は統合パッケージ `typescript-eslint` を使用。個別パッケージは未 import(**backend は直接 import しているので必要**) |
| `scheduler`(frontend) | devDep | React 内部パッケージ。import なし |

削除後 `pnpm verify` 緑を確認済み(lint / check / test / e2e とも影響なし)。

### 設定で黙らせているもの(理由つき)

`knip.json` の ignore は**この 5 つだけ**。判断済みのものを鳴らし続けると報告が読まれなくなるため、理由が説明できるものだけを黙らせる。

| 対象 | 分類 | 理由 |
|---|---|---|
| `pino-pretty` | **偽陽性** | `backend/script/dev-watch.sh` からシェルパイプで CLI 実行(`\| pnpm exec pino-pretty`)。knip は JS/TS の import しか追えない |
| `eslint-config-prettier` | **偽陽性** | `backend/eslint.config.mjs` の `compat.extends('prettier')` が実体。文字列 extends は追えない |
| `backend/src/libs/scriptLogger.ts` | 判断済み・残す | — |
| `backend/src/models/currentDate.ts` | 判断済み・残す | 仮想日時の拡張点。workplan 1-2 で温存決定済み |
| `frontend/src/components/ui/**` | 構造的 | shadcn 生成物。未使用 export(`DialogTrigger` `TableCaption` 等 44 件)が**構造的にゼロにならない**。生成物は `shadcn add` で再取得できるため、ファイル単位の検出を失う不利益は小さい |

### 誤検出を防ぐための entry 設定

| 設定 | 理由 |
|---|---|
| backend entry に `src/routes/**/*.ts` | ルートは `@fastify/autoload` が**動的に読み込む**ため静的解析では到達不能に見える。これがないとルート 10 本以上が偽陽性で出る(15 件 → 4 件の差はほぼこれ) |
| backend entry に `script/**` `test/**` `eslint-rules/*.mjs` | **テストとスクリプトからしか使われない注入点**(`setMailerForTesting` / `getLock`)を偽陽性にしないため。これがないとテスト戦略 ADR が依存する仕組みが「未使用」と報告される |
| ルート entry に `tools/*.js` `e2e/*.ts` | pnpm workspace 外のスクリプト群 |
| `ignore` に `**/generated/**` `src/@types/**` | Prisma クライアントと OpenAPI 型は自動生成物 |
| `ignoreBinaries` | `jq` / `pm2` / `psql` / `direnv` 等はシステムのコマンドで npm 依存ではない |

CSS 経由の依存(`@fontsource-variable/geist` / `tw-animate-css`)は **knip が `index.css` の import を追えるため例外指定は不要**だった。

## ベースライン: 残る 17 件(2026-08-04 時点)

**これらは「残す」と判断済み。** すべて backend / frontend のライブラリ層の export で、**雛形が案件のために置いている拡張点**が中心。ignore には入れていない(数が少なく一覧を目で追えるため、隠すより見えている方がよい)。

| 対象 | 場所 | 性質 |
|---|---|---|
| `hmacSha256` / `hmacSha256Base64` | `libs/cryptoUtils.ts` | 暗号ユーティリティの拡張点 |
| `AppError` | `libs/appError.ts` | 案件が使うエラー型 |
| `getParameter` / `getParameterAsFile` / `ssmClient` | `libs/ssmClient.ts` | SSM の拡張点 |
| `getTenantId` | `libs/prisma-connection.ts` | テナント ID の取得口 |
| `responseActions` / `ResponseAction` | `libs/commonSchemas.ts` | actions スキーマ |
| `COOKIE_DOMAIN` / `LOCAL_TIMEZONE` | `config.ts` | 設定定数 |
| `dateToJstCanonical` | `frontend/src/libs/api.ts` | JST 正準形への変換 |
| `toast` | `frontend/src/libs/queryClient.ts` | 再 export。画面側は `sonner` から直接 import しているため**実質未使用の可能性がある**(次の整理候補) |
| `appErrorHandler` / `swagger` の `default` | `plugins/` | 名前付きと default の二重 export(プラグイン登録形式に由来) |

**次に `pnpm knip` を流したときは、この一覧との差分だけを見ればよい。**

## 運用

- **まとまった削除やリファクタのあとに `pnpm knip` を流す**(CLAUDE.md のルール)
- 新しく出た項目は「削除する / 残す(理由を決めて ignore か本文へ記録)」のどちらかに必ず決着させる。**判断を保留したまま報告を増やさない**
- `pnpm verify` には入れない(CI ゲート化を見送った理由は冒頭のとおり)
