# AI エージェント駆動開発向け雛形化 作業プラン

作成: 2026-07-07(壁打ちセッションの決定事項に基づく)

## 目的

opepro のプラットフォーム層(認証・マルチテナント・型生成パイプライン・Prisma 拡張)を母体に、
AI エージェント駆動開発を前提とした新規案件用の雛形リポジトリを作る。

## 基本原則

1. **機械的に強制できるものはコード(型・lint・実行時 assert・CI)に、判断が要るものだけルール(CLAUDE.md / skills)に**
2. **常にブート可能・ログイン可能を維持**しながら削る(各ステップで動作確認できる状態を保つ)
3. **削ぎ落とし先行 → マイグレーション後行**(捨てるコードに移行作業をしない)
4. **テスト基盤をマイグレーションより先に**整備(移行の検証装置にする)
5. 序盤は step by step で確認しながら進め、テスト基盤整備後のマイグレーション PR から自走を試す
6. 独自抽象は最小化し、エージェントが学習済みのエコシステム標準(TanStack / Tailwind / Prisma 素の API)に寄せる
7. **作業は必ず作業用ブランチを切って行い**、PR でレビューを経て main に取り込む(main 直コミットは docs 等の軽微な単発変更のみ)
8. **修正は commit 手前で終了してユーザーの確認をあおぐ**(verify を通した状態で差分を提示し、承認を得てから commit / push / PR)

## 確定済みの技術方針(概要)

| 領域 | 方針 |
|---|---|
| DB | PostgreSQL(移行済み)。マルチテナント RLS 拡張は雛形の標準として維持 |
| ORM | Prisma 最新メジャーへ。拡張3点(RLS / 日時 / 暗号化)の互換 PoC が本丸。driver adapter で PGlite・@db.Date 文字列パススルーを検証 |
| React | 19 + React Compiler 前提。Jotai 続投、react-router v7 続投 |
| ビルド | Vite 8(Rolldown)。plugin-react-swc は退役、Compiler の変換経路は実装時に最新確認 |
| TypeScript | **7.0(Go ネイティブ)へ移行済み(3f)**。型チェック・emit は TS7、typescript-eslint は TS6 の二段構え(公式が案内する npm 別名方式)。TS 7.1 で programmatic API が安定したら一本化する |
| スキーマ | Zod v4 + fastify-type-provider-zod v5/v6 系 |
| API クライアント | 自前 useApiCall → TanStack Query + openapi-react-query。JST 変換/バージョンヘッダーは openapi-fetch Middleware、トースト/actions/ブロッキングは QueryClient グローバル設定 |
| フォーム | **react-hook-form(推奨 API 縛り)**。3e で一度 TanStack Form へ移行したが、RHF も `useFormState` / `useWatch` / `useController` を使えば Compiler と併用できると実測で判明したため、事前知識量を優先して復帰(ADR `20260803-ui-stack.md`) |
| UI | **Tailwind v4 + shadcn/ui(プリミティブは Base UI)で確定(3e)**。SCSS 分離廃止、スタイルは tsx に直書き + コンポーネント抽出。DatePicker / 時刻入力は自前実装 |
| 日時 | ワイヤーは ISO 文字列(正準形: 常に +09:00、Z 禁止、秒精度)。convertToDate 削除。`zDateIn()` / `zDateOut()` ヘルパーに集約。TZ=Asia/Tokyo を起動時 assert |
| サーバ構造 | service/repository 層は作らない。分離軸は「純粋関数 vs IO」のみ。リクエスト全体 tx 包みは維持し、tx 内外部 I/O を runtime assert で禁止 |
| テスト | DB はモックしない。実 PG 統合テスト主軸(worker ごと DB + template database)。モック注入点は SES / SSM 等の外部サービスのみ |
| 構成 | ~~platform/app 分離はディレクトリ + lint~~ → **方針転換(2026-07-10): platform 階層は導入しない**(一度実装後にユーザー判断で撤回・統合。基盤コードは通常の libs / plugins / models に置き、編集境界はディレクトリではなく運用とレビューで扱う)。pnpm workspace はルート統合コマンド用のみ |
| 参照実装 | doctors 廃止 → users テーブル新設、テナント内ユーザ CRUD(認証汎用化と同一作業)。departmentId は削除、セッションからも外す |

---

## Phase 0: リポジトリ切り出し・足場(step by step)

