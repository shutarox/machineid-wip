import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

// shadcn 生成物からの逸脱: テンプレートは next-themes の useTheme() でテーマを解決するが、
// 本アプリはダークモード切替を持たない Vite アプリなので依存ごと外して固定している。
// ダークモードを導入する場合はここでテーマを渡す。
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      // 型ごとに配色を変える(error=赤 / success=緑 / warning=橙 / info=青)。
      // これを外すと全種類が --normal-* の同一配色になり、アイコンでしか区別できない。
      richColors
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'cn-toast',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
