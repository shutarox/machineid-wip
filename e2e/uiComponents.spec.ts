import { expect, test } from '@playwright/test';

// 3e スパイク項目(1)の固定。Tailwind + Base UI で自前実装した DatePicker / TimeInput が
// 「テキスト直接入力」「カレンダー選択」「省略入力の正規化」で期待どおり動くことを見る。
// 検証面は /debug/test(pages/debug/Test.tsx)。

const TENANT_CODE = 'e2e-tenant';
const LOGIN_ID = 'e2e-admin';
const PASSWORD = 'E2eTestPass123';

test('DatePicker と TimeInput が値を確定できる', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('施設IDを入力').fill(TENANT_CODE);
  await page.getByPlaceholder('ログインIDを入力').fill(LOGIN_ID);
  await page.getByPlaceholder('パスワードを入力').fill(PASSWORD);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page.getByText('E2E管理者 としてログイン中')).toBeVisible();

  // memory router のため URL 直打ちでは遷移できない。ユーザメニューの導線から入る
  await page.getByRole('button', { name: 'E2E管理者' }).click();
  await page.getByRole('menuitem', { name: '動作テスト (debug)' }).click();

  const value = page.getByTestId('datetime-value');
  await expect(value).toContainText('(未入力)');

  // ---- 日付: テキスト直接入力
  await page.getByLabel('日付').fill('2026-03-15');
  await expect(value).toContainText('2026-03-15');

  // ---- 日付: カレンダーから選択(入力済みの月が開き、同月の 20 日を選ぶ)
  await page.getByRole('button', { name: 'カレンダーを開く' }).click();
  await expect(page.getByText('2026年 3月')).toBeVisible();
  await page.getByRole('button', { name: '20', exact: true }).click();
  await expect(value).toContainText('2026-03-20');

  // ---- 日付: 月送り(前の月へ移動して 1 日を選ぶ)
  await page.getByRole('button', { name: 'カレンダーを開く' }).click();
  await page.getByRole('button', { name: '前の月' }).click();
  await expect(page.getByText('2026年 2月')).toBeVisible();
  await page.getByRole('button', { name: '1', exact: true }).first().click();
  await expect(value).toContainText('2026-02-01');

  // ---- 時刻: 省略入力が blur で正規化される
  const time = page.getByLabel('時刻');
  await time.fill('930');
  await time.blur();
  await expect(time).toHaveValue('09:30');
  await expect(value).toContainText('09:30');

  // ---- 時刻: コロン区切りの省略も正規化される
  await time.fill('9:5');
  await time.blur();
  await expect(time).toHaveValue('09:05');

  // ---- 時刻: 解釈できない入力は直前の確定値に戻る
  await time.fill('99:99');
  await time.blur();
  await expect(time).toHaveValue('09:05');
});

// トースト経路の固定。エラーは QueryCache.onError → sonner、成功は画面から toast.success()。
test('エラートーストと成功トーストが表示される', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('施設IDを入力').fill(TENANT_CODE);
  await page.getByPlaceholder('ログインIDを入力').fill(LOGIN_ID);
  await page.getByPlaceholder('パスワードを入力').fill(PASSWORD);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page.getByText('E2E管理者 としてログイン中')).toBeVisible();

  await page.getByRole('button', { name: 'E2E管理者' }).click();
  await page.getByRole('menuitem', { name: '動作テスト (debug)' }).click();

  // 失敗するリクエスト(sleep=-1)がグローバルのエラー処理を通ってトーストになる
  await page
    .getByRole('button', { name: 'エラートースト(通信エラーを発生させる)' })
    .click();
  await expect(page.getByText('不正な送信パラメータです')).toBeVisible();

  await page.getByRole('button', { name: '成功トースト' }).click();
  await expect(page.getByText('処理が完了しました')).toBeVisible();
});
