# Phase 3e: UI スパイク → shadcn 化 実装計画

作成: 2026-08-03

## 背景と目標

`docs/template-repo-workplan.md` の Phase 3 で唯一残った大物(3f の TypeScript 7 移行を除く)。雛形リポジトリの UI が旧プロダクト由来の **Chakra UI 2 + Ark UI + SCSS 分離**のままで、確定済み方針(workplan の技術方針表)の **Tailwind + shadcn/ui** に未移行。

移行の狙いは workplan の基本原則 6「独自抽象は最小化し、エージェントが学習済みのエコシステム標準に寄せる」。加えて 3b の積み残し(React 19 の RefObject invariant 化による Chakra 2 との型衝突 2 箇所の暫定キャスト、RHF × React Compiler 不具合への `'use no memo'` 4 ファイル)がここで解消・再評価される。

**現状の規模**: Chakra 参照 15 ファイル(最大は `UsersAdmin.tsx` の 102 箇所)、SCSS 5 ファイル 182 行、`reset.css` 212 行、Ark UI は `SelectBasic.tsx` の 1 ファイルのみ(かつ**どこからも参照されていない死にコード**)。

**確定した方針(2026-08-03、ユーザー判断)**:

| 論点 | 決定 |
|---|---|
| ヘッドレスプリミティブ | **Base UI** |
| フォームライブラリ | **E2E で検証してから決定**(TanStack Form を実測し、不可なら RHF 続投) |
| DatePicker・時刻入力 | **合格分は雛形に残す**(参照実装として恒久化) |
| PR 分割 | **3 PR**(基盤導入 + スパイク → 参照実装書き直し → 全廃・掃除) |

## 事前調査で判明した外部状況

Context7 MCP が未接続のため WebSearch で確認(2026-08-03 時点)。

- **shadcn/ui は 2026-07 に Base UI がデフォルト化**した(`npx shadcn init` の既定。Radix は `-b radix` で選択可能で、非推奨化はされていない)。Base UI は 2025-12 の 1.0.0 以降 1.6.0 まで継続リリース中で、MUI チームが専任保守。雛形は長寿命なので上流の既定に乗る
- **Tailwind v4 の Vite 8 対応は `@tailwindcss/vite` v4.2.2(2026-03-18)以降**。Vite 8 は Lightning CSS が既定の CSS プロセッサなので PostCSS 経路は不要
- **`eslint-plugin-tailwindcss` の v4 対応は beta 止まり** → `eslint-plugin-better-tailwindcss` を採用する
- **TanStack Form × React Compiler は不安要素**: `useFieldContext()` が Compiler 有効時に再レンダしない報告があり、公式リポジトリの議論でも「未検証」の回答。だから採用可否は思想ではなく実測で決める

## PR 1: 基盤導入 + スパイク判定

Chakra と**共存**させたまま Tailwind / shadcn の足場を作り、4 つのスパイク項目に決着をつける。

### 足場

- `tailwindcss` + `@tailwindcss/vite`(4.2.2 以上)を導入し、`frontend/vite.config.ts` の `plugins` に追加する(既存の `react()` + `babel({ presets: [reactCompilerPreset()] })` の構成は維持)
- **移行期は Tailwind の preflight を入れない**。Chakra 2 の CSS reset(`ChakraProvider` 既定)と `src/reset.css`(modern-normalize)が生きているため競合する。`@import "tailwindcss";` ではなく theme / utilities だけを層指定で import し、PR 3 で通常形へ戻す
- `pnpm dlx shadcn@latest init` で `components.json` を生成(Base UI 既定)
  - **注意**: shadcn の Vite 手順は tsconfig への `baseUrl` 追加を指示するが、本リポジトリは 1-16 で `baseUrl` を廃止済み(3f の前提条件)。`paths` の相対指定(`"@/*": ["./src/*"]`)で解決できるので **`baseUrl` は復活させない**。CLI が要求して通らない場合は手動セットアップにフォールバックする
- `cn()` ヘルパー(clsx + tailwind-merge)は既存の命名に合わせ `frontend/src/libs/cn.ts` に置き、`components.json` の alias をそこへ向ける
- `class-variance-authority` を導入し、Button で cva バリアントを 1 つ組んで型安全性を確認(スパイク項目 2)
- `eslint-plugin-better-tailwindcss` を `frontend/eslint.config.js` に追加

