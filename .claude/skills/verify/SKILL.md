---
name: verify
description: 変更の検証手順。pnpm verify(型チェック・lint・テスト・E2E)の実行と、落ちたときの切り分け、pnpm knip のベースライン差分の読み方に使う。
---

# 検証

**「`pnpm verify` を通せ」が全作業の完了条件。** CI と同一の内容が走る。

```bash
pnpm verify          # ルートで実行 = check + lint + test + e2e
```

## 内訳と、落ちたときの切り分け

上から順に落ちるので、**最初に落ちた層から直す**。

| 段 | コマンド | 落ちたときに見るところ |
|---|---|---|
| 1 | `pnpm check` | 型チェック(TypeScript 7)。`tsc` は TS7、TS6 で見たいときは `tsc6` |
| 2 | `pnpm lint` | ESLint。**custom ルール**(未使用 `tx` 引数の禁止・絶対パスリテラルの禁止)で落ちることがある。CLAUDE.md の「lint で強制していること」を参照 |
| 3 | `pnpm test` | ユニット + 実 PG 統合テスト。**ルートテストの配置ずれ**は `framework/testPlacement.test.ts` が検出する |
| 4 | `pnpm e2e` | Playwright。**フォームを変更したら必ず流す**(react-hook-form の購読 API の誤用を検出できる唯一の装置が `e2e/formState.spec.ts`) |

個別に流すときは同名のコマンドを単体で実行する。カバレッジは `backend/` で `pnpm test:coverage`。

### E2E がおかしいとき

- E2E のバックエンドは **`reuseExistingServer: true`** でポート 8080 の既存サーバを再利用する。dev(`pnpm dev`)も E2E も `tsx` でソースを直接実行するので、通常は食い違わない
- それでも挙動が古いと感じたら `pnpm stop && pnpm dev` で入れ直す。PM2 の restart 回数が増えていれば dev 側で何かが落ちている
- Base UI 由来のフォーム部品(Checkbox など)は表示用要素と hidden input を両方描画するため、`getByLabel()` は 2 要素にマッチする。**ロケータは `getByRole` で取る**
- **E2E シード(`backend/script/e2e_seed.ts`)は冪等に保つ。** テストが作ったデータは次回実行の先頭で掃除する(既存の `e2e-created-*` ユーザの掃除がその実例)。掃除しないと実行のたびにデータが増え、件数のアサートが不安定になる

## まとまった削除・リファクタのあと

```bash
pnpm knip            # 未使用ファイル・依存・export の検出(CI では実行されない)
```

- **報告がゼロになることはない。** 雛形は参照実装や拡張点を意図的に持つため、常に十数件が残る
- **残件があると exit code 1 で終わる。** 成否ではなく**内容**を読む
- 読み方は「`docs/plans/20260804-knip-baseline.md` のベースライン一覧との差分だけを見る」。**新しく出た項目**だけが意味を持つ
- 新規項目は「削除する」か「残す(理由を決めて `knip.json` の ignore かベースライン文書へ記録)」のどちらかに必ず決着させる。判断を保留したまま報告を増やさない

## 完了したら

- 差分を提示して**ユーザーの承認を得てから** commit / push / PR(修正は commit 手前で止める)
- まとまった作業はブランチを切って PR。main への直コミットは docs 等の軽微な単発変更のみ
- コミットメッセージは**日本語 1 行のみ**(本文やトレーラーを付けない)

### CI の完了を待つとき

**`sleep` を挟んだポーリングループを書かない。** 間隔ぶんのラグがそのまま待ち時間に乗る(実測で CI 本体 2 分 35 秒に対し、25 秒間隔のポーリングで体感 3 分)。`gh run watch` は完了した瞬間に返る。

```bash
RUN=$(gh run list --workflow=ci.yml --branch "$(git branch --show-current)" \
  --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN" --exit-status
```

**auto-merge は使えない。** Free プラン + private のためブランチ保護 API が 403 で、必須チェックを設定できない(`allow_auto_merge` も false)。`gh pr merge --auto` は「CI を待たず即マージ」になるので使わないこと。
