import { Input } from '@/components/ui/input';
import { normalizeTime } from '@/libs/dateParts';
import * as React from 'react';

// 時刻入力。'930' / '9:5' のような省略入力を blur 時に 'HH:mm' へ正規化する。
// 入力中は文字列をそのまま保持し(打鍵の邪魔をしない)、確定時だけ正規化する方針。
// 解釈できない文字列は onChange に渡さず、直前の確定値へ戻す。

type TimeInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  'aria-label'?: string;
};

export const TimeInput = ({
  value,
  onChange,
  placeholder = 'HH:mm',
  disabled,
  'aria-label': ariaLabel = '時刻',
}: TimeInputProps) => {
  const [draft, setDraft] = React.useState(value);

  // 外部から値が変わったら入力中の文字列も合わせる
  React.useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    const normalized = normalizeTime(draft);
    if (normalized === null) {
      setDraft(value); // 解釈不能なら元に戻す
      return;
    }
    setDraft(normalized);
    if (normalized !== value) onChange(normalized);
  };

  return (
    <Input
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={draft}
      disabled={disabled}
      inputMode="numeric"
      className="w-24"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
    />
  );
};
