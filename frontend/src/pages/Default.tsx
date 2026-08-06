import * as Stores from '@/stores';
import { useAtomValue } from 'jotai';
import * as Router from 'react-router-dom';

export const Default = () => {
  const loginUser = useAtomValue(Stores.loginUserAtom);
  if (loginUser) {
    return <Router.Navigate to="/home" replace />;
  }
  return <Router.Navigate to="/login" replace />;
};
