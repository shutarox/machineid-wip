#!/bin/bash

# DB のバックアップ。運用・調査用。復元手順と注意点は pgdump/README.md を参照。
#
# pg_dump の section 分割で出す。FK 制約とインデックスは post-data に入るため、
# data を投入する時点ではまだ FK が存在せず、投入順に依存しない。
# その結果 --disable-triggers(superuser 必須)なしで appuser のまま復元できる。
# ファイル名に連番を振ってあるので、glob 順に流せば正しい順序になる。
set -euo pipefail

# 日付と時刻を取得して変数に格納
DATE=$(date +"%Y%m%d_%H%M%S")
FILE_BASE_NAME="full.${DATE}"
# bootstrap は clone ごとに DB 名を変える(machineid / machineid_app2 ...)ので上書きできるようにする
DB_NAME="${DB_NAME:-machineid}"

SECTIONS=(pre-data data post-data)

# 同名(= 同じ秒)のバックアップがあるときは上書きしない。
# 失敗時のクリーンアップが既存のバックアップを消してしまうため
if compgen -G "${FILE_BASE_NAME}.*.sql" > /dev/null; then
  echo "同名のバックアップが既に存在します: ${FILE_BASE_NAME}.*.sql" >&2
  exit 1
fi

# 途中で失敗したら書きかけのファイルを残さない
# (0 バイトのファイルが成功したバックアップに見えるのを防ぐ)
trap 'rc=$?; if [ $rc -ne 0 ]; then rm -f "${FILE_BASE_NAME}."*.sql; echo "Backup failed (exit ${rc})" >&2; fi' EXIT

i=1
for section in "${SECTIONS[@]}"; do
  pg_dump -h "$DB_HOST" --section="$section" --no-privileges \
    "$DB_NAME" > "${FILE_BASE_NAME}.${i}-${section}.sql"
  i=$((i + 1))
done

echo "Backup saved to ${FILE_BASE_NAME}.{1-pre-data,2-data,3-post-data}.sql"