### トースト基盤の差し替え(Chakra 廃止のクリティカルパス)

`frontend/src/libs/queryClient.ts` が Chakra の `createStandaloneToast()` を **React ツリー外**から呼んでいる(QueryCache / MutationCache の `onError` はフックの外で動くため)。同じことができる置換先として **sonner**(shadcn 標準。`toast()` をモジュールから直接呼べる)を導入し、`queryClient.ts` をこの PR で sonner に一本化する。`<Toaster />` は `App.tsx` に置く。

### スパイク判定

| 項目 | やること | 合否の判定装置 |
|---|---|---|
| (4) TanStack Form | `pages/debug/DebugParamsModal.tsx` を TanStack Form + Base UI で書き直す | **既存 `e2e/formState.spec.ts` を無改変で流す**。緑なら採用、赤なら RHF + `'use no memo'` 続投(その場合 DebugParamsModal は RHF のまま shadcn 化して着地) |
| (1) DatePicker / 時刻入力 | `components/ui/DatePicker.tsx` / `TimeInput.tsx` を Base UI プリミティブ + 自前で作り、`pages/debug/Test.tsx`(`/debug/test`)に置く | 目視 + E2E スモークを 1 本追加。**合格分は雛形に残す** |
| (1) 大型テーブル | 独立検証はせず PR 2 の `UsersAdmin` 書き直しで判定する | — |
| (2) lint + cva | Button の cva 化 + better-tailwindcss を lint に組み込む | `pnpm lint` |
| (3) Radix vs Base UI | **Base UI に確定済み**。必要なプリミティブ(Dialog / Select / DropdownMenu / Drawer 相当 / Popover)が揃うかの確認に縮小 | 上記部品が組めること |

判定結果は `docs/decisions/` に ADR として記録する(4-3 の前倒し。workplan 0-3 で「ADR 置き場は 4-3 で作り直す」としているので、その 1 本目になる)。**不合格だった場合は workplan の 3e 行の分岐どおり Mantine と再比較**し、ユーザー判断を仰いでから PR 2 に進む。

**完了条件**: `pnpm verify` 緑(Chakra のままの既存ページに対して既存 spec が通ること)+ ADR。

## PR 2: 参照実装の書き直し

`components/ui/` に shadcn 由来の部品(button / input / label / table / dialog / select / dropdown-menu / sheet / alert)を入れ、ページを移植する。

**対象**: `pages/UsersAdmin.tsx`(参照実装の本丸)、`Login.tsx`、`PasswordChange.tsx`、`PasswordReset.tsx`、`Home.tsx`、`Default.tsx`、`debug/Users.tsx`、`debug/RemoteIp.tsx`

### E2E セレクタの制約(移植の最重要ガード)

`e2e/smoke.spec.ts` / `e2e/formState.spec.ts` は placeholder 文字列とアクセシブルネームで組まれており、**これを維持すれば移植は E2E で守られる**。

- 維持必須: placeholder(`施設IDを入力` / `名前・ログインID・メールで検索` / `名前` / `ログインID` / `YYYY-MM-DD hh:mm`)、ボタン名(`ログイン` / `ユーザ追加` / `作成` / `検索` / `編集` / `保存` / `無効化` / `閉じる` / `適用`)、`getByText('初期パスワード:')` / `('保存しました')` / `('設定を保存しました')`
- `getByRole('cell')` は素の `<table>` が要る → shadcn の Table は素の table 要素なので維持できる
- `getByRole('menuitem')` は Base UI の DropdownMenu が `menuitem` role を持つので維持できる
- **`e2e/smoke.spec.ts` の `.CommonHeader button` だけは class 依存**。CommonHeader 移植時にハンバーガーへ `aria-label` を与え、E2E を `getByRole('button', { name: ... })` に改める(E2E の変更はこの 1 箇所に限定し、PR 説明に明記する)

### 移植に内包して直す残骸・バグ

