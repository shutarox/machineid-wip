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

# PostgreSQL のパスワードを ~/.pgpass に設定
echo "*:*:*:appuser:${DB_PASSWORD}" > /app/.pgpass
chown appuser:appuser /app/.pgpass
chmod 600 /app/.pgpass

# Dockerfile 等で設定された環境変数を子プロセス等に引き継ぐ
# APPX_*** -> export ****
env | grep -E '^APPX_' | sed 's/^APPX_/export /' >> /tmp/environment;
cat /tmp/environment > /etc/environment

# appuserでNodeプロセスを起動（バックグラウンド）
su - appuser -c "
    pm2 delete all

    cd /app/backend
    pnpm install
    pnpm dev

    cd /app/frontend
    pnpm install
    pnpm dev

    pm2 logs
" &

exec /usr/sbin/sshd -D
