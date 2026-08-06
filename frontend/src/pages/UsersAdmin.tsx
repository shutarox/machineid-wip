import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { $api } from '@/libs/api';
import { keepPreviousData, useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { toast } from 'sonner';

// users CRUD の参照実装ページ。route → $api フック → 画面、の見本。
// 入力が数個の単純なダイアログなので、フォームライブラリは使わず素の state で扱う
// (react-hook-form の見本は Login / PasswordChange / PasswordReset / DebugParamsModal 側にある)。

type User = {
  id: string;
  userName: string;
  loginId: string;
  email: string;
  role: 'ADMIN' | 'MEMBER';
  isDisabled: boolean;
};

const PER_PAGE = 20;

const ROLE_LABELS: Record<User['role'], string> = {
  ADMIN: '管理者',
  MEMBER: 'メンバー',
};

export const UsersAdmin = () => {
  const queryClient = useQueryClient();

  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [searchInput, setSearchInput] = React.useState('');

  // 作成ダイアログ
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [newUserName, setNewUserName] = React.useState('');
  const [newLoginId, setNewLoginId] = React.useState('');
  const [newEmail, setNewEmail] = React.useState('');
  const [newRole, setNewRole] = React.useState<User['role']>('MEMBER');
  const [initialPassword, setInitialPassword] = React.useState('');

  // 編集ダイアログ
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<User | null>(null);
  const [editUserName, setEditUserName] = React.useState('');
  const [editEmail, setEditEmail] = React.useState('');

  // 取得: page/search を init に入れることで、変更時に queryKey が変わり自動再取得される。
  // placeholderData で取得完了まで旧リストを表示し続ける(現行の state 保持と同じ表示)。
  const usersQuery = $api.useQuery(
    'get',
    '/api/private/users',
    { params: { query: { page, perPage: PER_PAGE, search } } },
    { placeholderData: keepPreviousData }
  );
  const users = usersQuery.data?.users ?? [];
  const total = usersQuery.data?.total ?? 0;

  // 更新系は該当 queryKey を invalidate する(手動 reload 配線を宣言的に置換)。
  const invalidateUsers = () =>
    queryClient.invalidateQueries({ queryKey: ['get', '/api/private/users'] });

  const postUser = $api.useMutation('post', '/api/private/users', {
    onSuccess: invalidateUsers,
  });
  const patchUser = $api.useMutation('patch', '/api/private/users', {
    onSuccess: invalidateUsers,
  });

  // mutation はエラー時に reject するが、副次処理(トースト等)は MutationCache.onError で
  // グローバル処理済みのため、ここでは成功時の後処理だけ書き catch は握りつぶす。
  const handleCreate = async () => {
    try {
      const data = await postUser.mutateAsync({
        body: {
          userName: newUserName,
          loginId: newLoginId,
          email: newEmail,
          role: newRole,
        },
      });
      setInitialPassword(data.initialPassword);
    } catch {
      // グローバル処理済み
    }
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    try {
      await patchUser.mutateAsync({
        body: { id: editTarget.id, userName: editUserName, email: editEmail },
      });
      toast.success('保存しました', { duration: 2000 });
      setIsEditOpen(false);
    } catch {
      // グローバル処理済み
    }
  };

  // 投げっぱなし系(成功後の逐次処理なし)は .mutate() で済ませる。
  // 再取得は onSuccess の invalidateUsers、エラーは MutationCache.onError が担う。
  const handleRoleChange = (user: User, role: User['role']) => {
    patchUser.mutate({ body: { id: user.id, role } });
  };

  const handleToggleDisabled = (user: User) => {
    patchUser.mutate({ body: { id: user.id, isDisabled: !user.isDisabled } });
  };

  const openCreate = () => {
    setNewUserName('');
    setNewLoginId('');
    setNewEmail('');
    setNewRole('MEMBER');
    setInitialPassword('');
    setIsCreateOpen(true);
  };

  const openEdit = (user: User) => {
    setEditTarget(user);
    setEditUserName(user.userName);
    setEditEmail(user.email);
    setIsEditOpen(true);
  };

  const maxPage = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-2">
        <Input
          placeholder="名前・ログインID・メールで検索"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setPage(1);
              setSearch(searchInput);
            }
          }}
          className="max-w-90"
        />
        <Button
          variant="outline"
          onClick={() => {
            setPage(1);
            setSearch(searchInput);
          }}
        >
          検索
        </Button>
        <div className="flex-1" />
        <Button onClick={openCreate}>ユーザ追加</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>名前</TableHead>
            <TableHead>ログインID</TableHead>
            <TableHead>メール</TableHead>
            <TableHead>ロール</TableHead>
            <TableHead>状態</TableHead>
            <TableHead>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow
              key={user.id}
              className={user.isDisabled ? 'opacity-50' : ''}
            >
              <TableCell>{user.userName}</TableCell>
              <TableCell>{user.loginId}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                <Select
                  value={user.role}
                  onValueChange={(value) =>
                    handleRoleChange(user, value as User['role'])
                  }
                >
                  <SelectTrigger
                    className="w-35"
                    aria-label={`${user.userName} のロール`}
                  >
                    <SelectValue>
                      {(value: User['role']) => ROLE_LABELS[value]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>{user.isDisabled ? '無効' : '有効'}</TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEdit(user)}
                  >
                    編集
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleToggleDisabled(user)}
                  >
                    {user.isDisabled ? '有効化' : '無効化'}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

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

      {/* 作成ダイアログ */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ユーザ追加</DialogTitle>
          </DialogHeader>
          {initialPassword ? (
            <Alert>
              <AlertTitle>ユーザを作成しました</AlertTitle>
              <AlertDescription>
                <div>
                  初期パスワード: <b>{initialPassword}</b>
                </div>
                <div>(この画面を閉じると再表示できません)</div>
              </AlertDescription>
            </Alert>
          ) : (
            <div className="flex flex-col gap-3">
              <Input
                placeholder="名前"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
              />
              <Input
                placeholder="ログインID"
                value={newLoginId}
                onChange={(e) => setNewLoginId(e.target.value)}
              />
              <Input
                placeholder="メールアドレス(任意)"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
              <Select
                value={newRole}
                onValueChange={(value) => setNewRole(value as User['role'])}
              >
                <SelectTrigger aria-label="ロール">
                  <SelectValue>
                    {(value: User['role']) => ROLE_LABELS[value]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              閉じる
            </Button>
            {!initialPassword && (
              <Button
                onClick={() => void handleCreate()}
                disabled={!newUserName || !newLoginId}
              >
                作成
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 編集ダイアログ */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ユーザ編集</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Input
              placeholder="名前"
              value={editUserName}
              onChange={(e) => setEditUserName(e.target.value)}
            />
            <Input
              placeholder="メールアドレス"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              キャンセル
            </Button>
            <Button
              onClick={() => void handleEditSave()}
              disabled={!editUserName}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
