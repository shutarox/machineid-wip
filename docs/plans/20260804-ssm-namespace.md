# SSM パラメータ名前空間の汎用化

作成: 2026-08-04

## 目的

シークレットの SSM パラメータ名が **`/opepro-keys/` 決め打ち**で、元プロダクト名が雛形に残っている。**環境変数 1 本で差し替えられる knob** にし、雛形の既定値を中立な `/myapp-keys` にする。

## 現状

| 場所 | 内容 |
|---|---|
| `backend/src/config.ts` | 6 キーの配列に `/opepro-keys/` を直書き。取り出し側でも 6 回リテラル参照 |
| `.github/workflows/ci.yml` | CI 用ダミーキャッシュ `~/.ssm-keys.json` のキーが `/opepro-keys/*` |
| `README.md` | 前提とカスタマイズポイントに `/opepro-keys/` |
| `terraform/environments/dev/main-app/37_ecs.tf` | ECS タスク定義の `secrets` が `parameter/opepro-keys/DB_URL` / `DB_PASSWORD` |

ローカルは `docker/docker-compose.local.yml` の `IS_LOCAL_DEVELOPMENT=true` により **常に `~/.ssm-keys.json` を読み、AWS へは行かない**(ファイルが無いときだけ SSM を引く)。CI も同じ経路でダミーを読む。

## 方針

**`SSM_KEY_PREFIX` 環境変数**で名前空間を差し替える。既定値は **`/myapp-keys`**。

```ts
const rawPrefix = process.env.SSM_KEY_PREFIX ?? '/myapp-keys';
const SSM_KEY_PREFIX = `${rawPrefix.replace(/\/+$/, '')}/`;   // 末尾の / は任意
const SSM_KEY_NAMES = ['COOKIE_SECRET', ...] as const;
const ssmKey = (name) => `${SSM_KEY_PREFIX}${name}`;
```

キー名のリテラルを 1 箇所(`SSM_KEY_NAMES`)に集約し、プレフィックスとの結合は `ssmKey()` に通す。**未設定時のエラーメッセージには解決後のフルパスを出す**(`/myapp-keys/COOKIE_SECRET is not set`)ので、プレフィックスの取り違えは起動時に分かる。

terraform 側は既に `variable "project_name"` があるので、**`parameter/${var.project_name}-keys/`** に置き換える。

### ローカルの `~/.ssm-keys.json` について

このコンテナのキャッシュは `/opepro-keys/*` で保存されている。**既定値を変えると読めなくなる**ので、キー名を `/myapp-keys/*` にリネームする(値は変えない)。バックアップを取ってから行う。

ローカルは AWS を引かないので実害はないが、**「キャッシュを消すと、そのプレフィックスの SSM パラメータを実際に引きに行く」**点は README に明記する。

## 作業

1. `backend/src/config.ts` — `SSM_KEY_PREFIX` 導入、リテラル直書きを排除
2. `.github/workflows/ci.yml` — ダミーキャッシュのキーを `/myapp-keys/*` に
3. `README.md` — 前提のサンプル JSON、カスタマイズポイントの記述を更新
4. `terraform/environments/dev/main-app/37_ecs.tf` — `${var.project_name}-keys` に
5. コンテナの `~/.ssm-keys.json` のキーをリネーム(バックアップ付き)

## スコープ外

terraform の**それ以外**の opepro 固有値(S3 バケット名 `jp.soramed.opepro.*`、AWS プロファイル、ECR リポジトリ名、Route53 のサブドメイン)。量が多く、AWS アカウント側の実体と対応するため別作業とする。`variable "project_name"` の既定値 `"opepro"` も、この PR では**変えない**(変えると上記すべてに波及するため)。

## 検証

- `pnpm verify` 緑(config.ts はアプリ起動時に必ず通るので、統合テストと E2E が実質の検証になる)
- 誤ったプレフィックスを与えたときに**起動時に落ちる**ことを確認する