| # | タスク | 備考 |
|---|---|---|
| 0-1 | 新リポジトリ作成 | **実施済み(2026-07-10)**。スナップショット方式。GitHub private リポジトリ(origin)作成・push 済み。認証は gh CLI(HTTPS)、SSH 鍵は公開サーバ立ち上げまで不要 |
| 0-2 | 最小 CI(GitHub Actions)を先に張る | **実施済み(2026-07-10)**。`.github/workflows/ci.yml` で backend / frontend 別 job の `pnpm check` + `pnpm lint`(backend は install 後に `prisma generate` が必要)。初回から緑。`/app` ハードコードは全てランタイム用のため check/lint は位置非依存で通る(1-12 の検証装置として効くのはテスト・gen:openapi を CI 化してから) |
| 0-3 | docs/ 整備 | 本プランと壁打ちの決定事項を移設。`docs/decisions/` は元プロジェクト固有の内容だったため削除(2026-07-10)。雛形の ADR 置き場としては 4-3 で新規に作り直す |
| 0-4 | 開発コンテナの HOME とリポジトリルートを分離 | **実施済み(2026-07-09)**。旧構成は HOME=/app でホーム系 dotfile がリポジトリに混入し得た(実例: `.npmrc` → untrack 済み)。HOME を `/home/appuser`(named volume で永続化)に分離し、初回起動時に `.claude` 等を旧 HOME から移行。残タスクの残置ホームファイル掃除・`.gitignore` 簡素化も完了(2026-07-10) |
| 0-5 | 開発コンテナをコンテナ内 clone 方式へ移行 | **完了(2026-07-10)**。作業コピーを `~/app`(home volume 上)に移し、bind mount 廃止・volume 1 個化・pnpm store 同居。Dockerfile 変更はホスト clone の `docker-ops` ブランチへ `git push -f host` で受け渡し。コンテナ再作成・ホスト側設定・GitHub origin・旧 volume 削除まで実施済み。ローカル動作用に既存環境から DB と `~/.ssm-keys.json` を移送済み(backend 起動・ログイン確認済み) |

**完了条件**: 新リポジトリで CI が緑。→ **達成(2026-07-10)、Phase 0 完了**

## Phase 1: 削ぎ落とし + 参照実装(step by step)

### 1a. ドメイン剥がし

**実施済み(2026-07-10)**: 1-1〜1-4 完了、1-5 は Google Sheets 連携・pgdump 系・ドメイン運用スクリプトまで削除済み(残: `exceljs` 等の依存掃除は 1-16 で、terraform 汎用化は未着手)。migrations は縮小後スキーマ(Tenant / Department / Doctor / LoginSession / EditLock / PasswordResetRequest / DebugParameter の 7 モデル)から `20260710084649_initial` として初期化。ローカル DB は認証系データ(tenants / departments / doctors / debug_parameters)のみ退避・復元して「ブート可能・ログイン可能」を維持。

| # | タスク | 備考 |
|---|---|---|
| 1-1 | routes 削除 | 温存: `login` `logout` `ping` `passwordResetRequest` `passwordChange` `master`(**決定(2026-07-10): 段階縮小で温存**。1a ではドメイン部分だけ削ってフロント依存を維持し、1b で users + tenantConfig の最小形に再構成)`debug/` の一部(`changeUser` と `debugParams` の仮想日付は温存、`matchingStatus` と `dbBackups` は削除)。削除: `reservation*` `sharedAssignment*` `dutyAssignment*` `doctorSchedules` `notifications` `changeHistories` `lastChange` `roomAssignmentOperation` |
| 1-2 | models 削除 | 温存: `tenantConfig`(**決定(2026-07-10): 構造温存・中身最小化**。JSON 設定カラム + Zod + 公開/DB スキーマ分離の構造が雛形パターン)`currentDate` `caches`(**決定(2026-07-10): 温存**。リクエスト単位メモ化 70 行、整理の要否は 1-14 / 3d で再判断)。削除: 手術・共有枠・割り付け系すべて |
| 1-3 | frontend pages 削除 | 温存: `Login` `PasswordChange` `PasswordReset` `RequireAuth` `CommonHeader` `Default`。削除: `Reservations*` `SharedAssignment*` `DutyAssignment` `Notifications` `ReservationErrors` `ReservationSearch` |
| 1-4 | Prisma スキーマのドメインモデル削除 | `DateTest` モデル、naive `@db.Timestamp(3)` も削除。マイグレーションは新規リポジトリで 0 から作り直し(`migrations/` リセット) |
| 1-5 | 案件固有の周辺物削除 | Google Sheets 連携、`exceljs`、pgdump 系(**決定(2026-07-10): 全削除** — `pgdump_core` `pgdump_fast` `dump_demo_data` `dbBackups` ルート + `debug_db_backups` テーブル。Phase 2 のテスト基盤が代替、DB 名ハードコードで現状すでに要修理、必要なら git 履歴から復活)。**訂正(2026-08-04、ユーザー判断)**: **`pgdump/pgdump.sh` はメンテナンス用に残す**ことにした。アプリ側の pgdump 機能(ルート・テーブル)を削除した判断は維持し、**手作業のバックアップ / リストア用シェルだけ残す**。動作確認の過程で、**サーバ 18 に対しクライアントが 17 で `pg_dump` が中断していた**(しかもスクリプトが失敗を無視して成功を表示していたため 0 バイトのバックアップが成功に見えた)ことが判明したため、`docker/Dockerfile.local` を `postgresql-client-18` に更新し、スクリプトを失敗時に非ゼロ終了するよう修正。あわせて **`pg_dump` の section 分割**(pre-data / data / post-data)に変更し、**superuser なしで `appuser` のまま復元できる**ようにした(FK 制約が post-data で最後に作られるため、投入順にも権限にも依存しない)。結果と手順は `pgdump/README.md`、`terraform/` 等インフラ定義の opepro 固有値の汎用化 |

### 1b. 認証汎用化 + 参照実装(users CRUD)

