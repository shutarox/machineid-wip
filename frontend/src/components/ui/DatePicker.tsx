import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  buildMonthMatrix,
  formatDate,
  isSameDate,
  parseDate,
} from '@/libs/dateParts';
import { cn } from '@/libs/utils';
import { Popover } from '@base-ui/react/popover';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import * as React from 'react';

// 日付入力。テキスト直接入力(YYYY-MM-DD)+ カレンダー選択の併用。
// shadcn/ui にカレンダーの既製品はなく Base UI にもカレンダーのプリミティブはないため、
// Popover(Base UI)の上に月グリッドを自前で組んでいる(workplan 3e の「自前実装可」)。
// 値は 'YYYY-MM-DD' 文字列で受け渡しし、Date には変換しない(ワイヤー表現と一致させる)。

const WEEK_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

type DatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  'aria-label'?: string;
};

export const DatePicker = ({
  value,
  onChange,
  placeholder = 'YYYY-MM-DD',
  disabled,
  'aria-label': ariaLabel = '日付',
}: DatePickerProps) => {
  const [open, setOpen] = React.useState(false);
  const selected = parseDate(value);
  // 表示中の月。未入力なら今日の月から始める。
  const [visibleMonth, setVisibleMonth] = React.useState(
    () => selected ?? new Date()
  );

  // 入力欄で有効な日付が打たれたらカレンダーの表示月も追従させる
  React.useEffect(() => {
    if (selected) setVisibleMonth(selected);
    // selected は毎レンダー新しい Date になるため value を依存に使う
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const weeks = buildMonthMatrix(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth()
  );
  const today = new Date();

  const shiftMonth = (delta: number) =>
    setVisibleMonth(
      (m) => new Date(m.getFullYear(), m.getMonth() + delta, 1)
    );

  return (
    <div className="flex items-center gap-1">
      <Input
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-36"
      />
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          render={
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={disabled}
              aria-label="カレンダーを開く"
            >
              <CalendarIcon />
            </Button>
          }
        />
        <Popover.Portal>
          <Popover.Positioner sideOffset={4}>
            <Popover.Popup className="rounded-lg border bg-popover p-3 text-popover-foreground shadow-md">
              <div className="mb-2 flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="前の月"
                  onClick={() => shiftMonth(-1)}
                >
                  <ChevronLeftIcon />
                </Button>
                <div className="text-sm font-medium">
                  {visibleMonth.getFullYear()}年 {visibleMonth.getMonth() + 1}月
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="次の月"
                  onClick={() => shiftMonth(1)}
                >
                  <ChevronRightIcon />
                </Button>
              </div>

              <table className="border-separate border-spacing-1">
                <thead>
                  <tr>
                    {WEEK_LABELS.map((label) => (
                      <th
                        key={label}
                        className="text-muted-foreground text-xs font-normal"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((week) => (
                    <tr key={formatDate(week[0])}>
                      {week.map((day) => {
                        const isCurrentMonth =
                          day.getMonth() === visibleMonth.getMonth();
                        const isSelected = !!selected && isSameDate(day, selected);
                        return (
                          <td key={formatDate(day)}>
                            <button
                              type="button"
                              onClick={() => {
                                onChange(formatDate(day));
                                setOpen(false);
                              }}
                              className={cn(
                                'size-8 rounded-md text-sm hover:bg-accent hover:text-accent-foreground',
                                !isCurrentMonth && 'text-muted-foreground/50',
                                isSameDate(day, today) && 'border border-ring',
                                isSelected &&
                                  'bg-primary text-primary-foreground hover:bg-primary'
                              )}
                            >
                              {day.getDate()}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
};
