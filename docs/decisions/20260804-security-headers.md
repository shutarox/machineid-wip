# ADR: helmet は入れず、アプリ層で完結するヘッダだけ付ける(CSP / HSTS は TLS 終端の責務)

- 状態: **採用**(2026-08-04)
- 関連: `docs/known-issues.md`(HSTS の未設定)、`docs/plans/20260804-knip-baseline.md`

## 改定履歴

| 日付 | 内容 |
|---|---|
| 2026-08-04 | 初版。「セキュリティヘッダはアプリ層に置かない」と決定し、`@fastify/helmet` を削除 |
| 2026-08-04 | **改定**。「アプリ層に置かない」は**強すぎた**。却下していたのは *helmet を丸ごと入れること*(CORP という将来の地雷を抱える)であって、*個別のヘッダを明示的に付けること*ではない。**`nosniff` はアプリ層で付ける**方針に変更した(下記「アプリ層で付けるもの」) |

## 背景

`@fastify/helmet` が依存に入っていたが、**どこからも読み込まれていなかった**(4-4 の knip 導入で検出)。「未使用だから消す」で片付けず、セキュリティヘッダをどの層で付けるかを決める必要があった。

## 決定

**`@fastify/helmet` は入れない**(依存ごと削除する)。そのうえで、**アプリ層で完結し害のないヘッダは自前で付け、ホスト全体に効くものは CloudFront / ALB(TLS 終端)の責務とする。**

### アプリ層で付けるもの

| ヘッダ | 場所 | 理由 |
|---|---|---|
| `X-Content-Type-Options: nosniff` | `app.ts` の `onSend` フック | 1 行で完結し、依存も要らず、**ローカル開発でも効く**。`terraform apply` を待たずに全レスポンスへ付く |

`onSend` に置いているのでステータスコードに依らず付く(200 / 401 / 404 で固定済み: `test/integration/framework/securityHeaders.test.ts`)。

### TLS 終端に任せるもの

この構成は **CloudFront + S3 で SPA、ALB で API** という別オリジンの分離構成で、バックエンドは直接公開されない。helmet のデフォルト 13 ヘッダをこの構成に当てると、大半が効かないか有害になる。

| ヘッダ | この構成での評価 |
|---|---|
| `Content-Security-Policy` | **ほぼ無意味**。JSON API のレスポンスにブラウザは適用しない。CSP を効かせたいのは SPA を配信する CloudFront 側 |
| `Strict-Transport-Security` | アプリで付けても守れるのは「ブラウザが API ホストへ直接 HTTP アクセスする」経路だけ。実際の呼び出しは SPA からの絶対 HTTPS URL への `fetch` で、降格しない。**ユーザーが URL を打つのは SPA ホストで、そこはアプリ層から触れない** |
| `Cross-Origin-Resource-Policy: same-origin` | **有害になり得る**。フロントと API は別オリジン。`fetch` + CORS は CORP の対象外なので現状は壊れないが、将来 API から画像やファイルを `<img>` / `<script>` で直接参照する構成にするとブロックされる |

**helmet を丸ごと入れると、実質的な価値があるのは `nosniff` 程度なのに、CORP という将来の地雷を抱える。** だから helmet は入れず、価値のある `nosniff` だけを自前で付ける。

`nosniff` を CloudFront / ALB ではなくアプリ層に置いたのは、**アプリ層で完結し、二層に分かれる不利益が無いから**。CSP / HSTS は「アプリ層に置いてもホストの一部しか守れない」ため二層化の不利益が実利を上回るが、`nosniff` はレスポンス単位で完結するのでその問題が起きない。

## 現状(2026-08-04 時点)と残っている宿題

- `nosniff` → **アプリ層で対応済み**(`app.ts` の `onSend`)
- **HSTS は未設定**。ALB は 80 → 443 リダイレクトのみで、`terraform/environments/` にも応答ヘッダの設定がない → `docs/known-issues.md` に記録

実害が限定的なのは、セッションクッキーが `secure: true` + `httpOnly` + `sameSite: 'strict'` + `signed` で守られているため(`backend/src/config.ts`)。

## 却下した選択肢

- **helmet をデフォルトのまま導入する**: 上表のとおり、この構成では CSP / HSTS が効かないか二重になり、CORP は将来の地雷になる
- **helmet を必要なヘッダだけ有効化して導入する**(CSP / HSTS / CORP を off): 実質 `nosniff` 1 本のために依存を 1 つ増やすことになる。`onSend` の 1 行で足りる
- **`nosniff` も CloudFront / ALB 側で付ける**(改定前の方針): 動くが、**ローカル開発と CI では付かない**ため「本番だけ挙動が違う」状態になり、テストでも固定できない

## エージェント向けの注意

- **`@fastify/helmet` を再導入しないこと。** `nosniff` は既に `app.ts` の `onSend` で付いている(`test/integration/framework/securityHeaders.test.ts` が固定)。helmet を入れると CORP という将来の地雷が付いてくる
- **CSP / HSTS をアプリ層で付けないこと。** ホストの一部しか守れず、設定箇所が 2 層に分かれる。**CloudFront の response headers policy**(managed の SecurityHeadersPolicy など)か ALB の `routing.http.response.*` で対応する
- アプリ層にヘッダを足したくなったら、**「レスポンス単位で完結するか」**で判断する。完結するなら `onSend` に足してテストで固定する。ホスト全体やブラウザの記憶に効くもの(HSTS のような)は TLS 終端に置く
- **この前提は「CloudFront / ALB の背後に置く」構成に依存する。** 雛形から派生した案件が単一コンテナで直接公開するなどの構成を取る場合は前提が崩れるので、そのときは helmet の導入を検討し、この ADR に改定履歴を追記すること