**実施済み(2026-07-10)**: 1-6〜1-11 完了。doctors → users(userName / role は文字列 + `src/roles.ts` の Zod enum で検証、ADMIN / MEMBER)、departmentId・Department モデル全面削除。既存データは users へ変換移行(旧 *_ADMIN → ADMIN 131 名、他 MEMBER)。speakeasy → otpauth、uuid/nanoid → `crypto.randomUUID()`。users CRUD(GET/POST/PATCH、ADMIN 限定、自身のロール変更・無効化禁止、3 層構造見本)+ 最小 Chakra 管理ページ + `script/seed.ts`。API レベルで CRUD・認可の動作確認済み

| # | タスク | 備考 |
|---|---|---|
| 1-6 | doctors → users、DoctorRole → Role(ADMIN / MEMBER) | ロール enum は `src/roles.ts` で案件拡張可能に(1-14 撤回により platform 側/app 側の区別はなし) |
| 1-7 | departmentId を全面削除(セッション含む) | 決定済み |
| 1-8 | デバイスバインドセッション・TOTP(2FA)の扱い | **決定(2026-07-10): 両方残す**。デバイスバインドセッション(deviceId クッキー + 1端末1セッション)は現行のまま温存。TOTP はユーザ 2FA ではなく「MASTER_IP_WHITELIST からの接続時に MASTER_SECRET ベースの TOTP でログインできる運用サポート用マスターログイン」であり、これを speakeasy → otpauth に置換して温存。テナント別 sourceIpRange の IP 制限も温存 |
| 1-9 | users CRUD 参照実装(バックエンド) | 一覧(ページネーション+検索)/ 作成(初期パスワード発行)/ 編集 / 無効化 / ロール変更。認可見本: ADMIN のみ、自身のロール変更不可。「route → tx を受け取るモデル関数 → 純粋関数」の3段見本にする |
| 1-10 | users CRUD 参照実装(フロントエンド) | **最小限でよい**(現行 Chakra のまま)。Phase 3e の UI 差し替えで shadcn 版に書き直すため、ここで作り込まない |
| 1-11 | 初期シード(テナント + 管理者ユーザ) | bootstrap(1-13)から呼ぶ |

### 1c. 構成の整地

**実施済み(2026-07-10)**: 1-12〜1-17 完了。1-12(repoRoot() ヘルパー・ポート/PM2 名 env 化・/app symlink 撤去)、1-13(workspace 化 + `pnpm bootstrap`: ディレクトリ名から DB/ポート/PM2 名導出 → .envrc 生成 → DB 作成 + migrate + seed。compose の DB_URL 注入は廃止 — **コンテナ再作成が必要**)、1-14・1-15(実装後にユーザー判断で撤回 — 各項目の欄を参照)、1-16(依存掃除 + TypeScript 6.0.3 統一 + baseUrl 廃止)、1-17(CLAUDE.md 全面更新)。caches は platform 化に伴いジェネリクス化(app 型への依存を除去)

| # | タスク | 備考 |
|---|---|---|
| 1-12 | 位置非依存化 | `/app` ハードコード5箇所を `repoRoot()` ヘルパー(pnpm-workspace.yaml 上方探索)経由に。ポート / PM2 名 / API URL を env 化(デフォルトは現行値) |
| 1-13 | pnpm workspace 化 + `pnpm bootstrap` | ルート package.json + workspace(実施済み)。bootstrap: ディレクトリ名から DB 名・ポート導出 → .env 生成 → DB 作成 + マイグレーション + シード。PG コンテナは共有、database をコピーごと分離。**決定(2026-07-10): compose 直付けの DB_URL をやめ、bootstrap が生成する .envrc(direnv)方式へ移行**(コンテナ再作成が必要) |
| 1-14 | ~~platform/app ディレクトリ分離~~ | **撤回(2026-07-10)**: 一度実装(ESLint 境界ルール + 編集禁止 CLAUDE.md 含む)したが、platform という概念階層を入れない方針にユーザー判断で転換し、通常の libs / plugins / models 構成に統合し直した。ロール定義は `src/roles.ts` に配置。副産物として caches のジェネリクス化(app 型への依存除去)は維持 |
| 1-15 | ~~Prisma マルチファイルスキーマ分割~~ | **撤回(2026-07-10)**: platform 概念の撤回に伴い単一 `schema.prisma` に戻した |
| 1-16 | 依存掃除 | 削除: `express` `prop-types` `@headlessui/react` `react-window`(参照は CustomLink.tsx の1箇所のみ、要置換)`ts-node` `path` `@react-types/shared` `lodash`(使用1ファイル)。統一: uuid/nanoid → `crypto.randomUUID()` + 一方のみ、TypeScript を 6.x に統一(現状 5.6/5.9 混在)し 6.0 deprecation を解消 — `baseUrl` 廃止(`paths` を相対指定に)、`types` 明示化。3f の TS7 移行の準備を兼ねる。date-fns-tz → date-fns v4 の `@date-fns/tz` |
| 1-17 | CLAUDE.md 更新 | JST の旧記述(MySQL 時代の +9h 全適用)修正、`@common` 死にエイリアス削除、新構成の反映 |

**完了条件**: 認証 + users CRUD だけで起動・ログイン・CRUD 操作が可能。CI 緑。手動での動作確認。→ **達成(2026-07-10)、Phase 1 完了**(ブラウザからのログイン・users CRUD 操作を手動確認済み。CORS の PATCH 許可漏れを修正)

## Phase 2: テスト基盤(step by step)

