import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { noAutoFillProps, PasswordInput } from '@/components/ui/PasswordInput';
import { $api } from '@/libs/api';
import * as Stores from '@/stores';
import { zodResolver } from '@hookform/resolvers/zod';
import * as Jotai from 'jotai';
import React from 'react';
import { useController, useForm, useFormState, useWatch } from 'react-hook-form';
import * as RouterDOM from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

// 認証コード送信(request)→ パスワード設定(reset)の 2 モード直列フロー。
// 認証失敗(authErrorMessage)は 200 応答なので画面側で処理し、
// 通信/サーバエラーのみ catch(グローバル処理済み)へ落とす。

const formSchema = z.object({
  tenantCode: z.string().min(1, '施設IDを入力してください'),
  loginId: z.string().min(1, 'ログインIDを入力してください'),
  authCode: z.union([
    z.literal(''),
    z.string().regex(/^[a-z\d]{6}$/i, '6桁の認証コードを入力してください'),
  ]),
  newPassword: z.union([
    z.literal(''),
    z
      .string()
      .min(8, 'パスワードは8文字以上で入力してください。')
      .max(100, 'パスワードは100文字以内で入力してください。')
      .regex(
        /^(?=.*[a-zA-Z])(?=.*\d)/,
        'パスワードは英字と数字を含む必要があります。'
      ),
  ]),
});

type FormInputs = z.infer<typeof formSchema>;

const Explain = ({ children }: { children: React.ReactNode }) => (
  <div className="w-full border border-neutral-500 bg-amber-50 p-2.5">
    {children}
  </div>
);

export const PasswordReset = () => {
  const [tenantCode, setTenantCode] = Jotai.useAtom(Stores.tenantCodeAtom);
  const navigate = RouterDOM.useNavigate();

  const [mode, setMode] = React.useState<'request' | 'reset'>('request');
  const [maskedEmail, setMaskedEmail] = React.useState('');
  const [sendWaitingTime, setSendWaitingTime] = React.useState(0);

  const resetMutation = $api.useMutation('post', '/api/passwordResetRequest');

  React.useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    if (sendWaitingTime > 0) {
      timeout = setTimeout(() => {
        setSendWaitingTime(sendWaitingTime - 1);
      }, 1000);
    }
    return () => clearTimeout(timeout);
  }, [sendWaitingTime]);

  const { register, handleSubmit, control } = useForm<FormInputs>({
    defaultValues: {
      tenantCode: tenantCode ?? '',
      loginId: '',
      authCode: '',
      newPassword: '',
    },
    resolver: zodResolver(formSchema),
    mode: 'onChange',
  });
  // formState / 値の購読はいずれもフック経由で行う(React Compiler 対応)
  const { errors, isValid } = useFormState({ control });
  const values = useWatch({ control });
  // 認証コードは大文字で扱うため、setValue ではなく useController でバインドする
  const { field: authCodeField } = useController({ name: 'authCode', control });

  const onSubmit = async (value: FormInputs) => {
    try {
      if (mode === 'request') {
        const data = await resetMutation.mutateAsync({
          body: {
            mode: 'request',
            tenantCode: value.tenantCode,
            loginId: value.loginId,
          },
        });
        if (data?.maskedEmail) {
          setTenantCode(value.tenantCode);
          setMode('reset');
          toast.success('認証コードを送信しました');
          setMaskedEmail(data.maskedEmail);
          setSendWaitingTime(60);
        }
        return;
      }

      const data = await resetMutation.mutateAsync({
        body: {
          mode: 'reset',
          tenantCode: value.tenantCode,
          loginId: value.loginId,
          authCode: value.authCode,
          newPassword: value.newPassword,
        },
      });
      if (data?.authErrorMessage) {
        toast.error(data.authErrorMessage);
        if (data?.backToRequestMode) {
          setMode('request');
        }
        return;
      }
      toast.success('パスワードを設定しました');
      setTimeout(() => {
        void navigate('/');
      }, 100);
    } catch {
      // エラーはグローバル(MutationCache.onError)で処理済み
    }
  };

  return (
    <div className="mx-auto my-25 max-w-100">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit(onSubmit)(e);
        }}
        className="flex flex-col gap-4"
      >
        {mode === 'request' && (
          <>
            <Explain>
              事前に登録されたメールアドレスにパスワード設定用の認証コードを送信します。
            </Explain>

            <Field>
              <FieldLabel htmlFor="tenantCode">施設ID</FieldLabel>
              <Input
                id="tenantCode"
                placeholder="施設IDを入力"
                {...noAutoFillProps}
                autoComplete="username"
                {...register('tenantCode')}
              />
              <FieldError
                errors={errors.tenantCode ? [errors.tenantCode] : []}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="loginId">ログインID</FieldLabel>
              <Input
                id="loginId"
                placeholder="ログインIDを入力"
                {...noAutoFillProps}
                autoComplete="username"
                {...register('loginId')}
              />
              <FieldError errors={errors.loginId ? [errors.loginId] : []} />
            </Field>

            <Button
              type="submit"
              className="w-full"
              disabled={!isValid || sendWaitingTime > 0}
            >
              {sendWaitingTime > 0
                ? `あと${sendWaitingTime}秒で再送信可能`
                : '認証コード送信'}
            </Button>
          </>
        )}

        {mode === 'reset' && (
          <>
            <Explain>
              <b>{maskedEmail}</b> 宛に認証コードを送信しました。
              メールに記載の認証コードを入力してパスワードを再設定してください。
            </Explain>

            <Field>
              <FieldLabel htmlFor="authCode">認証コード</FieldLabel>
              <Input
                id="authCode"
                placeholder="6桁の認証コードを入力"
                {...noAutoFillProps}
                value={authCodeField.value}
                onBlur={authCodeField.onBlur}
                onChange={(e) =>
                  authCodeField.onChange(e.target.value.toUpperCase())
                }
              />
              <FieldError errors={errors.authCode ? [errors.authCode] : []} />
            </Field>

            <Field>
              <FieldLabel htmlFor="newPassword">新しいパスワード</FieldLabel>
              <PasswordInput
                id="newPassword"
                placeholder="英数混合８文字以上"
                {...noAutoFillProps}
                autoComplete="new-password"
                {...register('newPassword')}
              />
              <FieldError
                errors={errors.newPassword ? [errors.newPassword] : []}
              />
            </Field>

            {/* 認証コードとパスワードの両方が埋まるまで押せない */}
            <Button
              type="submit"
              className="w-full"
              disabled={
                !isValid ||
                (values.authCode ?? '').length !== 6 ||
                (values.newPassword ?? '').length === 0
              }
            >
              パスワード設定
            </Button>
          </>
        )}
      </form>
    </div>
  );
};
