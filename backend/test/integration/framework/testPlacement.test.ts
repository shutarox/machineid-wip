import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// ルートテストの配置規約の機械的検証。
// test/integration/routes/ 配下のテストは、src/routes/ とディレクトリ階層・
// ファイル名とも 1:1 対応でなければならない
// (例: test/integration/routes/api/private/users.GET.test.ts
//   → src/routes/api/private/users.GET.ts が存在すること)
// `_` 始まりのファイルは共通ヘルパーとして対象外

const backendDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
);
const routesTestDir = path.join(backendDir, 'test/integration/routes');
const routesSrcDir = path.join(backendDir, 'src/routes');

const collectTestFiles = (dir: string): string[] => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    if (entry.name.startsWith('_')) {
      return [];
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectTestFiles(full);
    }
    return entry.name.endsWith('.test.ts') ? [full] : [];
  });
};

describe('ルートテストの配置規約', () => {
  it('各ルートテストは src/routes の同一相対パスに対応する実装を持つ', () => {
    const violations: string[] = [];
    for (const testFile of collectTestFiles(routesTestDir)) {
      const relative = path.relative(routesTestDir, testFile);
      const srcFile = path.join(
        routesSrcDir,
        relative.replace(/\.test\.ts$/, '.ts')
      );
      if (!fs.existsSync(srcFile)) {
        violations.push(
          `${path.relative(backendDir, testFile)} に対応する src/routes/${relative.replace(/\.test\.ts$/, '.ts')} がありません`
        );
      }
    }
    expect(violations).toEqual([]);
  });
});
