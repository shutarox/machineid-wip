import { defineConfig } from '@playwright/test';

// E2E スモークテストの設定。
// - backend は E2E 専用に 8082 で起動する(PM2 の 8080 は再利用しない)
// - frontend は E2E 専用に 8890 で vite dev を起動する
//   (PM2 の 8800 は VITE_API_SERVER_BASE_URL がホスト公開ポート向けのため使わない)
//
// **backend を dev と共有しないのは presigned URL のホスト名が違うため。**
// presigned URL を開くのは、dev では**ホストのブラウザ**、E2E では**コンテナ内の
// chromium**で、MinIO に到達できる名前が異なる(localhost:9000 / miniohost:9000)。
// SigV4 は Host ごと署名するので URL の後付け書き換えができず、プロセスの環境変数で
// 分けるしかない = 1 つのサーバを共有できない。
// 起動コマンドは dev と同じ tsx のままなので、ADR 20260804-dev-server.md の
// 「dev と E2E で起動経路を食い違わせない」は保っている。

const E2E_BACKEND_PORT = 8082;
const E2E_FRONTEND_PORT = 8890;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 30000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${E2E_FRONTEND_PORT}`,
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command:
        'pnpm --dir backend exec tsx -r tsconfig-paths/register src/index.ts',
      port: E2E_BACKEND_PORT,
      reuseExistingServer: false,
      stdout: 'pipe',
      timeout: 120000,
      env: {
        BACKEND_PORT: String(E2E_BACKEND_PORT),
        // debug 系ルート(ユーザ切替・パラメータ設定)も E2E 対象にする
        ENABLE_DEBUG_MODE: 'true',
        // presigned URL を開くのはコンテナ内の chromium なので、docker ネットワーク内の
        // 名前で署名する。**開発コンテナの S3_PUBLIC_ENDPOINT(ホストのブラウザ向けで
        // localhost:9000)をそのまま継承してはいけない** — コンテナ内からは到達できず、
        // 画像が読めずに落ちる。CI だけは別の値が要るので専用の変数名で受ける
        S3_PUBLIC_ENDPOINT:
          process.env.E2E_S3_PUBLIC_ENDPOINT ?? 'http://miniohost:9000',
      },
    },
    {
      command: `pnpm --dir frontend exec vite --port ${E2E_FRONTEND_PORT} --strictPort`,
      port: E2E_FRONTEND_PORT,
      reuseExistingServer: false,
      stdout: 'pipe',
      timeout: 120000,
      env: {
        VITE_API_SERVER_BASE_URL: `http://localhost:${E2E_BACKEND_PORT}`,
        // debug 系 UI(ユーザ切替・パラメータ設定)も E2E 対象にする
        VITE_ENABLE_DEBUG_MODE: 'true',
      },
    },
  ],
});
