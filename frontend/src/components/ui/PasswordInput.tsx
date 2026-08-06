import { Input } from '@/components/ui/input';
import { cn } from '@/libs/utils';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import * as React from 'react';

// パスワード入力(表示/非表示トグル付き)。Login / PasswordChange / PasswordReset で共用する。
// Chakra の InputGroup + InputRightElement の置き換え。

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, 'type'>;

export const PasswordInput = ({ className, ...props }: PasswordInputProps) => {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="relative">
      <Input
        type={visible ? 'text' : 'password'}
        className={cn('pr-10', className)}
        {...props}
      />
      <button
        type="button"
        aria-label={visible ? 'パスワードを隠す' : 'パスワードを表示'}
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
      >
        {visible ? (
          <EyeIcon className="size-4" />
        ) : (
          <EyeOffIcon className="size-4" />
        )}
      </button>
    </div>
  );
};

// パスワードマネージャの自動入力・自動補正を抑止する共通属性。
export const noAutoFillProps = {
  autoCapitalize: 'none',
  autoComplete: 'off',
  autoCorrect: 'off',
  spellCheck: false,
  'data-lpignore': 'true',
  'data-1p-ignore': 'true',
  'data-form-type': 'other',
} as const;
