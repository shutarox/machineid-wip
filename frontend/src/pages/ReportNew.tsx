import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { $api, uploadImage, type UploadedImage } from '@/libs/api';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { useForm, useFormState } from 'react-hook-form';
import * as Router from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

// 報告書の送信フォーム。ファイルアップロードを伴うフォームの見本。
//
// 画像は**選択した時点でアップロードする**(仮アップロード = reportId が null)。
// 送信時に id をまとめて渡して確定させる。送信せずに離脱した分は
// script/cleanup_uploads.ts が 3 日後に消す。

const MAX_IMAGES = 10;

const formSchema = z.object({
  title: z
    .string()
    .min(1, 'タイトルを入力してください。')
    .max(255, 'タイトルは255文字以内で入力してください。'),
  comment: z.string().min(1, '本文を入力してください。'),
});

type FormInputs = z.infer<typeof formSchema>;

export const ReportNew = () => {
  const navigate = Router.useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // 画像はフォームの値ではなく画面の状態として持つ。RHF に載せる利点がなく
  // (入力ではなくアップロード済みリソースの一覧)、載せると reset の扱いが増えるだけ
  const [images, setImages] = React.useState<UploadedImage[]>([]);

  const { register, handleSubmit, control } = useForm<FormInputs>({
    defaultValues: { title: '', comment: '' },
    resolver: zodResolver(formSchema),
    mode: 'onChange',
  });
  // formState は useForm() から分割代入せずフックで購読する(React Compiler 対応)
  const { errors, isValid } = useFormState({ control });

  const createReport = $api.useMutation('post', '/api/private/reports');

  // アップロードは openapi-fetch の型に載らない(libs/api.ts の uploadImage 参照)ので
  // 素の useMutation で包む。MutationCache は共通なのでエラー処理は同じ経路に乗る
  const uploadMutation = useMutation({
    mutationFn: uploadImage,
    onSuccess: (uploaded) => setImages((prev) => [...prev, uploaded]),
  });

  const deleteImage = $api.useMutation('delete', '/api/private/uploadedImages');

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 同じファイルを選び直しても change が起きるように、値は毎回クリアする
    event.target.value = '';
    if (!file) return;

    if (images.length >= MAX_IMAGES) {
      toast.error(`画像は ${MAX_IMAGES} 枚までです`, { duration: 3000 });
      return;
    }
    try {
      await uploadMutation.mutateAsync(file);
    } catch {
      // グローバル処理済み
    }
  };

  const handleRemoveImage = async (id: string) => {
    try {
      await deleteImage.mutateAsync({ params: { query: { id } } });
      setImages((prev) => prev.filter((image) => image.id !== id));
    } catch {
      // グローバル処理済み
    }
  };

  const onSubmit = async (value: FormInputs) => {
    try {
      await createReport.mutateAsync({
        body: { ...value, imageIds: images.map((image) => image.id) },
      });
      await queryClient.invalidateQueries({
        queryKey: ['get', '/api/private/reports'],
      });
      toast.success('報告書を送信しました');
      void navigate('/reports');
    } catch {
      // グローバル処理済み
    }
  };

  // 画像 1 枚以上はサーバ側の必須条件(reports.POST)。ボタンの活性でも同じ条件を見る
  const canSubmit = isValid && images.length > 0;

  return (
    <div className="mx-auto my-10 max-w-150 p-6">
      <h2 className="mb-4 text-lg font-bold">報告書の送信</h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit(onSubmit)(e);
        }}
        className="flex flex-col gap-4"
      >
        <Field>
          <FieldLabel htmlFor="title">タイトル</FieldLabel>
          <Input id="title" placeholder="タイトルを入力" {...register('title')} />
          <FieldError errors={errors.title ? [errors.title] : []} />
        </Field>

        <Field>
          <FieldLabel htmlFor="comment">本文</FieldLabel>
          {/* textarea は shadcn 未生成。素の要素で足りるものは無理に shadcn 化しない */}
          <textarea
            id="comment"
            placeholder="本文を入力"
            rows={6}
            className="border-input placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:ring-1 focus-visible:outline-none"
            {...register('comment')}
          />
          <FieldError errors={errors.comment ? [errors.comment] : []} />
        </Field>

        <Field>
          <FieldLabel htmlFor="image">
            画像({images.length} / {MAX_IMAGES} 枚。1 枚以上が必須)
          </FieldLabel>
          {/* 素の input[type=file] は「ファイルを選択」ボタンが無装飾でボタンに見えない。
              shadcn に file input は無いので、file:: 疑似要素を Tailwind で直接飾る
              (button.tsx の outline バリアントに合わせた見た目) */}
          <input
            id="image"
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="border-input file:bg-background file:text-foreground hover:file:bg-accent hover:file:text-accent-foreground w-full cursor-pointer rounded-md border text-sm file:mr-3 file:cursor-pointer file:rounded-l-md file:border-0 file:border-r file:border-solid file:border-r-input file:px-4 file:py-2 file:text-sm file:font-medium disabled:cursor-not-allowed disabled:opacity-50"
            disabled={uploadMutation.isPending || images.length >= MAX_IMAGES}
            onChange={(e) => void handleFileChange(e)}
          />
        </Field>

        {images.length > 0 && (
          <ul className="flex flex-wrap gap-3">
            {images.map((image) => (
              <li key={image.id} className="flex flex-col items-center gap-1">
                <img
                  src={image.thumbnailUrl}
                  alt="添付画像のプレビュー"
                  className="h-24 w-24 rounded-sm border object-cover"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label="この画像を取り消す"
                  onClick={() => void handleRemoveImage(image.id)}
                >
                  取り消し
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={!canSubmit}>
            送信
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void navigate('/reports')}
          >
            キャンセル
          </Button>
        </div>
      </form>
    </div>
  );
};
