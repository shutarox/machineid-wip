import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { noAutoFillProps, PasswordInput } from '@/components/ui/PasswordInput';
import { $api } from '@/libs/api';
import * as Stores from '@/stores';
import { zodResolver } from '@hookform/resolvers/zod';
import * as Jotai from 'jotai';
import { useForm, useFormState } from 'react-hook-form';
import * as RouterDOM from 'react-router-dom';
import { z } from 'zod';

const loginSchema = z.object({
  tenantCode: z.string().min(1, '施設IDを入力してください'),
  loginId: z.string().min(1, 'ログインIDを入力してください'),
  password: z
    .string()
    .min(8, 'パスワードは8文字以上で入力してください。')
    .max(20, 'パスワードは20文字以内で入力してください。'),
});

type LoginFormInputs = z.infer<typeof loginSchema>;

export const Login = () => {
  const [tenantCode, setTenantCode] = Jotai.useAtom(Stores.tenantCodeAtom);
  const navigate = RouterDOM.useNavigate();
  const setLoginUser = Jotai.useSetAtom(Stores.loginUserAtom);

  const loginMutation = $api.useMutation('post', '/api/login');

  const { register, handleSubmit, control } = useForm<LoginFormInputs>({
    defaultValues: { tenantCode: tenantCode ?? '', loginId: '', password: '' },
    resolver: zodResolver(loginSchema),
    // blur 時に検証する(入力途中で赤くしない)
    mode: 'onBlur',
  });
  // formState は useForm() から分割代入せずフックで購読する(React Compiler 対応)
  const { errors } = useFormState({ control });

  const onSubmit = async (value: LoginFormInputs) => {
    try {
      const data = await loginMutation.mutateAsync({ body: value });
      setTenantCode(value.tenantCode);
      setLoginUser(data);
      void navigate('/home');
    } catch {
      // エラーはグローバル(MutationCache.onError)で処理済み
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-50px)] items-center justify-center bg-muted">
      <div className="w-[90%] rounded-md bg-background p-6 shadow-md sm:w-100">
        <h1 className="mb-6 text-center text-2xl font-bold">LOGIN</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit(onSubmit)(e);
          }}
          className="flex flex-col gap-4"
        >
          <Field>
            <FieldLabel htmlFor="tenantCode">施設ID</FieldLabel>
            <Input
              id="tenantCode"
              placeholder="施設IDを入力"
              {...noAutoFillProps}
              autoComplete="username"
              {...register('tenantCode')}
            />
            <FieldError errors={errors.tenantCode ? [errors.tenantCode] : []} />
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

          <Field>
            <FieldLabel htmlFor="password">パスワード</FieldLabel>
            <PasswordInput
              id="password"
              placeholder="パスワードを入力"
              {...noAutoFillProps}
              autoComplete="new-password"
              {...register('password')}
            />
            <FieldError errors={errors.password ? [errors.password] : []} />
          </Field>

          <Button
            type="submit"
            className="w-full"
            disabled={loginMutation.isPending}
          >
            ログイン
          </Button>

          <Button
            type="button"
            variant="link"
            className="w-full"
            onClick={() => void navigate('/passwordReset')}
          >
            パスワード未設定／忘れた方はこちら
          </Button>
        </form>
      </div>
    </div>
  );
};