- `pages/Login.tsx` — ログイン成功後に**存在しない `/reservation` へ navigate** している(現状 `*` → `/` へのフォールバックで偶然動いている)。`/home` に修正する
- `pages/Login.tsx` — `App.tsx` の外側にもう 1 つ `ChakraProvider` を張っている入れ子(Chakra 廃止で自然消滅)
- `index.html` の `<title>オペプロ</title>` と `CommonHeader.tsx` の既定タイトル `'オペプロ'` を雛形向けの中立な名前にする
- `components/ui/SelectBasic.tsx` + `components/ui/Select.scss` を削除(Ark UI 唯一の使用箇所であり、かつ**どこからも import されていない**)

### 要判断(実装中にユーザーへ確認)

`App.tsx` の「**opepro は利用登録された iPad の横画面モードでのみご利用いただけます**」画面と `config.ts` の `CHECK_WINDOW_SIZE`(本番のみ有効)は旧プロダクト固有の制約。雛形からは削除を推奨するが、案件で使う可能性があるため残置も選べる。

**完了条件**: `pnpm verify` 緑 + ブラウザでの目視確認。

## PR 3: Chakra / Ark / SCSS 全廃 + 掃除

- 残る Chakra 依存を移植する: `components/ui/BasicDialog.tsx`、`components/ui/GlobalSpinner.tsx`、`pages/dialogs/ApiRetryDialog.tsx`、`pages/dialogs/ReloadAppDialog.tsx`、`pages/CommonHeader.tsx`、`App.tsx`
- **3b の暫定キャスト 2 箇所が消えることを確認する**: `BasicDialog.tsx` の `leastDestructiveRef`、`CommonHeader.tsx` の `finalFocusRef`
- SCSS 5 ファイルを削除 → `sass-embedded` を除去。`src/.eslintrc.json`(`reset.css` の ignore 設定のみ)も不要になる
- `src/reset.css` を削除し、`@import "tailwindcss";` の通常形に戻して **preflight を有効化**する(PR 1 で保留した分)
- 依存削除: `@chakra-ui/react` / `@chakra-ui/icons` / `@chakra-ui/theme-tools` / `@ark-ui/react` / `sass-embedded`。ついでに 1-16 の取りこぼしである未使用依存 `exceljs` / `uuid` / `@types/uuid` / `date-fns` / `jotai-cache` / `tsconfig-paths` も落とす(`lucide-react` は shadcn のアイコンとして継続利用)
- `frontend/package.json` の `name` が `"opepro"` のままなので修正する
- `CLAUDE.md` の「フロントエンド」節を Tailwind + shadcn + Base UI 構成に更新し、`'use no memo'` の記述をスパイク結果に合わせて書き換える。`docs/template-repo-workplan.md` の 3e 行に実施済み記録を追記する

**完了条件**: `grep -rn "@chakra-ui\|@ark-ui" frontend/src` が 0 件、`pnpm verify` 緑、目視確認。

## 検証

各 PR 共通:

```bash
pnpm verify     # check + lint + test + e2e(CI と同一)
```

- **スパイク判定は `e2e/formState.spec.ts` を無改変で流すことが条件**。この spec は「入力に応じてボタン活性が追従するか」を実 UI で見るので、React Compiler との相性問題の唯一の検出装置になる
- 手動確認(PR 2 / 3): `pnpm dev` → ログイン → ハンバーガー → ユーザ管理で CRUD 一巡 → ユーザメニュー(ログアウト / パスワード変更 / debug 各種)→ パスワードリセット画面 → `/debug/test` の DatePicker / 時刻入力
- PR 1 のみ: `pnpm build` も通し、Tailwind が Vite 8 の本番ビルドで壊れないことを確認する

## このスコープに含めないもの

- 3f(TypeScript 7 / tsgo 移行)
- terraform / deploy / etc の opepro 固有値の汎用化(1-5 の未着手分)
- `pgdump/pgdump.sh` の残存(1-5 で「全削除」と決定済みなのに残っている不一致)。**その後の決着(2026-08-04): 決定を覆して残すことにした**(`docs/template-repo-workplan.md`)
- `docs/plans/20260803-tanstack-query-plan.md` の ADR 化 or 削除の判断(4-3)
