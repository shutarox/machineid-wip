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
    echo "*:*:*:postgres:${DB_PASSWORD}" > /app/.pgpass
    chown appuser:appuser /app/.pgpass
    chmod 600 /app/.pgpass
fi

# 引数で渡されたコマンドを実行
exec su - appuser -c "$*"
