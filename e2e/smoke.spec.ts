import { expect, test } from '@playwright/test';

// E2E スモーク: ログイン → ユーザ管理 CRUD 一巡 → ログアウト
// (シードは e2e/global-setup.ts が投入する)

const TENANT_CODE = 'e2e-tenant';
const LOGIN_ID = 'e2e-admin';
const PASSWORD = 'E2eTestPass123';

test('ログインから users CRUD 一巡まで', async ({ page }) => {
  // ---- ログイン
  await page.goto('/');
  await page.getByPlaceholder('施設IDを入力').fill(TENANT_CODE);
  await page.getByPlaceholder('ログインIDを入力').fill(LOGIN_ID);
  await page.getByPlaceholder('パスワードを入力').fill(PASSWORD);
  await page.getByRole('button', { name: 'ログイン' }).click();

  await expect(page.getByText('E2E管理者 としてログイン中')).toBeVisible();

  // ---- ユーザ管理へ(ハンバーガーメニュー → ドロワー)
  await page.getByRole('button', { name: 'メニュー' }).click();
  await page.getByRole('link', { name: 'ユーザ管理' }).click();
  await expect(
    page.getByRole('cell', { name: LOGIN_ID, exact: true })
  ).toBeVisible();
  // ロール列は生値(ADMIN)ではなく日本語ラベルで表示される
  await expect(page.getByLabel('E2E管理者 のロール')).toContainText('管理者');

  // ---- ユーザ作成(初期パスワード発行の確認)
  const suffix = `${Date.now()}`;
  await page.getByRole('button', { name: 'ユーザ追加' }).click();
  await page.getByPlaceholder('名前', { exact: true }).fill(`E2E作成 ${suffix}`);
  await page.getByPlaceholder('ログインID', { exact: true }).fill(`e2e-created-${suffix}`);
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await expect(page.getByText('初期パスワード:')).toBeVisible();
  await page.getByRole('button', { name: '閉じる' }).click();

  // ---- 検索で作成ユーザが出る
  await page
    .getByPlaceholder('名前・ログインID・メールで検索')
    .fill(`e2e-created-${suffix}`);
  await page.getByRole('button', { name: '検索' }).click();
  await expect(
    page.getByRole('cell', { name: `e2e-created-${suffix}` })
  ).toBeVisible();

  // ---- 編集(名前変更)
  await page.getByRole('button', { name: '編集' }).first().click();
  await page.getByPlaceholder('名前', { exact: true }).fill(`E2E編集済 ${suffix}`);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('保存しました')).toBeVisible();
  await expect(
    page.getByRole('cell', { name: `E2E編集済 ${suffix}` })
  ).toBeVisible();

  // ---- 無効化
  await page.getByRole('button', { name: '無効化' }).first().click();
  await expect(page.getByRole('cell', { name: '無効' })).toBeVisible();

  // ---- ログアウト
  await page.getByRole('button', { name: 'E2E管理者' }).click();
  await page.getByRole('menuitem', { name: 'ログアウト' }).click();
  await expect(page.getByPlaceholder('施設IDを入力')).toBeVisible();
});