**実施済み(2026-07-10)**: 2-1〜2-7 完了。Vitest 4(unit / integration の 2 プロジェクト構成)、実 PG 統合テスト(worker ごと DB を template database から複製 + テストごと TRUNCATE)、シードファクトリ(test/factories.ts)、SES 注入点(libs/mailer.ts + setMailerForTesting)と tx 内外部 I/O ガード(assertNotInTransaction、SSM にも適用)、起動時 TZ assert、tx タイムアウト二段化(既定 5 秒 + opts.timeoutMs、3 秒超で警告ログ)、Playwright E2E スモーク(ログイン → users CRUD 一巡 → ログアウト)、`pnpm verify` + CI 統合(PG service コンテナ + ダミー SSM キャッシュ)。**成果: RLS 拡張が PostgreSQL 移行時から実質無効だった重大バグ(スキーマ照合のフィールド名齟齬)、count 系オペレーション未対応、複合ユニークキー内 tenantId 未認識、の 3 バグをテスト構築過程で検出・修正**。@db.Date テスト用に参照モデル DateExample を追加

| # | タスク | 備考 |
|---|---|---|
| 2-1 | Vitest 導入(Vite 8 対応版を最初から選ぶ) | 純粋関数のユニットテストから |
| 2-2 | 実 PG 統合テストハーネス | worker ごと database、PG template database で複製、テストごとロールバック(または TRUNCATE)。RLS 拡張・@db.Date 正規化・getLock を最初のテスト対象にする(雛形の目玉のリグレッション網) |
| 2-3 | シードファクトリ | テストデータ生成の見本 |
| 2-4 | 外部サービス注入点 | SES(メール)/ SSM の interface + テスト用フェイク。**tx 内外部 I/O ガード**: クライアント入口で AsyncLocalStorage の tx コンテキストを検査して throw |
| 2-5 | 起動時 assert 群 | `TZ === 'Asia/Tokyo'` assert。tx タイムアウト二段化(Web API 5秒 / バッチ明示延長)。閾値超過 tx の警告ログ。connection_limit の config 明記 |
| 2-6 | Playwright E2E スモーク(コード化) | ログイン → users CRUD 一巡。エージェントは実行して結果を読むだけの運用(MCP ブラウザ操作は目視確認専用とルール化) |
| 2-7 | `pnpm verify` 統合コマンド + CI 組み込み | check + lint + test + E2E smoke。「verify を通せ」が全指示の完了条件になる |

**完了条件**: `pnpm verify` 一発が CI で緑。RLS / 日時 / ロックの挙動がテストで固定されている。→ **達成(2026-07-10)、Phase 2 完了**

## Phase 3: マイグレーション(独立 PR、ここから自走実験)

各 PR とも完了条件は「`pnpm verify` 緑 + 動作確認」。1 PR = 1 テーマ厳守。
推奨順(依存関係順):

