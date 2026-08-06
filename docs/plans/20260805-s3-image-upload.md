# S3 バックエンドの画像アップロード参照実装(報告書 CRUD)

作成: 2026-08-05

## Context

雛形に **ファイルアップロードの参照実装**が無い。users CRUD は「DB だけで完結するリソース」の見本だが、実案件では**外部ストレージ・画像処理・仮アップロードの後始末**が必ず出てくる。ここを参照実装として持たせる。

題材は報告書(Report)+ 添付画像(UploadedImage)。一覧・送信フォーム・削除まで一通り揃える。

**この実装で雛形に増える「初めての前例」**:

- 外部ストレージ(S3)の注入点 — 現状 SES / SSM しか無い
- multipart によるファイル受け取り
- **ロールで行レベルの可視範囲を変えるリソース** — CLAUDE.md に判断基準はあるが実装例が無い(users CRUD は ADMIN 専用)
- **DELETE ルート** — 現状ゼロ
- 定期実行スクリプト(仮アップロードの後始末)

## 確定した判断(ユーザー選択)

| 論点 | 決定 |
|---|---|
| アップロード経路 | **API 経由(multipart)**。サーバで EXIF 除去とサムネ生成をしてから S3 に PUT。**非同期処理は不要** |
| 可視範囲 | **MEMBER は自分の報告書のみ / ADMIN はテナント内全員**。可視外の id への操作は **404** |
| S3 の互換 | **統合テストはフェイク(メモリ)、ローカル開発と E2E は MinIO**。CI は **e2e ジョブにのみ** minio service |
| 制限値 | 1 報告書 **最大 10 枚** / 1 枚 **最大 10MB** / 本体は長辺 **2000px** / サムネ長辺 **400px** / **WebP** |
| S3 のパス | **`tenantId` を含めない**(アップロード時点で確定しないユーザがありうる前提) |
| DB の `tenantId` | Report / UploadedImage **とも必須で持つ**。RLS 拡張は **`tenantId` カラムを持たないモデルを検査対象外にする**(エラーにならず素通りする)ため、外すと機械的なテナント分離がこのモデルだけ静かに効かなくなる |

## 調査で確定した既存の作法(必ず踏襲する)

| 事実 | 効いてくる場所 |
|---|---|
| **パスパラメータが使えない**(URL はファイル名で決まる) | 単一リソース指定は querystring か body の `id` |
| ルートは handler 内で `nestableTransactionWithTenantId` を**明示的に**張る | **S3 I/O は tx の外**に出す。`assertNotInTransaction` が守る |
| `libs/mailer.ts` の注入点(`setMailerForTesting` + `assertNotInTransaction`) | **storage をこの形にそのまま写す** |
| `buildUserSearchWhere`(`models/users.ts`) | 可視範囲は**モデルの where ビルダーに寄せる**(route で分岐しない) |
| RLS: `tenantId` を持つモデルは tx コンテキストと一致が必須 | **Report / UploadedImage とも `tenantId` が要る**(ユーザー指定の列に加えて) |
| `frontend/src/libs/api.ts` の `bodySerializer` が `JSON.stringify` 固定 | **FormData 送信はリクエスト単位で上書きが必要** |
| `terraform.example/.../39_ecs-scheduled-task.tf` | 定期実行の前例(`rate(1 hour)` で `node build/script/xxx.js`) |

**新規依存**: `@aws-sdk/client-s3` / `@aws-sdk/s3-request-presigner` / `@fastify/multipart` / `sharp`(backend)

## 設計

### スキーマ(`backend/prisma/schema.prisma`)

```prisma
model Report {
  id, tenantId, userId, title, comment, createdAt, updatedAt
  uploadedImages UploadedImage[]
  @@index([tenantId, userId, createdAt])
}

model UploadedImage {
  id, tenantId, userId
  reportId  String? @db.Uuid   // ← null = 仮アップロード、非 null = 確定
  storageKey, thumbnailKey, mimeType, byteSize, width, height
  rawExif   Json
  createdAt, updatedAt
  @@index([tenantId, reportId])
  @@index([tenantId, createdAt])   // 3 日タイムアウトの抽出用
}
```

**確定状態は `reportId` の null / 非 null で表す。** 専用の `confirmedAt` は持たない(2 つの真実を作らない)。

### S3 のパス命名規則

```
uploaded-images/{uploadedImageId}/original.webp
uploaded-images/{uploadedImageId}/thumb.webp
```

**パスに `tenantId` を入れない**(ユーザー判断)。派生案件では**アップロード時点で tenantId が確定しないユーザ**がありうるため、パスをテナントに依存させない。

