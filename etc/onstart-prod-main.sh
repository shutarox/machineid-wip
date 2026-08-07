#!/bin/bash

# service docker start

# ECSエージェントの起動を待つ

for i in {1..60}; do
    if cat /proc/1/environ | tr '\0' '\n' | grep -q AWS_CONTAINER_CREDENTIALS_RELATIVE_URI; then
        cat /proc/1/environ | tr '\0' '\n' | \
            grep AWS_CONTAINER_CREDENTIALS_RELATIVE_URI >> /tmp/environment
        break
    fi
    sleep 1
done

# Dockerfile 等で設定された環境変数を子プロセス等に引き継ぐ
# APPX_*** -> export ****
#
# **ここに載らない環境変数は `su - appuser`(ログインシェル)で捨てられる。**
# タスク定義に素の名前で足した変数が「なぜか効かない」ときは、まずこれを疑う
env | grep -E '^APPX_' | sed 's/^APPX_/export /' >> /tmp/environment;
cat /tmp/environment > /etc/environment

# DB_URL を組み立てる。
#
# **SSM には接続文字列を持たない。** 秘密なのはパスワードだけで、他は静的だから。
# 2 本(DB_PASSWORD と DB_URL)持つと、ローテーションのたびに両方を更新することになり、
# 片方だけ直して壊す事故が起きる。
#
# ホストは Route53 のプライベートゾーンの CNAME なので、**DB インスタンスを
# 差し替えても変わらない**(terraform が CNAME を新しいエンドポイントへ向け直す)。
# だからこの組み立て結果も変わらない。
#
# パスワードは URL に埋めるので、**URL セーフな文字だけで生成すること**
# (script/db_bootstrap.ts と手順書の生成器は [A-Za-z0-9-_.~] に限定している)。
# /etc/environment は KEY=VALUE として読まれるためクォート不要 — `?` や `&` も
# そのまま値の一部になる(既存の APPX_DB_URL がこの形で動いていた)。
if [ -z "${DB_URL:-}" ] && [ -n "${DB_PASSWORD:-}" ]; then
    echo "export DB_URL=postgresql://${APPX_DB_USER}:${DB_PASSWORD}@${APPX_DB_HOST}:5432/${APPX_DB_NAME}?${APPX_DB_PARAMS}" >> /etc/environment
fi

# psql 用のパスワードファイル。
#
# 踏み台サーバを置かない構成では、DB を覗く手段が
# 「ECS Exec で入って `su - appuser` して psql」しかない(deploy/exec.sh)。
# そのたびに SSM からパスワードを取るのは煩雑なので、ここで用意しておく。
#
# **露出は増えない** — ECS Exec で入れる者は、そもそも DB_PASSWORD を
# 環境変数として読める(タスク定義の secrets で注入されている)。
#
# DB_PASSWORD に APPX_ を付けていないのは意図的で、**appuser の環境変数には置かず**
# このファイル経由でだけ使わせるため。アプリは DB_URL しか見ない。
if [ -n "${DB_PASSWORD:-}" ]; then
    # hostname:port:database:username:password
    # **アプリ用ロール(appuser)のもの。** マスター(postgres)のパスワードは
    # タスクに渡していない(管理操作は SSM の DB_MASTER_PASSWORD を都度取得する)
    echo "*:*:*:appuser:${DB_PASSWORD}" > /app/.pgpass
    chown appuser:appuser /app/.pgpass
    chmod 600 /app/.pgpass
fi

# 引数で渡されたコマンドを実行
exec su - appuser -c "$*"
