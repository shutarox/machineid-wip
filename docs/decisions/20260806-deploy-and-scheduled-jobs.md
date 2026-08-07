# ADR: サービスのイメージ更新を terraform の外に出し、マイグレーションとスクリプトは run-task、定期実行は API プロセス内のスケジューラで回す

- 状態: **採用**(2026-08-06)
- 関連: `docs/decisions/20260806-aws-minimal-prod.md`、`docs/plans/20260806-aws-prod-setup.md`

## 背景

雛形のデプロイ(`deploy/deploy_prod-main.sh`)は、ECR へ push したイメージのダイジェストを `ecr_digest.auto.tfvars` に書き、**`terraform apply` がタスク定義の登録とサービスの更新を同時に行う**構成だった。この形には 2 つの課題がある。

1. **マイグレーションを挟む場所がない。** タスク定義の登録とロールアウトが不可分なので、「新しいイメージでマイグレーションを流し、成功したらサービスを切り替える」という順序が表現できない
2. **ロールバックに terraform apply が要る。** 障害時に前のイメージへ戻す操作が重い

あわせて、`util` サーバの廃止(`20260806-aws-minimal-prod.md`)によって「SSH で入って `backend/script/*.ts` を叩く」経路が無くなるため、スクリプト実行の受け皿を決める必要があった。

定期実行については、NAT を廃止しても **Fargate はタスクごとに課金の最小単位(1 分)が発生し、起動のたびにイメージを取り直す**ため、高頻度の `run-task` は割に合わない。

## 決定

### 1. サービスのイメージ更新を terraform の管理外にする

```hcl
resource "aws_ecs_service" "main" {
  # ...
  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }
}
```

**タスク定義は terraform が管理し続ける**(env / secrets / ロールを宣言的に持てる利点を捨てない)。`terraform apply` は新リビジョンを登録するだけになり、サービスには触れなくなる。`desired_count` は autoscaling が動かすため元々除外が必要。

デプロイ手順は次の順になる。

```
1. build & push → digest を tfvars に書く
2. terraform apply             … タスク定義の新リビジョンを登録するだけ
3. run-task で migrate deploy  … 失敗したらここで停止(サービスは旧イメージのまま)
4. aws ecs update-service --task-definition <new arn>
5. aws ecs wait services-stable
6. SPA を S3 へ + CloudFront invalidation
```

**ロールバックは `aws ecs update-service --task-definition <前のリビジョン>` だけ**で完了する(terraform を通さない)。

### 2. マイグレーションはデプロイ手順の独立ステップとして `run-task` で 1 回だけ流す

新しく登録したタスク定義に対して `containerOverrides.command` でマイグレーションを実行し、**`exitCode` が 0 であることを確認してからサービスを更新する**。

### 3. `backend/script/*` の実行も `run-task` の command override で行う

汎用ラッパー `deploy/run_task.sh` を用意する。`describe-services` で**いま動いているタスク定義**を引いてから `run-task` するので、**デプロイ済みのコードと必ず同じもので実行される**。対話的な調査は ECS Exec を使う。

### 4. 定期実行は API サーバプロセス内のスケジューラで回す

軽いジョブは常駐している API タスクの中で実行する。重い / 低頻度のジョブだけ EventBridge → `run-task` に残す。

| ジョブの性質 | 置き場所 |
|---|---|
| 軽い・高頻度(数秒以内、I/O 中心、バッチサイズで区切れる) | **API プロセス内のスケジューラ** |
| 重い・低頻度(日次の集計、大量削除) | **EventBridge → run-task** |
| 重い・高頻度 | ここが埋まって初めて専用スケジューラサービスを検討する |

複数タスクでの多重実行は、**条件付き `updateMany` を claim として使う**ことで防ぐ。

```ts
const claimed = await nestableTransaction(async (tx) =>
  (await tx.scheduledJob.updateMany({
    where: { name, nextRunAt: { lte: now } },
    data:  { nextRunAt: nextOf(now), lastStartedAt: now },
  })).count === 1
);
if (claimed) await runJob(name);   // ジョブ本体は tx の外
```

READ COMMITTED では、負けた側は勝った側のコミット後に `where` が再評価されて 0 件になる。セマンティクスは **at-most-once**(claim 後にタスクが落ちた回はスキップされ、次の窓で拾う)。

### 5. ジョブ本体は `src/jobs/` に置き、すべての起動経路が同じ関数を呼ぶ

```
src/jobs/index.ts       ジョブ本体(name → 関数のレジストリ)
src/jobs/scheduler.ts   claim して回すループ(export)
script/scheduler.ts     ↑ を単体プロセスとして起動するエントリポイント
script/run_job.ts       単発実行のエントリポイント(run-task / ローカルから)
```

「アプリ内スケジューラ経由」「EventBridge 経由」「手動 run-task」「ローカル実行」がすべて同じ関数に収束する。

### 根拠

**定期実行を API プロセス内にする根拠**は、`run-task` の実コストにある(1vCPU/3GB ARM、1 回あたり課金 1.5 分、イメージ 400MB を仮定)。

