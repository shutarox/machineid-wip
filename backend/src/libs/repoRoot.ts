import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// リポジトリルート(pnpm-workspace.yaml のあるディレクトリ)を上方探索で解決する。
// チェックアウト位置に依存しないパス解決のために、絶対パスのリテラルではなく
// 必ずこのヘルパーを経由すること。

let cached: string | undefined;

export const repoRoot = (): string => {
  if (cached) {
    return cached;
  }
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      cached = dir;
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error('pnpm-workspace.yaml が見つかりません(リポジトリ外で実行されています)');
    }
    dir = parent;
  }
};
