import { describe, expect, it } from 'vitest';
import { buildUserSearchWhere, validateUserPatch } from './users.js';

describe('buildUserSearchWhere', () => {
  it('検索語なしなら tenantId のみ', () => {
    expect(buildUserSearchWhere('t1', undefined)).toEqual({ tenantId: 't1' });
    expect(buildUserSearchWhere('t1', '')).toEqual({ tenantId: 't1' });
  });

  it('検索語ありなら 名前・ログインID・メール の OR 条件', () => {
    expect(buildUserSearchWhere('t1', '太郎')).toEqual({
      tenantId: 't1',
      OR: [
        { userName: { contains: '太郎' } },
        { loginId: { contains: '太郎' } },
        { email: { contains: '太郎' } },
      ],
    });
  });
});

describe('validateUserPatch', () => {
  it('他人への変更はロール変更・無効化とも許可', () => {
    expect(
      validateUserPatch({
        actorId: 'a',
        targetId: 'b',
        patch: { role: 'ADMIN', isDisabled: true },
      })
    ).toBeNull();
  });

  it('自分自身のロール変更は拒否', () => {
    expect(
      validateUserPatch({ actorId: 'a', targetId: 'a', patch: { role: 'MEMBER' } })
    ).toMatch(/ロール/);
  });

  it('自分自身の無効化は拒否', () => {
    expect(
      validateUserPatch({
        actorId: 'a',
        targetId: 'a',
        patch: { isDisabled: true },
      })
    ).toMatch(/無効化/);
  });

  it('自分自身でもロール・無効化以外(名前等のみ)は許可', () => {
    expect(
      validateUserPatch({ actorId: 'a', targetId: 'a', patch: {} })
    ).toBeNull();
    expect(
      validateUserPatch({
        actorId: 'a',
        targetId: 'a',
        patch: { isDisabled: false },
      })
    ).toBeNull();
  });
});
