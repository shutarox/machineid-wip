import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/DatePicker';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { TimeInput } from '@/components/ui/TimeInput';
import { client } from '@/libs/api';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { toast } from 'sonner';

// GET /api/debug/wait を任意の待ち時間で叩き、以下を目視確認するための動作テスト用ページ(§8):
// - GlobalSpinner の 100ms 遅延表示 / ブロック(クリック不可)/ 10ms 遅延アンブロック
// - meta.blocking:false でスピナーは出るがクリックは透過すること
// - 複数同時実行での fetching カウント合算(最長完了までスピナー維持)
// - ワイヤー正準形: now が string(YYYY-MM-DDTHH:mm:ss+09:00)のまま表示されること
//
// $api.useQuery は同一エンドポイントだと queryKey(=[method, path, init])が衝突し、
// blocking / nonBlocking の meta が相互に上書きされてしまう。ここは queryKey を明示できる
// 素の useQuery + api.ts の client(serializer / Middleware は client 側で適用済み)を使う。

const waitFetch = async (sleep: number) => {
  const { data, error } = await client.GET('/api/debug/wait', {
    params: { query: { sleep } },
  });
  if (error) throw error;
  return data;
};

export const Test = () => {
  const [sleep, setSleep] = React.useState(3000);

  const blocking = useQuery({
    queryKey: ['debug-test', 'blocking', sleep],
    queryFn: () => waitFetch(sleep),
    enabled: false,
  });

  const nonBlocking = useQuery({
    queryKey: ['debug-test', 'nonBlocking', sleep],
    queryFn: () => waitFetch(sleep),
    enabled: false,
    meta: { blocking: false },
  });

  const triple1000 = useQuery({
    queryKey: ['debug-test', 'triple', 1000],
    queryFn: () => waitFetch(1000),
    enabled: false,
  });
  const triple2000 = useQuery({
    queryKey: ['debug-test', 'triple', 2000],
    queryFn: () => waitFetch(2000),
    enabled: false,
  });
  const triple3000 = useQuery({
    queryKey: ['debug-test', 'triple', 3000],
    queryFn: () => waitFetch(3000),
    enabled: false,
  });

  const latest = blocking.data ?? nonBlocking.data;

  return (
    <div className="p-6">
      <div className="flex max-w-120 flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="sleep">sleep (ミリ秒)</FieldLabel>
          <Input
            id="sleep"
            type="number"
            value={sleep}
            onChange={(e) => setSleep(Number(e.target.value))}
            className="max-w-50"
          />
        </Field>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void blocking.refetch()}>
            ブロッキング実行
          </Button>
          <Button variant="outline" onClick={() => void nonBlocking.refetch()}>
            非ブロッキング実行
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              void triple1000.refetch();
              void triple2000.refetch();
              void triple3000.refetch();
            }}
          >
            3 連同時実行 (1s / 2s / 3s)
          </Button>
        </div>

        <div>
          <p>waited: {latest ? `${latest.waited} ms` : '-'}</p>
          {/* now は Date ではなく string のまま表示される(ワイヤー正準形の目視) */}
          <p>now: {latest ? latest.now : '-'}</p>
        </div>

        <ToastSection />
        <DateTimeInputSection />
      </div>
    </div>
  );
};

// トースト表示の目視確認用。
// - エラートースト: 実際にリクエストを失敗させ、QueryCache.onError → sonner の経路を通す
//   (queryClient.ts の handleApiError を通るので、本番と同じ出方になる)
// - 成功トースト: 画面側から toast.success() を直接呼ぶ通常の使い方
const ToastSection = () => {
  // sleep は正の整数のみ許すため、-1 を送るとサーバのバリデーションで 400 になる
  const errorQuery = useQuery({
    queryKey: ['debug-test', 'error'],
    queryFn: () => waitFetch(-1),
    enabled: false,
  });

  return (
    <div className="mt-6 flex flex-col gap-3 border-t pt-4">
      <div className="text-sm font-medium">トースト表示</div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => void errorQuery.refetch()}
        >
          エラートースト(通信エラーを発生させる)
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => toast.success('処理が完了しました')}
        >
          成功トースト
        </Button>
      </div>
    </div>
  );
};

// 3e スパイク項目(1)の検証面。Tailwind + Base UI で DatePicker / 時刻入力が
// 実用水準で組めるかを見るためのもので、合格したので雛形に残している。
// 挙動は e2e/uiComponents.spec.ts が固定する。
const DateTimeInputSection = () => {
  const [date, setDate] = React.useState('');
  const [time, setTime] = React.useState('');

  return (
    <div className="mt-6 flex flex-col gap-3 border-t pt-4">
      <div className="text-sm font-medium">日付 / 時刻入力(shadcn + Base UI)</div>
      <DatePicker value={date} onChange={setDate} />
      <TimeInput value={time} onChange={setTime} />
      <div className="text-sm" data-testid="datetime-value">
        値: {date || '(未入力)'} {time || '(未入力)'}
      </div>
    </div>
  );
};
