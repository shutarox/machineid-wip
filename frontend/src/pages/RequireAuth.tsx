import * as Stores from '@/stores';
import { useAtomValue } from 'jotai';
import * as Router from 'react-router-dom';

export const RequireAuth = () => {
  const loginUser = useAtomValue(Stores.loginUserAtom);
  if (!loginUser) {
    return <Router.Navigate to="/login" replace />;
  }
  return <Router.Outlet />;
};
