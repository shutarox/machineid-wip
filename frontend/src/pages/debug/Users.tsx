import { Button } from '@/components/ui/button';
import { $api } from '@/libs/api';
import * as Stores from '@/stores';
import { useQueryClient } from '@tanstack/react-query';
import * as Jotai from 'jotai';
import * as Router from 'react-router-dom';

type DebugUser = {
  id: string;
  userName: string;
  loginId: string;
  role: string;
  isDisabled: boolean;
};

export const Users = () => {
  const navigate = Router.useNavigate();
  const setLoginUser = Jotai.useSetAtom(Stores.loginUserAtom);
  const queryClient = useQueryClient();

  const usersQuery = $api.useQuery('get', '/api/private/debug/users');
  const users = usersQuery.data?.users ?? [];

  // ユーザ切替後は全 query を invalidate し、master 等が新ユーザで再取得されるようにする。
  const changeUserMutation = $api.useMutation(
    'post',
    '/api/private/debug/changeUser',
    { onSuccess: () => queryClient.invalidateQueries() }
  );

  const handleUserClick = async (user: DebugUser) => {
    try {
      const data = await changeUserMutation.mutateAsync({
        body: { userId: user.id },
      });
      setLoginUser(
        (prev) =>
          prev && {
            ...prev,
            ...data,
          }
      );
      void navigate('/');
    } catch {
      // エラーはグローバル(MutationCache.onError)で処理済み
    }
  };

  return (
    <div className="p-8">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {users.map((user) => (
          <Button
            key={user.id}
            variant="outline"
            onClick={() => void handleUserClick(user)}
            disabled={user.isDisabled}
            className="relative h-20"
          >
            <span>{user.userName}</span>
            {user.role === 'ADMIN' && (
              <span className="absolute top-2 right-2 text-xs font-normal text-muted-foreground">
                管理者
              </span>
            )}
          </Button>
        ))}
      </div>
    </div>
  );
};
