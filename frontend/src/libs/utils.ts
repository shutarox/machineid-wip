import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// shadcn/ui 標準の class 合成ヘルパー。生成コンポーネントが `@/libs/utils` から import する
// (パスは components.json の aliases.utils で指定)。
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
