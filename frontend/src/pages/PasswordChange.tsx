import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { noAutoFillProps, PasswordInput } from '@/components/ui/PasswordInput';
import { $api } from '@/libs/api';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFormState } from 'react-hook-form';
import * as RouterDOM from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

const formSchema = z.object({
  oldPassword: z
    .string()
    .min(8, 'パスワードは8文字以上で入力してください。')
    .max(20, 'パスワードは20文字以内で入力してください。'),
  newPassword: z
    .string()
    .min(8, 'パスワードは8文字以上で入力してください。')
    .max(20, 'パスワードは20文字以内で入力してください。')
    .regex(
      /^(?=.*[a-zA-Z])(?=.*\d)/,
      'パスワードは英字と数字を含む必要があります。'
    ),
});

type FormInputs = z.infer<typeof formSchema>;

export const PasswordChange = () => {
  const navigate = RouterDOM.useNavigate();

  const changeMutation = $api.useMutation('post', '/api/private/passwordChange');

  const { register, handleSubmit, control } = useForm<FormInputs>({
    defaultValues: { oldPassword: '', newPassword: '' },
    resolver: zodResolver(formSchema),
    mode: 'onChange',
  });
  // formState は useForm() から分割代入せずフックで購読する(React Compiler 対応)
  const { errors, isValid } = useFormState({ control });

  const onSubmit = async (value: FormInputs) => {
    try {
      await changeMutation.mutateAsync({ body: value });
      toast.success('パスワードを変更しました');
      void navigate('/');
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
        <Field>
          <FieldLabel htmlFor="oldPassword">現在のパスワード</FieldLabel>
          <PasswordInput
            id="oldPassword"
            placeholder="現在のパスワードを入力"
            {...noAutoFillProps}
            {...register('oldPassword')}
          />
          <FieldError errors={errors.oldPassword ? [errors.oldPassword] : []} />
        </Field>

        <Field>
          <FieldLabel htmlFor="newPassword">新しいパスワード</FieldLabel>
          <PasswordInput
            id="newPassword"
            placeholder="英数混合８文字以上"
            {...noAutoFillProps}
            {...register('newPassword')}
          />
          <FieldError errors={errors.newPassword ? [errors.newPassword] : []} />
        </Field>

        <Button type="submit" className="w-full" disabled={!isValid}>
          パスワード変更
        </Button>
      </form>
    </div>
  );
};
