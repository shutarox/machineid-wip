import { expect, test } from '@playwright/test';

// フォーム状態(dirty / valid)の反応性を React Compiler のメモ化下で固定する検証。
//
// react-hook-form の formState はレンダー中の読み取りを追跡する Proxy のため、
// `useForm()` から分割代入すると Compiler の自動メモ化で追従しなくなる
// (かつ eslint の react-compiler ルールでは検出できない)。
// これを避ける書き方 — useFormState({ control }) / useWatch / useController — を
// 守れているかは静的に検査できないため、この spec が唯一の検出装置になる。
// フォームを追加・変更したら必ず流すこと(経緯は docs/decisions/20260803-ui-stack.md)。

const TENANT_CODE = 'e2e-tenant';
const LOGIN_ID = 'e2e-admin';
const PASSWORD = 'E2eTestPass123';

test('DebugParamsModal のボタン活性が formState に追従する', async ({
  page,
}) => {
  // ---- ログイン
  await page.goto('/');
  await page.getByPlaceholder('施設IDを入力').fill(TENANT_CODE);
  await page.getByPlaceholder('ログインIDを入力').fill(LOGIN_ID);
  await page.getByPlaceholder('パスワードを入力').fill(PASSWORD);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page.getByText('E2E管理者 としてログイン中')).toBeVisible();

  // ---- ユーザメニュー → パラメータ設定 (debug)
  await page.getByRole('button', { name: 'E2E管理者' }).click();
  await page.getByRole('menuitem', { name: 'パラメータ設定 (debug)' }).click();

  const input = page.getByPlaceholder('YYYY-MM-DD hh:mm');
  const applyButton = page.getByRole('button', { name: '適用' });
  await expect(input).toBeVisible();

  // 初期状態: 未変更(isDirty=false)なので非活性
  await expect(applyButton).toBeDisabled();

  // 不正な入力: dirty だが invalid なので非活性のまま
  await input.fill('abc');
  await expect(applyButton).toBeDisabled();

  // 正しい形式: dirty かつ valid になり活性化する
  await input.fill('2026-01-02 03:04');
  await expect(applyButton).toBeEnabled();

  // 初期値に戻す: isDirty=false に戻り再び非活性(formState の追従を検証)
  await input.fill('');
  await expect(applyButton).toBeDisabled();

  // ---- 適用まで通す(保存 → 再取得 → reset で非活性に戻る)
  await input.fill('2026-01-02 03:04');
  await applyButton.click();
  await expect(page.getByText('設定を保存しました')).toBeVisible();
  await expect(applyButton).toBeDisabled();

  // ---- 掃除: 空に戻して保存
  await input.fill('');
  await expect(applyButton).toBeEnabled();
  await applyButton.click();
  await expect(page.getByText('設定を保存しました').first()).toBeVisible();
});

// 保存済みの値があるときの開き直し。3e-1 で踏んだ不具合の回帰テスト:
// フォームを先にマウントして effect で form.reset() 同期すると、
// (a) 取得完了が入力より後になったときに入力が消える
// (b) remount 直後の reset がフォーム初期化に上書きされて空欄になる
// 取得完了までフォームをマウントしない実装に変えて解消した。
test('保存済みの疑似日時が開き直しても復元される', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('施設IDを入力').fill(TENANT_CODE);
  await page.getByPlaceholder('ログインIDを入力').fill(LOGIN_ID);
  await page.getByPlaceholder('パスワードを入力').fill(PASSWORD);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page.getByText('E2E管理者 としてログイン中')).toBeVisible();

  const openModal = async () => {
    await page.getByRole('button', { name: 'E2E管理者' }).click();
    await page
      .getByRole('menuitem', { name: 'パラメータ設定 (debug)' })
      .click();
  };
  const input = page.getByPlaceholder('YYYY-MM-DD hh:mm');
  const applyButton = page.getByRole('button', { name: '適用' });

  // ---- 値を保存して閉じる
  await openModal();
  await expect(input).toBeVisible();
  await input.fill('2026-01-02 03:04');
  await expect(applyButton).toBeEnabled();
  await applyButton.click();
  await expect(page.getByText('設定を保存しました')).toBeVisible();
  await page.getByRole('button', { name: '閉じる' }).click();

  // ---- 開き直すと保存値が入っており、未変更なので非活性
  await openModal();
  await expect(input).toHaveValue('2026-01-02 03:04');
  await expect(applyButton).toBeDisabled();

  // ---- 変更すると活性化し、保存値に戻すと再び非活性(既定値が保存値になっている)
  await input.fill('2026-09-09 09:09');
  await expect(applyButton).toBeEnabled();
  await input.fill('2026-01-02 03:04');
  await expect(applyButton).toBeDisabled();

  // ---- 掃除: 空に戻して保存
  await input.fill('');
  await expect(applyButton).toBeEnabled();
  await applyButton.click();
  await expect(page.getByText('設定を保存しました').first()).toBeVisible();
});

// PasswordChange の検証挙動の回帰テスト。「初期はエラー表示なし・ボタン非活性」を両立させる点が要で、
// react-hook-form の `mode: 'onChange'`(未入力のフィールドには検証を走らせない)+
// `useFormState({ control })` の `isValid` でボタン活性を決めることで成立している。
// formState を useForm の戻り値から分割代入すると React Compiler 下で活性が追従しなくなる
// (ADR `docs/decisions/20260803-ui-stack.md`)。これを検出できるのはこの spec だけ。
test('パスワード変更フォームの検証とボタン活性', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('施設IDを入力').fill(TENANT_CODE);
  await page.getByPlaceholder('ログインIDを入力').fill(LOGIN_ID);
  await page.getByPlaceholder('パスワードを入力').fill(PASSWORD);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page.getByText('E2E管理者 としてログイン中')).toBeVisible();

  await page.getByRole('button', { name: 'E2E管理者' }).click();
  await page.getByRole('menuitem', { name: 'パスワード変更' }).click();

  const oldPassword = page.getByPlaceholder('現在のパスワードを入力');
  const newPassword = page.getByPlaceholder('英数混合８文字以上');
  const submit = page.getByRole('button', { name: 'パスワード変更' });

  // 初期状態: 未接触なのでエラーは出さず、未入力なのでボタンは非活性
  await expect(oldPassword).toBeVisible();
  await expect(
    page.getByText('パスワードは8文字以上で入力してください。')
  ).toHaveCount(0);
  await expect(submit).toBeDisabled();

  // 触れて不正なら、そのフィールドにだけエラーが出る
  await oldPassword.fill('short');
  await expect(
    page.getByText('パスワードは8文字以上で入力してください。')
  ).toBeVisible();
  await expect(submit).toBeDisabled();

  // 英字のみの新パスワードは数字要件で弾かれる
  await oldPassword.fill('CurrentPass1');
  await newPassword.fill('abcdefgh');
  await expect(
    page.getByText('パスワードは英字と数字を含む必要があります。')
  ).toBeVisible();
  await expect(submit).toBeDisabled();

  // 両方が妥当になると活性化する(実際の変更は行わない)
  await newPassword.fill('NewPass123');
  await expect(submit).toBeEnabled();
});