- **確定してもパスを変えない**(移動もコピーもしない)。確定は DB の状態遷移だけ — 移動を挟むと失敗経路が増える
- `uploadedImageId` は UUIDv7 なので、プレフィックス一覧が時刻順に並ぶ
- 性能上の懸念はない。S3 は 2018 年以降プレフィックス単位で自動分割され、単一プレフィックスでも 3,500 PUT/s 出る

**パス構造はセキュリティ境界ではない。** 実際の境界は「presigned URL を発行する前に、その画像がその利用者から見えるかを DB で確かめる」ところにある。パスにテナント ID があるから安全、と考えない。

失うのは運用上の利便性だけで、いずれも代替がある。

| 失うもの | 代替 |
|---|---|
| テナント単位の一括削除 | DB からキーを列挙して削除(3 日タイムアウトの掃除と同じ仕組み) |
| prefix ベースのライフサイクルルール | S3 のライフサイクルは**オブジェクトの作成日時**で判定できる |
| テナント別の使用量集計 | `byteSize` カラムから DB で集計 |
| prefix 単位の IAM 制限 | S3 に直接触るクライアントが存在しないため不要 |

### ストレージ層(`backend/src/libs/storage.ts`)

`libs/mailer.ts` と同じ構造にする。

```ts
export type Storage = {
  put(key, body, contentType): Promise<void>;
  presignGet(key, expiresInSec): Promise<string>;
  delete(keys: string[]): Promise<void>;
};
const s3Storage: Storage = { /* @aws-sdk/client-s3 */ };
let storage: Storage = s3Storage;
export const setStorageForTesting = (fake: Storage | null) => { ... };
```

各入口で `assertNotInTransaction('S3 …')` を呼ぶ。設定は `config.ts` に追加(`S3_BUCKET` / `S3_ENDPOINT` / `S3_FORCE_PATH_STYLE` / `AWS_REGION`)。MinIO は `S3_ENDPOINT` + `forcePathStyle: true` で AWS SDK のまま動く。

### ルート(5 本)

| ファイル | 役割 |
|---|---|
| `uploadedImages.POST.ts` | **multipart で 1 枚**受け取り、EXIF 除去 + サムネ生成 + S3 PUT → 仮画像を作って id とプレビュー用 presigned URL を返す |
| `uploadedImages.DELETE.ts` | querystring `id`。プレビュー中の取り消し(S3 と DB から削除) |
| `reports.GET.ts` | 一覧。ページネーション + 各報告書のサムネ presigned URL |
| `reports.POST.ts` | `title` / `comment` / `imageIds[]` で作成。**画像 1 枚以上を必須**とし、指定された仮画像に `reportId` を入れて確定 |
| `reports.DELETE.ts` | querystring `id`。報告書と画像を DB / S3 から削除 |

**tx の外で S3、tx の中で DB** を徹底する(`passwordResetRequest.POST.ts` のメール送信と同じ並び)。

### 可視範囲(`backend/src/models/reports.ts`)

```ts
export const buildReportListWhere = (
  tenantId: string,
  actor: { role: Role; userId: string }
): Prisma.ReportWhereInput =>
  actor.role === 'ADMIN' ? { tenantId } : { tenantId, userId: actor.userId };
```

単一取得も同じ where を通し、**可視外は 404**(403 だと id の存在が漏れる)。操作者のロールは `models/users.ts` に取得関数を足して得る(CLAUDE.md の既定どおり、`requireAdmin` の隣)。

### 画像処理(sharp)

1. EXIF を読んで `rawExif` に保存(**記録は残す**)
2. **EXIF を除去**して長辺 2000px・WebP の本体を生成
3. 長辺 400px・WebP のサムネを生成
4. `width` / `height` は加工後の値を保存

### 仮アップロードの後始末(`backend/script/cleanup_uploads.ts`)

`reportId IS NULL AND createdAt < now() - 3 days` を S3 と DB から削除する。**本番は ECS scheduled task**(terraform.example の前例に倣う)、ローカルは手動実行。「非同期処理はどこでやるか」への答えはこれだけで、アップロード経路そのものは同期で完結する。

### フロントエンド

| 画面 | 内容 |
|---|---|
| `/reports` | 一覧。サムネ表示 + 削除ボタン(`alert-dialog` で確認 → 削除) |
| `/reports/new` | 送信フォーム。title / comment / 画像(任意数、**送信時 1 枚必須**)。選択即アップロードしてプレビュー表示、個別に取り消し可 |

