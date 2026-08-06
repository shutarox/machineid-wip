import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { $api } from '@/libs/api';
import { useQueryClient } from '@tanstack/react-query';

import * as Config from '@/config';
import * as Stores from '@/stores';
import * as Jotai from 'jotai';
import { MenuIcon, SearchIcon } from 'lucide-react';
import React from 'react';
import * as Router from 'react-router-dom';

import { DebugParamsModal } from './debug/DebugParamsModal';

type TitleHandleMatch = {
  handle?: {
    title?: string;
  };
};

export const CommonHeader: React.FC = () => {
  const loginUser = Jotai.useAtomValue(Stores.loginUserAtom);
  const setLogout = Jotai.useSetAtom(Stores.logoutAtom);
  const setTenantConfig = Jotai.useSetAtom(Stores.tenantConfigAtom);
  const navigate = Router.useNavigate();
  const queryClient = useQueryClient();

  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);
  const [isOpenDebugParamsModal, setIsOpenDebugParamsModal] =
    React.useState(false);

  // master 取得。queryKey に loginUser は入らないため、ユーザ切替時の再取得は
  // debug/changeUser 側の全 invalidate で担保する。
  const masterQuery = $api.useQuery(
    'get',
    '/api/private/master',
    {},
    { enabled: !!loginUser, meta: { askRetryOnServerError: true } }
  );

  React.useEffect(() => {
    if (masterQuery.data) {
      setTenantConfig(masterQuery.data.tenantConfig);
    }
  }, [masterQuery.data, setTenantConfig]);

  const matches = Router.useMatches() as TitleHandleMatch[];
  const currentTitle =
    matches.find((match) => match.handle?.title)?.handle?.title ?? 'MachineId';

  const logoutMutation = $api.useMutation('post', '/api/private/logout', {
    onSuccess: () => {
      setLogout();
      // キャッシュに残る前ユーザのデータを破棄する(現行はキャッシュ自体がない)
      void queryClient.removeQueries();
      void navigate('/');
    },
  });

  const logout = () => logoutMutation.mutate({});

  const drawerLinkClass =
    'flex h-10 w-full items-center px-5 hover:bg-muted hover:font-bold active:bg-accent active:font-bold';

  return (
    <>
      <header className="fixed top-0 z-10 flex h-12.5 w-full items-center gap-1 bg-teal-700 px-1.5 text-white">
        <Button
          variant="ghost"
          size="icon"
          aria-label="メニュー"
          className="hover:bg-teal-600 hover:text-white"
          onClick={() => {
            if (loginUser) {
              setIsDrawerOpen(true);
            } else {
              void navigate('/');
            }
          }}
        >
          <MenuIcon />
        </Button>
        <h1 className="text-base font-bold">{currentTitle}</h1>

        <div className="flex-1" />

        {Config.ENABLE_DEBUG_MODE && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="接続元情報"
            className="opacity-30 hover:bg-teal-600 hover:text-white"
            onClick={() => {
              void navigate('/debug/remoteIp');
            }}
          >
            <SearchIcon />
          </Button>
        )}

        {loginUser && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  className="gap-4 hover:bg-teal-600 hover:text-white"
                >
                  {loginUser.user.name}
                  <Avatar className="size-8">
                    <AvatarImage src="/icons/icon-user.svg" alt="" />
                    <AvatarFallback>
                      {loginUser.user.name.slice(0, 1)}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuItem onClick={logout}>ログアウト</DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  void navigate('/passwordChange');
                }}
              >
                パスワード変更
              </DropdownMenuItem>
              {Config.ENABLE_DEBUG_MODE && (
                <>
                  <DropdownMenuItem
                    onClick={() => {
                      void navigate('/debug/users');
                    }}
                  >
                    ユーザ変更 (debug)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setIsOpenDebugParamsModal(true);
                    }}
                  >
                    パラメータ設定 (debug)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      void navigate('/debug/remoteIp');
                    }}
                  >
                    接続元情報 (debug)
                  </DropdownMenuItem>
                  {/* memory router のため URL 直打ちでは到達できない。導線はここだけ */}
                  <DropdownMenuItem
                    onClick={() => {
                      void navigate('/debug/test');
                    }}
                  >
                    動作テスト (debug)
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>
      {/* fixed ヘッダ分の余白 */}
      <div className="h-12.5" />

      <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <SheetContent side="left" className="w-80">
          <SheetHeader>
            <SheetTitle className="sr-only">メニュー</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col items-stretch">
            <Router.NavLink
              className={drawerLinkClass}
              to="/"
              onClick={() => setIsDrawerOpen(false)}
            >
              ホーム
            </Router.NavLink>
            <Router.NavLink
              className={drawerLinkClass}
              to="/reports"
              onClick={() => setIsDrawerOpen(false)}
            >
              報告書
            </Router.NavLink>
            {loginUser?.user.role === 'ADMIN' && (
              <Router.NavLink
                className={drawerLinkClass}
                to="/users"
                onClick={() => setIsDrawerOpen(false)}
              >
                ユーザ管理
              </Router.NavLink>
            )}
          </nav>
        </SheetContent>
      </Sheet>

      <DebugParamsModal
        isOpen={isOpenDebugParamsModal}
        onClose={() => setIsOpenDebugParamsModal(false)}
      />
    </>
  );
};
