# ADR: ファイルアップロードは API 経由の同期処理とし、仮アップロード + タイムアウト回収で確定させる

- 状態: **採用**(2026-08-05)
- 関連: `docs/decisions/20260710-server-layering.md`、`docs/decisions/20260806-deploy-and-scheduled-jobs.md`(回収ジョブの起動経路)

## 背景

users CRUD は「DB だけで完結するリソース」の参照実装だが、実案件では**外部ストレージ・画像処理・仮アップロードの後始末**が必ず出てくる。報告書(Report)+ 添付画像(UploadedImage)を題材に、これを参照実装として持たせた。

この実装で初めて前例ができたもの:

- 外部ストレージ(S3)の注入点 — それまで SES / SSM しか無かった
- multipart によるファイル受け取り
- **ロールで行レベルの可視範囲が変わるリソース** — 判断基準はあったが実装例が無かった(users CRUD は ADMIN 専用)
- **DELETE ルート** — それまでゼロ
- 定期実行ジョブ(仮アップロードの後始末)

## 決定

### 1. アップロードは API 経由の multipart で、同期で完結させる

ブラウザから S3 へ直接 PUT させる(presigned PUT)のではなく、**API がファイルを受け取り、EXIF 除去とサムネ生成をしてから S3 に PUT する**。非同期のジョブキューは置かない。

サーバが中身を検査・加工してからでないと保存できない要件(EXIF 除去)がある以上、直接 PUT は選べない。加工は sharp で数百 ms なのでリクエスト内で完結する。

### 2. 確定状態は `reportId` の null / 非 null で表す

アップロードは「仮」で作られ、報告書の作成時に `reportId` が入って確定する。**専用の `confirmedAt` カラムは持たない**(同じ事実に対する真実を 2 つ作らない)。

**確定してもオブジェクトを移動・コピーしない。** 確定は DB の状態遷移だけにする。移動を挟むと失敗経路が増え、S3 と DB の不整合が生まれる余地ができる。

確定されなかった仮画像は **3 日のタイムアウトで回収**する(`src/jobs/cleanupUploads.ts`)。これが「非同期処理はどこでやるか」への答えで、アップロード経路そのものは同期のままにできる。

### 3. S3 のパスに `tenantId` を含めない

```
uploaded-images/{uploadedImageId}/original.webp
uploaded-images/{uploadedImageId}/thumb.webp
```

派生案件では**アップロード時点で tenantId が確定しないユーザ**がありうるため、パスをテナントに依存させない。`uploadedImageId` は UUIDv7 なのでプレフィックス一覧は時刻順に並ぶ。性能上の懸念はない(S3 は 2018 年以降プレフィックス単位で自動分割され、単一プレフィックスでも 3,500 PUT/s 出る)。

**パス構造はセキュリティ境界ではない。** 実際の境界は「presigned URL を発行する前に、その画像がその利用者から見えるかを DB で確かめる」ところにある。**パスにテナント ID があるから安全、と考えないこと。**

失うのは運用上の利便性だけで、いずれも代替がある。

| 失うもの | 代替 |
|---|---|
| テナント単位の一括削除 | DB からキーを列挙して削除(タイムアウト回収と同じ仕組み) |
| prefix ベースのライフサイクルルール | S3 のライフサイクルは**オブジェクトの作成日時**で判定できる |
| テナント別の使用量集計 | `byteSize` カラムから DB で集計 |
| prefix 単位の IAM 制限 | S3 に直接触るクライアントが存在しないため不要 |

### 4. DB 側は Report / UploadedImage とも `tenantId` を必須で持つ

Prisma 拡張の RLS 検査は **`tenantId` カラムを持たないモデルを検査対象外にする**(エラーにならず素通りする)。外すと、機械的なテナント分離がこのモデルだけ静かに効かなくなる。

### 5. 可視範囲はモデルの where ビルダーに寄せ、可視外は 404

```ts
export const buildReportListWhere = (
  tenantId: string,
  actor: { role: Role; userId: string }
): Prisma.ReportWhereInput =>
  actor.role === 'ADMIN' ? { tenantId } : { tenantId, userId: actor.userId };
```

route では分岐しない(`buildUserSearchWhere` に倣う)。**一覧と単一取得に同じ where を通す** — 分けると 403 と 404 が食い違う。可視外の id への操作は **404**(403 は「その id は存在する」ことを漏らす)。

### 6. S3 の I/O は tx の外に出し、DB を先にする

`libs/storage.ts` を `libs/mailer.ts` と同じ注入点の形にし(`setStorageForTesting` + `assertNotInTransaction`)、各入口で tx 内呼び出しを実行時に禁止する。tx 内で書くとロールバック時にオブジェクトだけ残る。

**DB と S3 の順序は DB を先**にする。逆順だと DB 失敗時に**どこからも参照されないオブジェクト**が残り、回収の手がかりが消える。

### 7. EXIF は除去するが、内容は DB に記録する

1. EXIF を読んで `rawExif` に保存(**記録は残す**)
2. **EXIF を除去**して長辺 2000px・WebP の本体を生成
3. 長辺 400px・WebP のサムネを生成

