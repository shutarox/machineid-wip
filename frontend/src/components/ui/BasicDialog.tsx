import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Spinner } from '@/components/ui/spinner';
import { useRemountOnOpen } from '@/libs/useRemountOpen';
import { cn } from '@/libs/utils';
import React from 'react';

// アプリ共通の確認ダイアログ。外側クリックでは閉じない alert-dialog 系を使う
// (ApiRetryDialog / ReloadAppDialog のように、ユーザの選択が必要な場面で使う想定)。

type BasicDialogProps = {
  isOpen: boolean;
  title?: string;
  mode?: 'confirm' | 'danger';
  button1Text?: string;
  button2Text?: string;
  button1Disabled?: boolean;
  button2Disabled?: boolean;
  button2Loading?: boolean;
  button2Hidden?: boolean;
  onButton1?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onButton2?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onClose: () => void;
  children: React.ReactNode;
};

export const BasicDialog = (props: BasicDialogProps) => {
  const { key, isOpen } = useRemountOnOpen(props.isOpen);
  return <BasicDialogMain key={key} {...props} isOpen={isOpen} />;
};

const BasicDialogMain = ({
  isOpen,
  mode = 'confirm',
  title = '',
  button1Text = 'キャンセル',
  button2Text = 'OK',
  button1Disabled = false,
  button2Disabled = false,
  button2Loading = false,
  button2Hidden = false,
  onButton1 = () => {},
  onButton2 = () => {},
  onClose,
  children,
}: BasicDialogProps) => {
  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
        </AlertDialogHeader>
        <div className="flex flex-col items-start gap-3">{children}</div>
        <AlertDialogFooter>
          <AlertDialogCancel
            className="min-w-40"
            disabled={button1Disabled}
            onClick={(e) => {
              onButton1(e);
              onClose();
            }}
          >
            {button1Text}
          </AlertDialogCancel>
          {!button2Hidden && (
            <AlertDialogAction
              className={cn(
                'min-w-40',
                mode === 'danger' &&
                  'bg-destructive text-white hover:bg-destructive/90'
              )}
              disabled={button2Disabled || button2Loading}
              onClick={(e) => {
                onButton2(e);
                onClose();
              }}
            >
              {button2Loading && <Spinner />}
              {button2Text}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
