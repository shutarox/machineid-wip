import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { $api } from '@/libs/api';
import { useRemountOnOpen } from '@/libs/useRemountOpen';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useController, useForm, useFormState } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

// フォームは react-hook-form。React Compiler と併用するため、RHF が推奨する
// フック経由の購読 API だけを使う(`'use no memo'` は付けない):
// - formState は useForm() から分割代入せず useFormState({ control }) で取る
// - 値を reset() で書き換えるフィールドは register ではなく useController でバインドする
// 挙動は e2e/formState.spec.ts が固定している。

type DebugParamsModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

type FormData = z.infer<typeof formSchema>;

const formSchema = z.object({
  virtualDate: z
    .string()
    .regex(/^(\d{4}[-/]\d{1,2}[-/]\d{1,2}( \d{1,2}:\d{2})?)?$/),
});

export const DebugParamsModal = (props: DebugParamsModalProps) => {
  const { key, isOpen } = useRemountOnOpen(props.isOpen);
  return <DebugParamsModalMain key={key} {...props} isOpen={isOpen} />;
};

const DebugParamsModalMain = ({ isOpen, onClose }: DebugParamsModalProps) => {
  // remount(useRemountOnOpen)+ enabled:isOpen + staleTime 0 で、開くたびに再取得される。
  const debugParamsQuery = $api.useQuery(
    'get',
    '/api/private/debug/debugParams',
    {},
    { enabled: isOpen, meta: { askRetryOnServerError: true } }
  );

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>デバッグパラメータ設定</DialogTitle>
        </DialogHeader>
        {/*
          取得完了までフォームをマウントしない。effect で form.reset() して後から
          同期する形にすると、(a) 取得完了が入力より後になったときに入力を消す
          (b) remount 直後の reset がフォーム初期化に上書きされて空欄になる、
          という 2 つの競合を踏む。取得値をそのまま defaultValues にすれば起きない。
        */}
        {debugParamsQuery.data && (
          <DebugParamsForm
            initialVirtualDate={debugParamsQuery.data.virtualDate}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

const DebugParamsForm = ({
  initialVirtualDate,
  onClose,
}: {
  initialVirtualDate: string;
  onClose: () => void;
}) => {
  const queryClient = useQueryClient();

  // 保存成功後は invalidate で最新値を再取得する(手動二度目 GET を置換)。
  const postDebugParams = $api.useMutation(
    'post',
    '/api/private/debug/debugParams',
    {
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: ['get', '/api/private/debug/debugParams'],
        }),
    }
  );

  const { control, handleSubmit, reset } = useForm<FormData>({
    defaultValues: { virtualDate: initialVirtualDate },
    resolver: zodResolver(formSchema),
    mode: 'onChange',
  });

  // formState は useForm() の戻り値から読まず、フックで購読する(Compiler 対応)
  const { isDirty, isValid } = useFormState({ control });
  const { field } = useController({ name: 'virtualDate', control });

  const onSubmit = async (value: FormData) => {
    try {
      await postDebugParams.mutateAsync({ body: value });
      // 保存値を新しい既定値にして「未変更」状態へ戻す
      reset(value);
      toast.success('設定を保存しました', { duration: 3000 });
    } catch {
      // エラーはグローバル(MutationCache.onError)で処理済み
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit(onSubmit)(e);
      }}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="shrink-0 text-right">疑似日時</div>
          <div className="flex-1">
            <Input
              placeholder="YYYY-MM-DD hh:mm"
              type="text"
              value={field.value}
              onBlur={field.onBlur}
              onChange={(e) => field.onChange(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onClose();
            }}
          >
            閉じる
          </Button>
          <Button type="submit" disabled={!isValid || !isDirty}>
            適用
          </Button>
        </DialogFooter>
      </div>
    </form>
  );
};
