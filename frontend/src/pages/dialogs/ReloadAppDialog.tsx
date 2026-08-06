import { BasicDialog } from '@/components/ui/BasicDialog';
import * as Stores from '@/stores';
import * as Jotai from 'jotai';
import * as React from 'react';

export const ReloadAppDialog: React.FC = () => {
  const [isOpenReloadAppDialog, setIsOpenReloadAppDialog] = Jotai.useAtom(
    Stores.isOpenReloadAppDialogAtom
  );

  const handleCancel = () => {
    setIsOpenReloadAppDialog(false);
  };

  return (
    <BasicDialog
      isOpen={isOpenReloadAppDialog}
      onClose={handleCancel}
      title="アプリの更新"
      mode="confirm"
      button1Text="キャンセル"
      button2Text="更新する"
      onButton1={() => setIsOpenReloadAppDialog(false)}
      onButton2={() =>
        (window.location.search += `${window.location.search ? '&' : '?'}reload=${Date.now()}`)
      }
    >
      <p>最新のバージョンのアプリに再読み込みする必要があります</p>
    </BasicDialog>
  );
};