| # | PR | 内容・注意点 |
|---|---|---|
| 3a | Prisma 新世代 PoC → 本適用 | **実施済み(2026-07-13)**: Prisma 7.8.0 + @prisma/adapter-pg へ移行。datasource url はスキーマから `prisma.config.ts`(CLI)と adapter(実行時)へ移動、connection_limit は pg Pool の max に読み替え。generator は新世代 `prisma-client`(クライアントを `src/generated/prisma/` にプロジェクト内生成)へ切替、生成物はコミット運用(CI が再生成差分ゼロを検証、デプロイ/CI での generate 不要化)。**拡張 2 点(RLS / @db.Date 正規化)は $extends 互換でテスト全緑**。PoC 結果: (1) PGlite は community adapter(pglite-prisma-adapter)で SELECT + モデル CRUD の動作を確認したうえで採用見送り(現行の実 PG worker ハーネスが約3秒と十分速いため。依存・スクリプトとも撤去済み) (2) **@db.Date 文字列パススルーは不可** — pg 型パーサを identity にしても query compiler が Date へ再変換し、TZ ずれ(JST midnight → 前日)も v7 で健在なため、**正規化拡張は温存が確定**(検証スクリプト同上) |
| 3b | React 19 + Compiler + Vite 8 | **実施済み(2026-07-13)**: React 19.2 / Vite 8.1(Rolldown)/ @vitejs/plugin-react 6(Oxc 変換)へ移行し plugin-react-swc を退役。Compiler(babel-plugin-react-compiler 1.0.0 stable)は公式推奨の `reactCompilerPreset` + `@rolldown/plugin-babel` 経路で適用(変換本体 Oxc、Compiler パスのみ Babel ブリッジ)。eslint-plugin-react-compiler(error)導入。バンドルに useMemoCache を確認 = 変換が実際に効いている。React 19 の RefObject invariant 化で Chakra 2 と型が衝突する 2 箇所は暫定キャスト(3e で解消予定)。**RHF × Compiler の相性問題は E2E(formState.spec.ts)で実在を実証** — formState のボタン活性が追従しなくなり、RHF 最新(7.81)でも未解決のため、useForm 使用 4 コンポーネントに `'use no memo'` を適用して挙動を固定(3e のフォーム刷新で再評価) |
| 3c | Zod v4 + fastify-type-provider-zod 更新 | **実施済み(2026-07-13)**: Zod 4.4.3 + fastify-type-provider-zod 7.0.0(frontend も Zod 4 + @hookform/resolvers 5 に統一)。`zDateIn()`(z.iso.datetime({offset:true}) / z.iso.date() + transform、オフセットなし・スラッシュ区切りの受理廃止)/ `zDateOut()`(z.date())を `libs/zDate.ts` に新設し単体テストで固定。z.date() → string/date-time の JSON Schema オーバーライドは fastify-type-provider-zod v7 が組み込みで持つため自前実装不要。**customValidatorCompiler(数値クエリの前処理)は廃止**し標準 validatorCompiler + `z.coerce.number()` に置換(Zod 内部構造依存の独自抽象を削減)。customSerializerCompiler(JST replacer)は createSerializerCompiler({replacer}) のまま v7 互換。v3→v4 書き換え: z.nativeEnum(Role) → z.enum(Role)、z.string().email() → z.email()、ZodIssueCode.custom → 'custom'。生成 OpenAPI スキーマは完全同一(frontend 生成物に差分ゼロ)。エラーハンドラの err.validation 分岐・400 応答は実挙動確認済み |
| 3d | TanStack Query 移行 | **実施済み(2026-08-03、PR #6)**: 自前 `useApiCall`(349 行)を解体し `@tanstack/react-query` + `openapi-react-query` へ全ページ移行。`libs/api.ts`(openapi-fetch クライアント + Middleware)と `libs/queryClient.ts`(QueryCache / MutationCache の onError にトースト・actions・リトライ登録を集約)に責務分割。**ノーキャッシュ方針**(staleTime 0 / gcTime 0 / retry false / refetch 系 off)= TanStack Query は「取得状態管理 + 再取得トリガー」としてのみ使い、キャッシュ配信は持ち込まない(旧 useEffect 取得のパリティ)。ブロッキング判定・リトライ可否は query/mutation の `meta`(`ApiMeta`)で型付き指定。**workplan からの逸脱**: JST 正準形変換は Middleware ではなく body/query serializer で実装(onRequest は直列化後の Request しか触れず、body の Date が既に UTC Z 化されているため)。**convertToDate と `openapi-schema.json` 生成を廃止**し、日時レスポンスはワイヤー正準形の string で貫通(Date 復元の再実装は 2 方式検討して棄却、詳細は `docs/plans/20260803-tanstack-query-plan.md` §4)。リロードは `invalidateQueries` に |
| 3e | UI スパイク → shadcn 化 | **実施済み(2026-08-03、PR #11 / #12 / #13)**: 3 PR に分割。**3e-1(基盤 + スパイク判定)**: Tailwind v4 + shadcn/ui(Base UI)+ cva + eslint-plugin-better-tailwindcss を導入し、トーストを Chakra の createStandaloneToast から sonner へ移行(QueryCache の onError が React ツリー外で動くため、これが Chakra 廃止のクリティカルパス)。スパイク 4 項目は全合格 — **TanStack Form は `'use no memo'` なしで既存 E2E を無改変通過**(dev サーバーの変換結果で `_c()` を確認し、メモ化が効いた状態での合格を担保)、DatePicker / 時刻入力は Base UI Popover + 自前実装で雛形に残置、クラス名 lint は存在しない/競合クラスを error 検出、Radix vs Base UI は shadcn の既定化に追随して Base UI 確定。判断は `docs/decisions/20260803-ui-stack.md`(ADR 1 本目)。**3e-2(参照実装の書き直し)**: UsersAdmin / Login / PasswordChange / PasswordReset / Home / debug 系を移植し、RHF を依存ごと退役。**3e-3(全廃 + 掃除)**: シェル系(CommonHeader / 各ダイアログ / GlobalSpinner / App)を移植して Chakra・Ark・SCSS を 0 件化、preflight と utilities レイヤーを通常形へ復帰、3b の RefObject 暫定キャスト 2 箇所も解消。E2E は 2 本 → 6 本。**後日訂正(2026-08-03)**: フォームは react-hook-form に戻した。RHF が Compiler と併用できないという 3b の判定が誤りで、`useFormState` / `useWatch` / `useController` を使えばメモ化が効いた状態でも同 spec を無改変通過することを実測で確認したため(ADR `20260803-ui-stack.md`) |
| 3f | TypeScript 7(tsgo)移行 | **実施済み(2026-08-03)**: `typescript` を TS7 へ。TS7 は安定した programmatic API を持たない(7.1 予定)ため typescript-eslint が動かず、Microsoft 公式が案内する二段構え(`"@typescript/native": "npm:typescript@^7"` で tsc = TS7、`"typescript": "npm:@typescript/typescript6@^6"` で `import 'typescript'` = TS6)を採用。確認事項の結果: (1) backend の `tsc && tsc-alias` は **TS7 の emit でそのまま成立**(tsc-alias は退役不要) (2) frontend の `tsc -b`(project references)も TS7 で通る (3) typed lint は TS6 併用で従来どおり (4) TS7 パッケージに tsserver は含まれないため、エディタは TS6 かエディタ同梱版を使う(切替不要)。**型チェックは backend 3.6s → 0.65s、frontend 3.4s → 0.55s(いずれも約 5〜6 倍)**。Vitest / tsx は Compiler API 非依存で影響なし。`baseUrl` は TS7 で削除されたが 1-16 で廃止済みのため対応不要だった |

## Phase 4: ルール層・仕上げ

| # | タスク | 備考 |
|---|---|---|
| 4-1 | custom ESLint rules | **実施済み(2026-08-04)**: backend に 2 つの強制を追加。(1) `local/no-unused-tx-param`(自作ルール、`backend/eslint-rules/`)= **使っていない `tx` 引数を error**。「純粋関数は tx を受け取らない」という層構造の強制で、`@typescript-eslint/no-unused-vars` が既定の `args: 'after-used'` により先頭の未使用引数を見逃す穴を埋める。(2) `no-restricted-syntax` = **チェックアウト位置に依存する絶対パスリテラルを禁止**(`/app/` `/home/` 等。`/api/...` の URL パスは対象外)。1-12 の位置非依存化を維持するガードで、現状違反 0 件。**getLock の「最外 tx 先頭」ルールは取り下げ**(ユーザー判断でルール化せず、CLAUDE.md の getLock 言及も一般的な表現へ書き換え。機能とテストは温存)。ついでに `no-restricted-globals` のメッセージが存在しない `@/utils/globalsCompat` を案内していた陳腐化も修正。計画は `docs/plans/20260804-eslint-rules-plan.md` |
| 4-2 | CLAUDE.md 全面再構成 | **実施済み(2026-08-04)**: CLAUDE.md を「全体地図 + 判断基準」に絞り、**手順を `.claude/skills/` の 4 スキルへ移した**(`db-schema-change` / `add-api-endpoint` / `verify` / `record-docs`)。238 行 → 204 行(移した手順は 4 スキル計 238 行に再編)。**内容を削ったのではなく手順を移設**した結果で、冒頭に「最初に見るところ」の索引表(やりたいこと → スキル / ADR)を追加している。振り分けの基準は「**常に効いている制約 = CLAUDE.md、特定作業の道順 = スキル**」。受け入れテストの結果(エージェントが詰まったのは手順ではなく**制約の不記載**)を根拠にしており、あわせて空白だった判断基準 2 点(ロール別の行レベル可視範囲はモデルの where ビルダーに寄せる / 操作者の属性が要るときは `models/users.ts` に取得関数を足す)を明文化した。判断は ADR `docs/decisions/20260804-agent-docs-structure.md`、計画は `docs/plans/20260804-claude-md-restructure.md` |
| 4-3 | ADR 整理 | **実施済み(2026-08-04)**: `docs/decisions/` に 5 本(UI スタック / テスト戦略 / 日時設計 / 層構造 / API クライアント)。UI スタックは 3e で先行作成済み。各 ADR の末尾に「**エージェント向けの注意**」を置き、逆行提案(DB のモック化・Date 自動変換の復活・service 層の新設・キャッシュの有効化)を名指しで予防する。索引は `docs/decisions/README.md`。あわせて個別フェーズの実装計画 3 本を `docs/plans/` へ集約し、ADR(決定と根拠)と計画書(実施手順の記録)を分離。**ファイル名は両ディレクトリとも `YYYYMMDD-<slug>.md`**(decisions の日付は決定日。改定してもリネームせず本文の改定履歴に追記する) |
| 4-4 | knip 導入 + 最終掃除 | **実施済み(2026-08-04)**: **目的を「最終掃除」から「掃除の道具を用意する」に再定義**(ユーザー判断)。雛形では「一度きりの掃除」と「CI ゲート化」が逆方向を向く — 出荷する足場は定義上すべて未使用に見え、下流では「未使用」の大半が「まだ使っていない」を意味するため、**CI ゲート化は見送り** `pnpm knip` の手動コマンドに留めた。設定の要点は autoload されるルートとテスト/スクリプトを entry に含めること(これがないと注入点が偽陽性で出る)。**検出 93 件 → 17 件**: 偽陽性を設定で解消したうえで、ユーザー判断により 17 件を削除(ファイル 2 / 依存 4 / devDep 11)。残る 17 件は雛形の拡張点で「残す」と判断済み。判断の全記録は `docs/plans/20260804-knip-baseline.md`。副産物として `@fastify/helmet` の削除に伴い ADR `20260804-security-headers.md` を作成 |
| 4-5 | 雛形 README | **実施済み(2026-08-04)**: ルートに `README.md` を新設。スタック / 前提(dev コンテナ・`~/.ssm-keys.json`)/ 立ち上げ(`pnpm install` → `pnpm bootstrap` → `pnpm dev`。ディレクトリ名から DB 名とポートを導出する仕組みの表つき)/ 検証コマンド / **参照実装(users CRUD)の場所** / **カスタマイズポイント一覧** / **機械的に強制されている規約** / ドキュメント地図。カスタマイズ項目には SSM キーの名前空間が `/opepro-keys/` のまま残っていること、terraform に元プロダクト固有値が残っていることも明記。検証中に CLAUDE.md の seed コマンドが古い(`npx tsx script/seed.ts` では tsconfig paths が解決されない)ことが判明したため、`pnpm script script/seed.ts` に修正して実行確認した |

**完了条件**: 新規セッションのエージェントに「◯◯というリソースの CRUD を追加して」と依頼し、参照実装の模倣だけで verify 緑まで自走できること(= 雛形の受け入れテスト)。→ **達成(2026-08-04)、Phase 4 完了**(2 回実施し、2 回とも合格。下記)

### 受け入れテスト 2 回目(2026-08-04、4-2 の後)

**題材**: 「作業メモ(work note)」CRUD(件名 / 本文 / 対象日 / 重要フラグ)。**自分のメモは全員が読み書き、他人のメモは ADMIN だけが閲覧・削除**という**行レベルの可視範囲**を意図的に含めた(1 回目で空白と分かった論点を突くため)。

**結果は合格。しかも実装の失敗が 1 度も無かった** — backend / frontend / E2E とも初回で緑、`pnpm verify` 緑(79 tests / E2E 7 本)、`pnpm knip` はベースラインと完全一致で新規項目ゼロ。追加コードは検証後に破棄した。

**1 回目の穴が塞がっていることを確認できた点**:

| 1 回目に詰まった / 空白だった箇所 | 2 回目の挙動 |
|---|---|
| パスパラメータ不可 / DELETE の前例なし | `add-api-endpoint` スキルの記載どおり querystring で実装。迷いなし |
| `@db.Date` は 1 モデル 1 本 | `db-schema-change` スキルに従って素直に決定 |
| `getByLabel` の二重マッチ | `verify` スキルを読んで最初から `getByRole` で統一。一度も遭遇せず |
| 操作者の属性を取る関数が無い | CLAUDE.md の「`models/users.ts` に取得関数を足す」に従い `requireUser` を新設。**4-2 の追記がそのまま効いた** |

**新たに見つかった穴**(本記録と同じ PR で対処):

| 発見 | 対処 |
|---|---|
| querystring の boolean に `z.coerce.boolean()` は使えない(`'false'` → `true`) | `add-api-endpoint` スキルに明記。`z.enum(['true','false']).transform()` を案内 |
| 行レベル可視範囲での 403 / 404 の使い分けに前例が無い | CLAUDE.md に「**可視外は 404**(403 は id の存在を漏らす)」を追記 |
| 最も役立った「過去に踏んだ罠」の情報(この実施記録)へ索引から辿れない | CLAUDE.md の「最初に見るところ」に行を追加 |
| checkbox / textarea が未生成で、`shadcn add` はネットワークが要る | 「素の HTML で足りるものは無理に shadcn 化しない」を UI 節に追記 |
| E2E シードを冪等に保つ要請が明文化されていない | `verify` スキルに追記 |

**環境側の注意(雛形の問題ではない)**: サブエージェントに注入された `CLAUDE.md` は**再構成前の 1 世代古い版**だった(実ファイルは 204 行、注入版は 238 行)。そのため `.claude/skills/` の存在に気づけず、`ls .claude/` で偶然発見するまで正規ルートに乗れていない。**つまり本番より不利な条件で合格している。** 対策として「スキル本体は `.claude/skills/<名前>/SKILL.md` を直接読めばよい」を CLAUDE.md と README の両方に**フルパスで重複**させた(入口を増やす安い保険)。

### 受け入れテスト 1 回目の実施記録(2026-08-04、4-2 の前に先行実施)

新規セッションのエージェントに **「お知らせ(announcement)リソースの CRUD を追加して」**(タイトル / 本文 / 掲載日 / 公開フラグ、参照は全ユーザ・更新系は ADMIN のみ、管理画面 1 枚、テストつき)を依頼し、質問を禁止して自走させた。**結果は合格** — マイグレーション・モデル・ルート 4 本・統合テスト 4 本・E2E・管理画面まで到達し、`pnpm verify` 緑、`pnpm knip` もベースラインから増加なし。追加コードは検証後に破棄した(4-2 の材料を取るための試験であり、雛形に不要なリソースを残さないため)。

**効いたもの**: users CRUD の参照実装、`test/_helpers.ts` のセッションヘルパー、テスト配置 1:1 の規約(迷いがゼロ)、スキーマ変更手順、RHF の 3 制約の明記。

**穴として見つかったもの**(本 PR で対処):

| 発見 | 対処 |
|---|---|
| **dev サーバのビルド監視が死んでも PM2 が `online` を表示し続ける** | 症状が「新しい API が E2E で 404」として遅れて現れ、約 20 分の誤った調査を誘発した(実際 `tsc --watch` が OOM で SIGKILL されていた)。まず `docs/known-issues.md` に記録し、**後続で dev の起動方式ごと作り替えて解消**(`tsx watch` + `tsc --watch --noEmit`。ADR `docs/decisions/20260804-dev-server.md`) |
| **パスパラメータが使えないことが未記載** | URL がファイル名で決まる制約を CLAUDE.md / README に明記。**DELETE の参照実装が無い**ことも明記(あるべきだが今回は追加せず) |
| ドキュメントと実装のずれ 2 件 | tx タイムアウトは 10 秒でなく既定 5 秒 / OpenAPI の `.json` は生成されない — いずれも CLAUDE.md を修正 |
| 参照実装のコメントが stale | `UsersAdmin.tsx` と `e2e/formState.spec.ts` に TanStack Form 時代の記述が残存。修正 |
| Base UI の hidden input で E2E ロケータが二重マッチ | `getByLabel` ではなく `getByRole` を使う旨を CLAUDE.md に追記 |
| knip が常に exit 1 | 成否ではなくベースラインとの差分を読む旨を CLAUDE.md に追記 |

**エージェントが根拠を見つけられず自分で決めた点**(雛形の空白): ロールによる行レベルの可視範囲の出し分けをモデルの where に書くか route で分岐するか / 操作者の User を取る関数が無い(`requireAdmin` はあるが `requireUser` が無い)。4-2 で扱うか、必要になった時点で参照実装に足すかは未決。

---

## 積み残しタスク

- ~~Role の Prisma enum 化~~ → **実施済み(2026-07-13、PR #2)**
- ~~SSM パラメータ名前空間の汎用化~~ → **実施済み(2026-08-04)**: `/opepro-keys/` 決め打ちを環境変数 **`SSM_KEY_PREFIX`**(既定 `/myapp-keys`、末尾 `/` は任意)に置き換え。キー名のリテラルは `SSM_KEY_NAMES` 1 箇所に集約し、プレフィックスとの結合は `ssmKey()` に通す。**未設定時のエラーには解決後のフルパスを出す**ので取り違えが起動時に分かる(実測: `ServerError: /wrong-prefix/COOKIE_SECRET is not set`)。CI のダミーキャッシュと README、terraform の ECS secrets(`parameter/${var.project_name}-keys/`)も追随。計画は `docs/plans/20260804-ssm-namespace.md`
- ~~terraform / deploy / etc に残る opepro 固有値の汎用化~~ → **実施済み(2026-08-04)**: `opepro` を `myapp` に全置換(57 ファイル / 96 箇所)し、**`terraform/` を `terraform.example/` にリネーム**した。`.example` は「そのまま apply するものではなく構成の参考例」「CI もデプロイも参照していない」ことを名前で示すため。差し替える値の一覧は `terraform.example/README.md` に新設。`docs/plans/` と本ファイルの**経緯の記述は履歴として保持**する(名前を書き換えると記録として成立しないため)。ついでに `tools/command_proxy.sh` の compose サービス名が誤っていた(`opepro-dev-local` → 正しくは `dev-local`)のを修正。計画は `docs/plans/20260804-terraform-example.md`。**組織のドメインもプレースホルダ化した**(ユーザー判断で当初のスコープから拡大) — `soramed.jp` → `myappdomain.com`、逆引き表記 `jp.soramed` → `com.myappdomain`、単独の `soramed`(AWS プロファイル等)→ `myappdomain`(40 ファイル / 82 箇所)。**プレースホルダは実在しないドメインなので、そのままでは Route53 / ACM / SES / CloudFront のいずれも成立しない**ことを `terraform.example/README.md` に明記した
- ~~`pgdump/pgdump.sh` の残存~~ → **決着(2026-08-04)**: 1-5 の「全削除」を覆し、**メンテナンス用に残す**ことにした(ユーザー判断)。動作確認したところ完全に壊れていたため修理済み — クライアント 17 / サーバ 18 のバージョン不一致で `pg_dump` が中断し、しかもスクリプトが失敗を無視して 「Backup saved」と表示していた(0 バイトのバックアップが成功に見える)。`postgresql-client-18` へ更新し、**section 分割**(pre-data / data / post-data)にして **superuser なしで復元できる**ようにした。手順は `pgdump/README.md`
- **派生プロジェクト 1 号機を手で起こす** → **未着手**。計画は `docs/plans/20260806-derive-first-project.md`。スキル化は先送りし、まず 1 件を手で通しきる(**`myapp` は雛形として残り、作業中に見つけた不備は還元する**)。前身の「初期 commit 対象を生成するスキル」は **中止(2026-08-06)**。`docs/plans/20260805-derive-project-skill.md` の計画には着手しない。**同ファイルの「確定した方針」と「スキルの手順(7 段)」は破棄された前提なので使わないこと。** 調査結果(固有名詞の分布、本体は「削除」ではなく**参照の始末**であること)は方針に依存せず有効なので、起こし方を再検討するときはそこから読む

## 要判断(該当フェーズ着手時にユーザーに確認)

1. ~~リポジトリ切り出し方式~~ → **決定: スナップショット**(2026-07-10 実施済み)
2. ~~デバイスバインドセッション・TOTP を platform 機能として残すか~~ → **決定(2026-07-10): 両方残す(TOTP は otpauth 置換)**(詳細は 1-8) 
3. ~~pgdump / DB バックアップ機能を雛形に残すか~~ → **決定(2026-07-10): 全削除**(詳細は 1-5)
4. ~~`master.GET` / `caches` / `tenantConfig` の温存範囲~~ → **決定(2026-07-10): master は段階縮小で温存、tenantConfig は構造温存・中身最小化、caches は温存**(詳細は 1-1 / 1-2)

## 実装時に最新確認(Context7)

- React Compiler の Oxc ネイティブ対応状況(3b)
- shadcn/ui のプリミティブ対応状況(Radix / Base UI)とメンテ状況(3e)
- fastify-type-provider-zod の Zod v4 対応版の API(3c)
- Prisma driver adapter の型パーサカスタマイズ可否(3a)
- typescript-eslint の TS7(tsgo)対応状況と、tsc-alias の tsgo emit 互換(3f)。TS 7.1 で Compiler API 安定予定のため、着手時点の 7.1 リリース状況次第で 6 系併用の要否が変わる
