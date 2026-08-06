# pgdump — 運用・調査用のバックアップ / リストア

**雛形のテスト基盤とは無関係。** 統合テストは worker ごとに template database を複製する仕組みを持っており(`backend/test/`)、ここは**手作業でのバックアップと復元**のためのもの。

出力(`*.sql`)は `.gitignore` 済み。

## バックアップ

```bash
# 出力先ディレクトリで実行する(カレントディレクトリにファイルを作る)
bash pgdump/pgdump.sh
```

`pg_dump` の **section 分割**で 3 ファイルを出す。連番付きなので glob 順がそのまま復元順になる。

```
full.<日時>.1-pre-data.sql     テーブル定義(FK 制約・インデックスは含まない)
full.<日時>.2-data.sql         COPY によるデータ
full.<日時>.3-post-data.sql    インデックス・FK 制約
```

- 対象 DB は既定 `myapp`。**別 clone / worktree では `DB_NAME` で上書きする**(`pnpm bootstrap` が `myapp_app2` のようにディレクトリ名から導出するため)
- 接続先は環境変数 `DB_HOST`(`docker/docker-compose.local.yml` が `pghost` を注入)

```bash
DB_NAME=myapp_app2 bash pgdump/pgdump.sh
```

## リストア

**復元先は必ず新しい DB にする。** 既存 DB へ流すと重複や競合で壊れる。

```bash
createdb -h "$DB_HOST" -U appuser myapp_restore

for f in full.<日時>.*.sql; do
  psql -h "$DB_HOST" -U appuser -d myapp_restore -v ON_ERROR_STOP=1 -f "$f"
done
```

**すべて `appuser` で通る。superuser は要らない。**

### なぜ section 分割なのか

以前は `--schema-only` + `--data-only --disable-triggers` の 2 ファイル構成だった。`--disable-triggers` は**外部キーの内部トリガー**(`RI_ConstraintTrigger`)を止めてデータ投入順の制約を外すためのもので、これは **superuser でないと実行できない**。

```
ERROR:  permission denied: "RI_ConstraintTrigger_a_xxxxx" is a system trigger
```

section 分割なら **FK 制約が `3-post-data` で最後に作られる**ため、データ投入時点で FK が存在せず、順序にも権限にも依存しない。

> `--disable-triggers` を単に外す方法でも**現在のスキーマなら通る**(`pg_dump` は COPY を依存順に並べるため)。ただし**循環参照する FK・自己参照 FK**があると順序で解決できず失敗し、しかも**復元しようとした瞬間まで気づけない**。section 分割はこの条件に依存しない。

### 確認

行数を突き合わせる。

```bash
for t in $(psql -h "$DB_HOST" -U appuser -d myapp -tAc \
  "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"); do
  a=$(psql -h "$DB_HOST" -U appuser -d myapp         -tAc "SELECT count(*) FROM \"$t\"")
  b=$(psql -h "$DB_HOST" -U appuser -d myapp_restore -tAc "SELECT count(*) FROM \"$t\"")
  printf '%-28s src=%-8s restored=%s\n' "$t" "$a" "$b"
done
```

## 注意

- **`pg_dump` のメジャーバージョンをサーバに合わせること。** ずれると `server version mismatch` で中断する。開発コンテナは `docker/Dockerfile.local` で `postgresql-client-18` を入れており、`docker-compose.local.yml` の `postgres:18` と揃えてある。**postgres のメジャーを上げるときはクライアント側も同時に上げる**
- 開発 DB を直接復元先にしない。復元は新しい DB に対して行い、確認してから切り替える
- スクリプトは失敗時に**書きかけのファイルを消して非ゼロ終了**する。同じ秒に実行された既存のバックアップを壊さないよう、同名ファイルがあるときは実行を拒否する
