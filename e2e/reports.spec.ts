import { expect, test } from '@playwright/test';

// 報告書 + 画像アップロードの E2E。
//
// **このファイルだけが実 S3(ローカル / CI は MinIO)の配線を通す。**
// 統合テストは storage をフェイクに差し替えているので、presigned URL が
// ブラウザから実際に解決できることを見られるのはここだけ。
// (シードは e2e/global-setup.ts が投入する)

const TENANT_CODE = 'e2e-tenant';
const LOGIN_ID = 'e2e-admin';
const PASSWORD = 'E2eTestPass123';

// EXIF(Make/Model)入りの 240x160 JPEG。外部ファイルを持たずに済むよう埋め込む
const JPEG_BASE64 =
  '/9j/4QDcRXhpZgAASUkqAAgAAAAIAA8BAgAHAAAAfgAAABABAgADAAAAWDEAABIBAwABAAAAAQAA' +
  'ABoBBQABAAAAbgAAABsBBQABAAAAdgAAACgBAwABAAAAAgAAABMCAwABAAAAAQAAAGmHBAABAAAA' +
  'hgAAAAAAAAA4YwAA6AMAADhjAADoAwAARTJFQ2FtAAAGAACQBwAEAAAAMDIxMAGRBwAEAAAAAQID' +
  'AACgBwAEAAAAMDEwMAGgAwABAAAA//8AAAKgBAABAAAA8AAAAAOgBAABAAAAoAAAAAAAAAD/2wBD' +
  'AA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5a' +
  'YVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09P' +
  'T09PT09PT09PT09PT09PT09PT0//wAARCACgAPADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAA' +
  'AAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEA' +
  'AAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCOAtJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD//2Q==';

const testImage = () => ({
  name: 'e2e-photo.jpg',
  mimeType: 'image/jpeg',
  buffer: Buffer.from(JPEG_BASE64, 'base64'),
});

const login = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.getByPlaceholder('施設IDを入力').fill(TENANT_CODE);
  await page.getByPlaceholder('ログインIDを入力').fill(LOGIN_ID);
  await page.getByPlaceholder('パスワードを入力').fill(PASSWORD);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page.getByText('E2E管理者 としてログイン中')).toBeVisible();
};

const gotoReports = async (page: import('@playwright/test').Page) => {
  await page.getByRole('button', { name: 'メニュー' }).click();
  await page.getByRole('link', { name: '報告書' }).click();
  await expect(page.getByRole('button', { name: '報告書を送信' })).toBeVisible();
};

test('画像つき報告書の作成から削除まで', async ({ page }) => {
  await login(page);
  await gotoReports(page);

  // ---- 送信フォームへ
  await page.getByRole('button', { name: '報告書を送信' }).click();
  await expect(page.getByRole('button', { name: '送信' })).toBeDisabled();

  const title = `E2E報告書 ${Date.now()}`;
  await page.getByPlaceholder('タイトルを入力').fill(title);
  await page.getByPlaceholder('本文を入力').fill('E2E からの本文');

  // タイトルと本文が埋まっても、画像 0 枚なら送信できない
  await expect(page.getByRole('button', { name: '送信' })).toBeDisabled();

  // ---- 画像を選ぶと即アップロードされ、プレビューが出る
  await page.locator('input[type="file"]').setInputFiles(testImage());
  const preview = page.getByAltText('添付画像のプレビュー');
  await expect(preview).toBeVisible();
  await expect(page.getByText('画像(1 / 10 枚。1 枚以上が必須)')).toBeVisible();

  // **presigned URL が実際に解決してブラウザに画像が載っている**ことを確かめる。
  // ここが MinIO / S3 の配線を通す唯一の検証
  await expect
    .poll(async () => await preview.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);

  await expect(page.getByRole('button', { name: '送信' })).toBeEnabled();

  // ---- 個別の取り消しでプレビューが消え、送信もできなくなる
  await page.getByRole('button', { name: 'この画像を取り消す' }).click();
  await expect(preview).toHaveCount(0);
  await expect(page.getByRole('button', { name: '送信' })).toBeDisabled();

  // ---- 入れ直して送信
  await page.locator('input[type="file"]').setInputFiles(testImage());
  await expect(page.getByAltText('添付画像のプレビュー')).toBeVisible();
  await page.getByRole('button', { name: '送信' }).click();

  // ---- 一覧に出る。サムネイルも実際に読み込めている
  await expect(page.getByText(title)).toBeVisible();
  const thumbnail = page.getByAltText(`${title} の添付画像`);
  await expect(thumbnail).toBeVisible();
  await expect
    .poll(async () => await thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);

  // ---- 削除(確認ダイアログ経由)
  await page.getByRole('button', { name: `${title} を削除` }).click();
  await expect(page.getByText('報告書を削除しますか')).toBeVisible();
  await page.getByRole('button', { name: '削除する' }).click();

  await expect(page.getByText(title)).toHaveCount(0);
});

test('削除の確認ダイアログはキャンセルできる', async ({ page }) => {
  await login(page);
  await gotoReports(page);

  const title = `E2E取消 ${Date.now()}`;
  await page.getByRole('button', { name: '報告書を送信' }).click();
  await page.getByPlaceholder('タイトルを入力').fill(title);
  await page.getByPlaceholder('本文を入力').fill('キャンセル確認用');
  await page.locator('input[type="file"]').setInputFiles(testImage());
  await expect(page.getByAltText('添付画像のプレビュー')).toBeVisible();
  await page.getByRole('button', { name: '送信' }).click();
  await expect(page.getByText(title)).toBeVisible();

  // キャンセルすると残る
  await page.getByRole('button', { name: `${title} を削除` }).click();
  await page.getByRole('button', { name: 'キャンセル' }).click();
  await expect(page.getByText(title)).toBeVisible();

  // 後片付け
  await page.getByRole('button', { name: `${title} を削除` }).click();
  await page.getByRole('button', { name: '削除する' }).click();
  await expect(page.getByText(title)).toHaveCount(0);
});
