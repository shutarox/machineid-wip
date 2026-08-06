import { describe, expect, it } from 'vitest';
import { buildReportListWhere, validateImageIds } from './reports.js';

// 可視範囲の判断はここ(純粋関数)に寄せてあるので、ロールごとの分岐は
// DB を立てずにここで押さえる。実際に 404 が返ることは統合テストで見る

describe('buildReportListWhere', () => {
  it('ADMIN はテナント内全員が見える', () => {
    expect(
      buildReportListWhere('tenant-1', { role: 'ADMIN', id: 'user-1' })
    ).toEqual({ tenantId: 'tenant-1' });
  });

  it('MEMBER は自分が作ったものだけ', () => {
    expect(
      buildReportListWhere('tenant-1', { role: 'MEMBER', id: 'user-1' })
    ).toEqual({ tenantId: 'tenant-1', userId: 'user-1' });
  });

  it('どのロールでも tenantId は必ず入る', () => {
    for (const role of ['ADMIN', 'MEMBER'] as const) {
      const where = buildReportListWhere('tenant-1', { role, id: 'user-1' });
      expect(where.tenantId).toBe('tenant-1');
    }
  });
});

describe('validateImageIds', () => {
  it('1 枚以上あれば通る', () => {
    expect(validateImageIds(['a'])).toBeNull();
  });

  it('0 枚は拒否する', () => {
    expect(validateImageIds([])).toBe('画像を 1 枚以上添付してください');
  });

  it('上限を超えたら拒否する', () => {
    const ids = Array.from({ length: 11 }, (_, i) => `image-${i}`);
    expect(validateImageIds(ids)).toBe('画像は 10 枚までです');
  });

  it('上限ちょうどは通る', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `image-${i}`);
    expect(validateImageIds(ids)).toBeNull();
  });

  it('重複を拒否する', () => {
    expect(validateImageIds(['a', 'a'])).toBe(
      '同じ画像が重複して指定されています'
    );
  });
});
