import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { repoRoot } from '@/libs/repoRoot.js';

// CI のジョブ分割が `pnpm verify` と同等であることの機械的検証。
//
// CI は `pnpm verify` を丸ごと呼ばず、matrix で段階ごとの並列ジョブに分割している。
// そのため **verify に段階を足しても CI は自動では拾わない**(ドリフト)。
// ここで「matrix.stage の集合 == verify が呼ぶ段階の集合」を固定することで、
// 片方だけ変えた変更を落とす。
//
// yaml パーサは backend の依存に宣言されていない(hoist で解決できてしまうが
// それ自体が docs/known-issues.md の既知問題)ため、matrix ブロックだけを
// 正規表現で読む。

const workflowPath = path.join(repoRoot(), '.github/workflows/ci.yml');
const rootPackageJsonPath = path.join(repoRoot(), 'package.json');

/** package.json の scripts.verify から `pnpm <段階>` を順に取り出す */
const verifyStages = (): string[] => {
  const pkg = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf8')) as {
    scripts: Record<string, string>;
  };
  const verify = pkg.scripts.verify;
  if (!verify) {
    throw new Error('root package.json に scripts.verify が必要');
  }

  return [...verify.matchAll(/pnpm\s+([a-z0-9:_-]+)/g)].map((m) => m[1]!);
};

/** ci.yml の matrix.stage: [...] を取り出す */
const matrixStages = (): string[] => {
  const yaml = fs.readFileSync(workflowPath, 'utf8');
  const m = /^\s*stage:\s*\[([^\]]*)\]\s*$/m.exec(yaml);
  expect(m, 'ci.yml に `stage: [...]` の matrix が必要').not.toBeNull();

  return m![1]!
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

describe('CI のジョブ分割', () => {
  it('matrix.stage が pnpm verify の段階と完全に一致する', () => {
    // 順序は問わない(並列実行なので意味を持たない)
    expect([...matrixStages()].sort()).toEqual([...verifyStages()].sort());
  });

  it('各段階がルートの scripts に実在する', () => {
    const pkg = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf8')) as {
      scripts: Record<string, string>;
    };
    for (const stage of matrixStages()) {
      expect(
        pkg.scripts[stage],
        `matrix.stage の "${stage}" に対応する script が root package.json に無い`
      ).toBeTruthy();
    }
  });

  it('CI は verify を丸ごと呼んでいない(呼ぶなら分割の前提が崩れる)', () => {
    const yaml = fs.readFileSync(workflowPath, 'utf8');
    // コメント行を除いた実行行だけを見る
    const runLines = yaml
      .split('\n')
      .filter((line) => !/^\s*#/.test(line))
      .join('\n');
    expect(runLines).not.toMatch(/run:\s*pnpm verify\s*$/m);
  });
});