`App.tsx` にルート追加、`CommonHeader` に導線追加。フォームは **RHF の 3 制約**(`useFormState` / `useWatch` / `useController`)に従う。**FormData 送信時だけ `bodySerializer` を上書き**する(既定の `JSON.stringify` が FormData を壊すため)。

### ローカル / CI

- `docker/docker-compose.local.yml` に **minio** サービスを追加(コンソール付き、バケットは起動時に作成)
- `.github/workflows/ci.yml` は **`matrix.stage == 'e2e'` のジョブにのみ** minio service を足す

## 実装の順序(PR は分ける)

1 PR = 1 テーマの規約に従い 4 本に分ける。各 PR で `pnpm verify` 緑にする。

| # | 内容 |
|---|---|
| 1 | **計画の記録 + 基盤**: 本計画の記録・依存追加・`libs/storage.ts`(注入点)・config・MinIO(compose / CI)。storage 単体の統合テスト |
| 2 | **アップロード API**: スキーマ 2 モデル・マイグレーション・sharp の加工・`uploadedImages.{POST,DELETE}` + 統合テスト |
| 3 | **報告書 API**: `reports.{GET,POST,DELETE}`・`models/reports.ts` の where ビルダー・可視範囲の統合テスト |
| 4 | **フロント + 後始末**: 2 画面・E2E(MinIO 経由)・`cleanup_uploads.ts`・terraform の scheduled task |

## 検証

各 PR 共通で `pnpm verify` 緑 + CI 緑。加えて:

1. **EXIF が実際に消えていること** — アップロード後に S3 のオブジェクトを sharp で読み直し、EXIF が無いことを assert(「除去したつもり」を防ぐ)
2. **`rawExif` には残っていること** — 記録用途が壊れていないこと
3. **可視範囲** — MEMBER が他人の報告書 id を指定して 404、ADMIN は 200
4. **枚数・サイズ上限** — 11 枚目と 10MB 超で 400
5. **画像 0 枚の報告書作成が 400**
6. **presigned URL で実際に画像が取得できること** — E2E(MinIO)。ここが S3 固有の配線を通す唯一の経路
7. **`cleanup_uploads.ts`** — 3 日より古い仮画像だけが消え、確定済みと新しい仮画像が残ること。S3 のオブジェクトも消えること
8. **tx 内で S3 を呼ぶと落ちること** — `assertNotInTransaction` のリグレッションテスト
9. `pnpm knip` がベースラインどおり

## 事前に潰すリスク(PR 1 で先に確認する)

| リスク | 確認方法 |
|---|---|
| **sharp が arm64 + 厳格な pnpm 解決で入るか** | `public-hoist-pattern` を外したばかりなので、プラットフォーム別 optional 依存が解決できるかを最初に確かめる。ダメなら該当パッケージを明示宣言 |
| **`@fastify/multipart` と `fastify-type-provider-zod` の同居** | multipart の body は Zod で素直に検証できない。ルートの `schema` をどう書くと **OpenAPI 生成(`pnpm gen:openapi`)が壊れないか**を最初に確かめる |
| **Dockerfile.local への反映** | sharp / MinIO クライアントに system 依存が要るなら `docker/Dockerfile.local` にも入れる(CLAUDE.md の規約) |

## スコープ外

- 画像の差し替え・並び替え(削除して入れ直す)
- 報告書の編集(作成と削除のみ)
- CloudFront 署名 URL(presigned GET で足りる)
- ウイルススキャン・画像のモデレーション

---

## 実施記録(2026-08-05 完了)

4 本の PR に分けて実施。全 PR で `pnpm verify` 緑・`pnpm knip` ベースラインどおり。

| # | PR | 内容 |
|---|---|---|
| 1 | #41 | 計画の記録・依存追加・`libs/storage.ts`・config・MinIO(compose) |
| 2 | #42 | スキーマ 2 モデル・マイグレーション・sharp の加工・`uploadedImages.{POST,DELETE}` |
| 3 | #43 | `reports.{GET,POST,DELETE}`・`models/reports.ts` の where ビルダー |
| 4 | #44 | フロント 2 画面・E2E・`cleanup_uploads.ts`・terraform・CI の MinIO |

### 計画から変えた判断

