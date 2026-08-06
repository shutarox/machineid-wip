import * as Stores from '@/stores';
import { useAtomValue } from 'jotai';

export const Home = () => {
  const loginUser = useAtomValue(Stores.loginUserAtom);

  return (
    <div className="p-8">
      <h2 className="mb-4 text-lg font-bold">ホーム</h2>
      <p>{loginUser ? `${loginUser.user.name} としてログイン中` : ''}</p>
    </div>
  );
};
