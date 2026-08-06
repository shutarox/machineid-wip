import './index.css';

import { CommonHeader } from '@/pages/CommonHeader';
import { Default } from '@/pages/Default';
import { Home } from '@/pages/Home';
import { RequireAuth } from '@/pages/RequireAuth';
import { Login } from '@/pages/Login';
import { GlobalSpinner } from '@/components/ui/GlobalSpinner';
import { Toaster } from '@/components/ui/sonner';

import { PasswordChange } from '@/pages/PasswordChange';
import { PasswordReset } from '@/pages/PasswordReset';
import { ApiRetryDialog } from '@/pages/dialogs/ApiRetryDialog';
import { ReloadAppDialog } from '@/pages/dialogs/ReloadAppDialog';
import { ErrorBoundary } from 'react-error-boundary';
import * as Router from 'react-router-dom';

import { RemoteIp } from '@/pages/debug/RemoteIp';
import { Test as DebugTest } from '@/pages/debug/Test';
import { Users as DebugUsers } from '@/pages/debug/Users';
import { ReportNew } from '@/pages/ReportNew';
import { Reports } from '@/pages/Reports';
import { UsersAdmin } from '@/pages/UsersAdmin';

import { HistoryBackHandler } from '@/components/ui/HistoryBackHandler';
import { queryClient } from '@/libs/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';

const router = Router.createMemoryRouter(
  Router.createRoutesFromElements(
    <Router.Route
      element={
        <ErrorBoundary fallback={<div>システムエラーが発生しました</div>}>
          <CommonHeader />
          <HistoryBackHandler />
          <Router.Outlet />
        </ErrorBoundary>
      }
    >
      <Router.Route path="/" element={<Default />} />

      <Router.Route element={<RequireAuth />}>
        <Router.Route
          path="/home"
          element={<Home />}
          handle={{ title: 'ホーム' }}
        />
        <Router.Route path="/debug">
          <Router.Route
            path="users"
            element={<DebugUsers />}
            handle={{ title: 'ユーザ変更 (debug 機能)' }}
          />
        </Router.Route>
        <Router.Route
          path="/users"
          element={<UsersAdmin />}
          handle={{ title: 'ユーザ管理' }}
        />
        <Router.Route
          path="/reports"
          element={<Reports />}
          handle={{ title: '報告書' }}
        />
        <Router.Route
          path="/reports/new"
          element={<ReportNew />}
          handle={{ title: '報告書の送信' }}
        />
        <Router.Route
          path="/passwordChange"
          element={<PasswordChange />}
          handle={{ title: 'パスワード変更' }}
        />
      </Router.Route>

      <Router.Route
        path="/login"
        element={<Login />}
        handle={{ title: 'ログイン' }}
      />
      <Router.Route
        path="/passwordReset"
        element={<PasswordReset />}
        handle={{ title: 'パスワード設定' }}
      />
      <Router.Route
        path="/debug/remoteIp"
        element={<RemoteIp />}
        handle={{ title: '接続元情報' }}
      />
      <Router.Route
        path="/debug/test"
        element={<DebugTest />}
        handle={{ title: '動作テスト (debug 機能)' }}
      />

      <Router.Route path="*" element={<Router.Navigate to="/" />} />
    </Router.Route>
  )
);

export const App = () => {
  // QueryClientProvider は GlobalSpinner(useIsFetching)より外側に置く
  return (
    <QueryClientProvider client={queryClient}>
      <Router.RouterProvider router={router} />
      <GlobalSpinner />
      <ApiRetryDialog />
      <ReloadAppDialog />
      <Toaster />
    </QueryClientProvider>
  );
};