| 論点 | 計画 | 実際 | 理由 |
|---|---|---|---|
| id の採番 | 記載なし | **`uuid` パッケージの `v7()` で route 側が先に採番** | `storageKey` / `thumbnailKey` が NOT NULL かつ id から決まるので、Prisma に採番させると INSERT できない。キーを導出せずカラムに持つ理由は `schema.prisma` にコメントで記録 |
| CI の MinIO | `services:` に足す | **e2e ジョブの step で `docker run`** | `services:` は image / env / ports / options しか渡せず、minio が要求する `server /data` というコマンド引数を渡せない |
| terraform の前例 | `update_doctors` に倣って追加 | **`update_doctors` / `update_login_info` を `cleanup_uploads` に置き換え** | 参照先スクリプトが雛形に存在せず、実顧客のドメイン名(`hcho.jp` 等)が引数に残っていた。実在するバッチに差し替えて前例を成立させた |

### 踏んだ罠(次に同じことをする人向け)

- **`@fastify/multipart` の `toBuffer()` はサイズ超過で例外を投げる。** `part.file.truncated` を見る実装では 500 になる。`FST_REQ_FILE_TOO_LARGE` を catch して 400 に直すこと
- **`'*'`(テナント横断)は tx のコンテキストに渡すもので、`where` に書くと SQL に流れて `invalid input syntax for type uuid` で落ちる**
- **スキーマのコメントだけを変えても `pnpm db:generate` が要る。** 生成クライアントはスキーマ本文を `inlineSchema` として丸ごと埋め込んでいるため、CI の生成物ドリフト検査に引っかかる
- RLS の都合で **`findUnique` 系は `tenantId` を `where` に入れられない**。テストから直接引くときは `findFirst` 系にする

### presigned URL のホスト名(ローカル開発で踏んだ問題)

**症状**: ホスト(docker の外)のブラウザから画像プレビューが表示できない。presigned URL が `http://miniohost:9000/...` で署名されており、`miniohost` は docker ネットワーク内でしか解決できないため。

**URL のホスト名を後から差し替えることはできない。** SigV4 は Host ヘッダを署名対象に含むので、発行後に書き換えると **403** になる(実測で確認)。

**対応**: 発行専用の `S3_PUBLIC_ENDPOINT`(未設定なら `S3_ENDPOINT` と同じ)を足し、**署名の時点でブラウザが到達できるホスト名を使う**。

| 環境 | `S3_ENDPOINT`(サーバ → MinIO) | `S3_PUBLIC_ENDPOINT`(ブラウザ → MinIO) |
|---|---|---|
| 開発コンテナ(ホストのブラウザ) | `miniohost:9000` | `localhost:9000`(compose が 9000 を公開) |
| E2E(コンテナ内の chromium) | `miniohost:9000` | `miniohost:9000` |
| CI | `localhost:9000` | `localhost:9000` |
| 本番(実 S3) | 未設定 | 未設定 |

**副作用: E2E が dev サーバを再利用できなくなった。** dev と E2E で `S3_PUBLIC_ENDPOINT` が違う以上、1 つのプロセスを共有できない。E2E は専用ポート 8082 で自前起動する(`reuseExistingServer: false`)。**起動コマンドは dev と同じ tsx のまま**なので ADR `20260804-dev-server.md` の「dev と E2E で起動経路を食い違わせない」は保っている。

代償は E2E の所要時間だが小さい。**dev 起動中に各 3 回測って、再利用 25.8/22.1/24.1 秒 → 専用 26.9/26.4/28.8 秒(約 +3 秒)**。tsx の起動が速いため、`docs/known-issues.md` の見積り(7〜9 秒)より小さく収まっている。

**E2E に渡す値は `E2E_S3_PUBLIC_ENDPOINT` という別名で受ける。** `S3_PUBLIC_ENDPOINT` をそのまま `process.env` から拾う実装にしたところ、**開発コンテナの値(ホストのブラウザ向けの `localhost:9000`)を E2E のバックエンドが継承**し、コンテナ内の chromium が画像を読めずに落ちた(`naturalWidth: 0`)。用途が違う値に同じ変数名を使ったのが原因で、名前を分けて解決した。

**CI は影響なし。** CI には dev サーバが無いので `reuseExistingServer: true` は元から一度も効いておらず、playwright が常に自前でバックエンドを起動していた。ポートが 8080 から 8082 に変わるだけ。

### この実装で雛形に増えた「初めての前例」

- 外部ストレージ(S3)の注入点(`libs/storage.ts`)+ フェイク(`test/fakes.ts`)
- multipart によるファイル受け取りと、`bodySerializer` を差し替える FormData 送信(`libs/api.ts` の `uploadImage`)
- **ロールで行レベルの可視範囲が変わるリソース**(`buildReportListWhere`、可視外は 404)
- **DELETE ルート**(`uploadedImages.DELETE` / `reports.DELETE`)
- 定期実行スクリプト(`script/cleanup_uploads.ts`)と、その terraform 定義
