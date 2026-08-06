#!/bin/bash

is_remote_container() {
    if [ -n "$REMOTE_CONTAINERS" ]; then
        return 0
    fi
    return 1
}

if is_remote_container; then
    # リモートコンテナ内では直接実行
    "$@"
else
    # ローカルではDockerコンテナ内で実行
    # < /dev/null の部分は、標準入力を閉じて入力待ちによるハングを防ぐ
    # 引数はサービス名(dev-local)。コンテナ名ではない
    # compose は container_name を明示せず既定の `<name>-<サービス名>-<連番>` に任せているので、
    # コンテナ名を直接書くとプロジェクト名を変えた派生先で壊れる
    docker compose -f docker/docker-compose.local.yml exec -T dev-local "$@" < /dev/null
fi