制限値は 1 報告書 **最大 10 枚** / 1 枚 **最大 10MB**。

### 8. テストはフェイク、E2E だけ実 S3(MinIO)を通す

統合テストはメモリ上のフェイク、ローカル開発と E2E は MinIO、本番は実 S3。**`e2e/reports.spec.ts` が S3 固有の配線を通す唯一の経路**なので、storage 周りを変えたらここを流す。

### 9. presigned URL は「署名の時点で」ブラウザが到達できるホスト名を使う

**URL のホスト名を後から差し替えることはできない。** SigV4 は Host ヘッダを署名対象に含むため、発行後に書き換えると **403** になる(実測)。

発行専用の `S3_PUBLIC_ENDPOINT`(未設定なら `S3_ENDPOINT` と同じ)を持つ。

| 環境 | `S3_ENDPOINT`(サーバ → S3) | `S3_PUBLIC_ENDPOINT`(ブラウザ → S3) |
|---|---|---|
| 開発コンテナ(ホストのブラウザ) | `miniohost:9000` | `localhost:9000` |
| E2E(コンテナ内の chromium) | `miniohost:9000` | `miniohost:9000` |
| CI | `localhost:9000` | `localhost:9000` |
| 本番(実 S3) | 未設定 | 未設定 |

**副作用: E2E が dev サーバを再利用できない。** dev と E2E で `S3_PUBLIC_ENDPOINT` が違う以上、1 つのプロセスを共有できないため、E2E は専用ポート 8082 で自前起動する(`reuseExistingServer: false`)。**起動コマンドは dev と同じ tsx のまま**なので、ADR `20260804-dev-server.md` の「dev と E2E で起動経路を食い違わせない」は保っている。所要時間の代償は実測で約 +3 秒(再利用 25.8/22.1/24.1 秒 → 専用 26.9/26.4/28.8 秒)。

## 却下した選択肢

| 案 | 却下の理由 |
|---|---|
| **ブラウザから S3 へ直接 PUT**(presigned PUT) | EXIF 除去をサーバでやる要件と両立しない。加工前のオブジェクトが一時的に存在してしまう |
| **確定時に S3 のオブジェクトを移動する**(`tmp/` → `confirmed/`) | 失敗経路が増える。確定は DB の状態遷移だけで表せる |
| **`confirmedAt` カラムを持つ** | `reportId` と 2 つの真実になる。片方だけ更新される事故が起きうる |
| **パスに `tenantId` を入れる** | アップロード時点でテナントが確定しないユーザがありうる。かつパスは境界ではないので、安全性の根拠にならない |
| **非同期ジョブキューでの加工** | 加工が数百 ms で終わるのに、キューの運用コストと「処理中」状態の UI が増える |
| **CloudFront 署名 URL** | presigned GET で足りる |

## エージェント向けの注意

**この設計を「素直な形」に戻そうとしないこと。** 特に以下は意図的にそうなっている。

- **`libs/storage.ts` を経由せず `@aws-sdk/client-s3` を直接使わない。** 注入点を迂回するとテストがフェイクに差し替えられなくなる
- **S3 の呼び出しを tx の中に入れない。** `assertNotInTransaction` が実行時に落とすが、そもそも設計として外に出す
- **`reportId` の null 判定を `confirmedAt` のようなカラムに置き換えない**
- **可視外に 403 を返さない。** 403 を使うのは「見えてはいるが操作は許されない」場合だけ

### 実装時に踏んだ罠

- **`@fastify/multipart` の `toBuffer()` はサイズ超過で例外を投げる。** `part.file.truncated` を見る実装では 500 になる。`FST_REQ_FILE_TOO_LARGE` を catch して 400 に直すこと
- **`'*'`(テナント横断)は tx のコンテキストに渡すもの。** `where` に書くと SQL に流れて `invalid input syntax for type uuid` で落ちる
- **id は route 側で先に採番する**(`uuid` の `v7()`)。`storageKey` / `thumbnailKey` が NOT NULL かつ id から決まるので、Prisma に採番させると INSERT できない
- **スキーマのコメントだけを変えても `pnpm db:generate` が要る。** 生成クライアントはスキーマ本文を `inlineSchema` として丸ごと埋め込んでいるため、CI の生成物ドリフト検査に引っかかる
- RLS の都合で **`findUnique` 系は `tenantId` を `where` に入れられない。** テストから直接引くときは `findFirst` 系にする
- **E2E に渡す値は `E2E_S3_PUBLIC_ENDPOINT` という別名で受ける。** `S3_PUBLIC_ENDPOINT` をそのまま `process.env` から拾う実装にしたところ、開発コンテナの値(ホストのブラウザ向けの `localhost:9000`)を E2E のバックエンドが継承し、コンテナ内の chromium が画像を読めずに落ちた(`naturalWidth: 0`)
- **フロントで FormData を送るときだけ `bodySerializer` を上書きする。** `libs/api.ts` の既定は `JSON.stringify` 固定で、FormData を壊す

## スコープ外

画像の差し替え・並び替え(削除して入れ直す)/ 報告書の編集(作成と削除のみ)/ ウイルススキャン・画像のモデレーション。
