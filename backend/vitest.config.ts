import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(dirname, 'src'),
    },
  },
  test: {
    // 並列度の上限。既定は availableParallelism() - 1 で、10 コアの開発コンテナでは
    // worker が 9 本立ち、1 本あたり 400〜550MB 使うためメモリのピークが跳ねる
    // (dev サーバを上げたまま verify を回すと OOM で watch プロセスが殺されていた)。
    //
    // 実測(dev 稼働中・`pnpm verify` 全体の実時間 / anon ピーク、各 2 回):
    //   maxWorkers=6 → 40s,38s / 5,550MB,5,386MB
    //   maxWorkers=4 → 38s,37s / 4,670MB,4,670MB
    // 4 は時間が悪化せず(むしろ競合が減って速い)、ピークが約 800MB 下がる。
    //
    // ピークは概ね「平常 2,716MB + N × worker 単価(現在 約 470MB)」で、
    // **N は単価に掛かる係数**。アプリが育つと単価が上がるため、N を小さくしておくと
    // 効果が比例して大きくなる(単価が倍になると 6 では上限 7,836MB を超える)。
    //
    // 注意: **明示すると CPU 由来の既定(availableParallelism() - 1)を上書きする**。
    // CI は 2 コアで既定 1 本だったが、この指定により 4 本になる(実測で確認)。
    // verify の所要時間への影響はノイズの範囲だった(1 本 70/70/88/88s vs 4 本 78/82s)。
    // CI だけ既定に戻したいなら process.env.CI で分岐できるが、現時点で根拠はない。
    // なお `projects` を使う構成では **ルートの poolOptions はプロジェクトに継承されない**。
    // maxForks ではなくトップレベルの maxWorkers を使うこと(実測で確認済み)。
    maxWorkers: 4,
    coverage: {
      include: ['src/**'],
      exclude: ['src/**/*.test.ts', 'src/generated/**', 'src/@types/**'],
      reporter: ['text', 'text-summary'],
    },
    projects: [
      {
        // 純粋関数のユニットテスト(DB 不要、src に併置)
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        // 実 PG 統合テスト(worker ごとに template database から複製)
        extends: true,
        test: {
          name: 'integration',
          // autoload の動的 import(routes 配下)を vitest の変換パイプラインに
          // 通して @/ エイリアスを解決させる
          server: {
            deps: {
              inline: ['@fastify/autoload'],
            },
          },
          include: ['test/integration/**/*.test.ts'],
          globalSetup: ['test/setup/global-setup.ts'],
          setupFiles: ['test/setup/integration-setup.ts'],
          testTimeout: 20000,
          hookTimeout: 60000,
        },
      },
    ],
  },
});