| 実行頻度 | Fargate | NAT 経由時の image pull | NAT なし構成での合計 |
|---|---|---|---|
| 1 日 1 回 | $0.04 | $0.7 | $0.04 |
| 1 時間毎 | $1 | $18 | $1 |
| 15 分毎 | $4 | $72 | $4 |
| 5 分毎 | $12 | $217 | $12 |
| API プロセス内 | $0 | $0 | **$0** |

NAT を廃止した(`20260806-aws-minimal-prod.md`)ことで pull の課金は消えるが、**Fargate の最小課金単位は残る**ため、高頻度では依然として差が出る。

**専用スケジューラサービスを常駐させない根拠**は、費用($9/月)よりも「現時点で重い・高頻度のジョブが存在しない」ことにある。決定 5 の配置にしておけば、**必要になったときの移行が起動コマンドの差し替えだけで済む**(アプリのコードは変わらない)。

## 却下した選択肢

- **タスク起動時に `prisma migrate deploy` を実行する**(当初案): タスク数だけ実行され、`deployment_circuit_breaker` がサービスをロールバックしても **DB は途中まで進んだまま**になる。長いマイグレーションが `health_check_grace_period_seconds` を超えると unhealthy 扱いになり、アプリログにマイグレーション出力が混ざって切り分けも難しい
- **`terraform apply -target=aws_ecs_task_definition.main` でタスク定義だけ先に登録する**: サービスを terraform 管理下に残したまま順序を作る案。動くが `-target` は例外的な操作であり、ロールバックに terraform が要る問題も解決しない。決定 1 にすれば `-target` 自体が不要になる
- **サイドカーコンテナ + `dependsOn: SUCCESS` でマイグレーションを実行する**: 順序は保証されるが**タスク数だけ実行される**問題は残り、デプロイ単位も API と密結合のまま。`run-task` に対する利点がない
- **CodeDeploy の Blue/Green + `BeforeAllowTraffic` フック**: 1 回だけ実行でき順序も正しいが、この規模には重い
- **定期実行を EventBridge → `run-task` のまま高頻度で回す**: 上表のとおり。NAT なし構成でも 5 分毎で月 $12、NAT があれば $200 超
- **本番イメージに `script/` 実行用のラッパー(`/app/backend/run`)を置いて、ローカルの `pnpm script` に呼び方を寄せる**: ローカルは `pnpm script script/xxx.ts`、本番は `node /app/backend/build/script/xxx.js` と非対称だが、**実害が無い**(本番で `cleanup_uploads` / `db_bootstrap` / `seed` / `migrate` の実行を確認済み)。`run_task.sh` の `--help` に使用例があり、迷う場面は限られる。**呼び方を揃えるためだけにイメージへ 1 つ足す**のは、本番イメージを最小に保つ方針に対して割に合わない(2026-08-07 決定)
- **定期実行を単純な `setInterval` で書く**: autoscaling 1〜10 なので**最大 10 重に実行される**
- **専用のスケジューラサービスを常駐させる**(0.25vCPU/0.5GB で約 $9/月): 隔離は得られるが、現時点で「重い・高頻度」のジョブがない。必要になってから足せる
- **同一タスク内のサイドカーとしてスケジューラを動かす**: プロセスは分かれてもタスク数だけ増えるので排他制御は結局必要で、専用サービスの「1 個だけ動く」利点も得られない。中途半端

## エージェント向けの注意

- **`aws_ecs_service` の `task_definition` を terraform で更新しようとしないこと。** `ignore_changes` が入っているため terraform apply では切り替わらない。ロールアウトは `aws ecs update-service`(= `deploy/` のスクリプト)の責務
- **スケジューラに単純な `setInterval` を書かないこと。** 必ず条件付き `updateMany` の claim を通す。API タスクは複数動いている
- **ジョブ本体をトランザクションの中で回さないこと。** 既定 5 秒のタイムアウトがあり、`assertNotInTransaction` が tx 内の外部 I/O を禁止している。claim だけを tx に入れ、本体は外に出す
- **CPU バウンドな処理や長時間のジョブを API プロセス内スケジューラに足さないこと。** Node は単一スレッドなので、イベントループが詰まると **ALB のヘルスチェックが落ちてタスクが入れ替えられる**。これがこの構成の最大のリスクで、コストより優先して判断する。該当するジョブは EventBridge → `run-task` に置く
- **ジョブ本体は `src/jobs/` に置くこと。** `script/` にロジックを書くと、スケジューラから呼べなくなり実装が二重化する。`script/` はエントリポイントだけ
- **本番イメージ(`Dockerfile.prod-main`)には `prisma/migrations/`・`prisma/schema.prisma.generated`・`prisma.config.ts` が必要。** `datasource db` に `url` が書かれておらず、接続先は `prisma.config.ts` の `env('DB_URL')` から解決されるため、これが無いと `prisma migrate deploy` が動かない。実行時の cwd は `/app/backend`
- **マイグレーションは常に後方互換(expand / contract)で書くこと。** ローリングデプロイ中は新旧のタスクが同時に動く。列の追加は nullable かデフォルト付き、削除・リネームは「新列追加 → 両方書く → 移行 → 旧列削除」の 2 デプロイに分ける。これは実行方式を変えても解決しない
- **EventBridge のターゲットにはリビジョン付きのタスク定義 ARN を渡さないこと**(`arn_without_revision` を使う)。リビジョン固定にすると、デプロイしても定期実行だけ古いイメージで走り続ける
