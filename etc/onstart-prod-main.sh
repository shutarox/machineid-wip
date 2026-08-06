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
env | grep -E '^APPX_' | sed 's/^APPX_/export /' >> /tmp/environment;
cat /tmp/environment > /etc/environment

# 引数で渡されたコマンドを実行
exec su - appuser -c "$*"
