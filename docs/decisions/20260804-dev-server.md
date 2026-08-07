# ADR: dev サーバは `tsx watch` で直接実行し、型検査を別プロセスで並走させる

- 状態: **採用**(2026-08-04)
- 対象: `backend/script/dev-watch.sh`
- 関連: `playwright.config.ts`(E2E のバックエンド起動)、`docs/agent-traps.md`(この問題を発見した受け入れテストの記録)

## 背景

従来の dev サーバは、**ソースを `build/` にコンパイルしてから実行する**方式だった。

```
tsc --watch --outDir build   &   # 差分ビルド
tsc-alias --watch --outDir build &   # @/ の path 書き換え
node --watch-path build/src build/src/index.js | pino-pretty
```

これは **src がホスト(macOS)の fs から bind mount されていた頃**の高速化策で、`build/` だけを docker volume に逃がして I/O を稼ぐのが狙いだった。その後、作業コピー全体が `home_appuser` volume 上の `~/app` に移り(`docs/dev-container.md` のコンテナ内 clone 方式)、**`build/` 専用のマウントは既に存在しない**。前提が失われていた。

加えて、この構成には 2 つの実害があった。

1. **黙って壊れる**: 3 つのプロセスをバックグラウンドに投げっぱなしで監視していないため、`tsc --watch` が死んでも(2026-08-04 に OOM で SIGKILL された実績あり)スクリプトは生き続け、**PM2 は `online`・restart 0 を表示し続ける**。以後 `build/` は更新されず、ソースを直しても一切反映されない
2. **E2E と起動方式が違う**: Playwright は `reuseExistingServer: true` でポート 8080 の dev サーバを掴む。dev だけが `build/` 経由だったため、上記の故障が「**新しく足した API が E2E で 404**」という原因から遠い症状として現れた。Phase 4 の受け入れテストで、エージェントがこれに約 20 分を溶かしている

## 決定

**dev サーバは `tsx watch` でソースを直接実行する。型検査は `tsc --watch --noEmit` を別プロセスで並走させる。dev では `build/` を作らない。**

```bash
pnpm exec tsc --watch --noEmit --preserveWatchOutput &
pnpm exec tsx watch --clear-screen=false --include './src/**/*.ts' \
  -r tsconfig-paths/register src/index.ts > >(pnpm exec pino-pretty ...) &
wait -n   # どちらかが落ちたらスクリプトごと非ゼロ終了 → PM2 の autorestart が拾う
```

`tsc-alias` は dev の経路から外れる(**`pnpm build` の本番ビルドでは引き続き必要**)。

### 根拠 1: 差分ビルドが稼いでいた時間は 0.1〜0.3 秒しかなかった

実測(1 ファイルのみ修正 → `/api/ping` のレスポンスが新しい値になるまでをポーリング)。

| | 旧(`build/` 経由) | 新(`tsx watch`) |
|---|---|---|
| 初回起動 | 7.8s(median, n=3) | **5.0s**(median, n=4) |
| 1 ファイル変更 → 反映 | 3.50s(median, n=9) | **3.03s**(median, n=3。最終形での再測定) |

反映時間の**支配項はアプリ自身の boot 3.2 秒**(SSM 読み込み・Prisma 接続・OpenAPI 型生成)で、これは `node` で `build/src/index.js` を直接実行しても変わらない。ビルド方式が寄与するのは旧構成で +0.3s、新構成で +0.4s 程度。参考値として `tsc` のフルビルドは 1.68s、`tsc-alias` は 0.42s。

つまり**トリックの効果は誤差の範囲**であり、3 プロセスを自前で束ねる複雑さと「黙って壊れる」欠陥に見合わない。

### 根拠 2: E2E と起動方式が一本化される

Playwright は元々 `tsx -r tsconfig-paths/register src/index.ts` でバックエンドを起動している。dev を同じ方式にすることで、**dev と E2E で「動いているもの」が食い違う余地が消える**。

### 根拠 3: 故障が見えるようになる

`wait -n` でどちらかの子の終了を検知し、スクリプトごと非ゼロ終了する。PM2 の autorestart(既定で有効)が再起動し、**restart 回数として異常が見える**。実測で、型検査プロセスを SIGKILL すると 12 秒以内に検知 → ログ出力 → 再起動 → 復帰することを確認済み。

```
dev-watch: 型検査プロセス (tsc --watch --noEmit) が終了しました (exit=137)。dev を停止します。
```

## 却下した選択肢

- **現行構成を維持し、`wait -n` の監視だけ足す**: 「黙って壊れる」は直るが、dev と E2E の二重構成と、意味を失った `build/` 経由の複雑さが残る。初回起動 2.8 秒の不利も残る
- **`tsx watch` 単独(型検査を捨てる)**: プロセスは 1 本まで減るが、**dev ログから型エラーが消える**。`pnpm check` を回すまで気づけなくなるのは、エージェント駆動開発では明確な後退
- **`--include` を付けない `tsx watch`**: **採用不可**。下記のとおり新規ファイルを検知できず、元の 404 症状がそのまま残る

## エージェント向けの注意

- **`--include './src/**/*.ts'` を外さないこと。** `tsx watch` は既定で**依存グラフ上のファイルしか監視しない**。ルートは `@fastify/autoload` が起動時にディレクトリを走査して読むため、**新規ルートファイルはどこからも import されておらず、依存グラフに現れない**。`--include` なしだと「ファイルを足したのに 404 のまま」になる(実測で 30 秒待っても反映されず、`--include` 追加後は 3.3 秒で反映)。旧構成の `node --watch-path build/src` はディレクトリ監視だったため、ここだけは機能していた
- **dev で `build/` を作らないこと。** 古い `build/` が残っていても誰も読まないが、「dev サーバが古い成果物を見ている」という誤った仮説の元になる。`build/` は `pnpm build`(本番ビルド)専用
- **`tsc-alias` を依存から消さないこと。** dev の経路からは外れたが、`pnpm build` が使っている
- **型検査が dev ログに出るのは `tsc --watch --noEmit` のおかげ**で、`tsx` 自体は型を見ない(esbuild でトランスパイルするだけ)。型エラーがあってもサーバは動き続ける。これは意図した挙動
- 反映が遅いと感じたときに疑うべきはビルド方式ではなく**アプリの boot(3.2 秒)**。SSM 読み込み・Prisma 接続・OpenAPI 型生成がここに含まれる
