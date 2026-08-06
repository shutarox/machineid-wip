import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { $api } from '@/libs/api';
import { keepPreviousData, useQueryClient } from '@tanstack/react-query';
import React from 'react';
import * as Router from 'react-router-dom';
import { toast } from 'sonner';

// 報告書の一覧。**ロールで見える行が変わる**リソースの画面側の見本。
// 絞り込みはサーバ(models/reports.ts の where ビルダー)がやるので、
// 画面には「自分の分だけ表示する」ような分岐を一切書かない。

const PER_PAGE = 20;

export const Reports = () => {
  const navigate = Router.useNavigate();
  const queryClient = useQueryClient();

  const [page, setPage] = React.useState(1);
  const [deleteTargetId, setDeleteTargetId] = React.useState<string | null>(
    null
  );

  const reportsQuery = $api.useQuery(
    'get',
    '/api/private/reports',
    { params: { query: { page, perPage: PER_PAGE } } },
    { placeholderData: keepPreviousData }
  );
  const reports = reportsQuery.data?.reports ?? [];
  const total = reportsQuery.data?.total ?? 0;

  const deleteReport = $api.useMutation('delete', '/api/private/reports', {
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['get', '/api/private/reports'],
      }),
  });

  const handleDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await deleteReport.mutateAsync({
        params: { query: { id: deleteTargetId } },
      });
      toast.success('報告書を削除しました', { duration: 2000 });
      setDeleteTargetId(null);
    } catch {
      // グローバル処理済み(queryClient.ts の MutationCache.onError)
    }
  };

  const maxPage = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-lg font-bold">報告書</h2>
        <div className="flex-1" />
        <Button onClick={() => void navigate('/reports/new')}>報告書を送信</Button>
      </div>

      {reports.length === 0 ? (
        <p className="text-muted-foreground py-10 text-center text-sm">
          報告書はまだありません
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {reports.map((report) => (
            <li key={report.id} className="rounded-md border p-4">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <div className="font-bold">{report.title}</div>
                  <div className="text-muted-foreground text-xs">
                    {report.userName} /{' '}
                    {new Date(report.createdAt).toLocaleString('ja-JP')}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`${report.title} を削除`}
                  onClick={() => setDeleteTargetId(report.id)}
                >
                  削除
                </Button>
              </div>

              <p className="mt-2 whitespace-pre-wrap text-sm">{report.comment}</p>

              <div className="mt-3 flex flex-wrap gap-2">
                {report.images.map((image) => (
                  <img
                    key={image.id}
                    src={image.thumbnailUrl}
                    alt={`${report.title} の添付画像`}
                    className="h-24 w-24 rounded-sm border object-cover"
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-center justify-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
        >
          前へ
        </Button>
        <span className="text-sm">
          {page} / {maxPage} ページ(全 {total} 件)
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
          disabled={page >= maxPage}
        >
          次へ
        </Button>
      </div>

      <AlertDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>報告書を削除しますか</AlertDialogTitle>
            <AlertDialogDescription>
              添付した画像も一緒に削除されます。この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()}>
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
