import { describe, expect, it } from 'vitest';
import { zDateIn } from './zDate.js';

describe('zDateIn', () => {
  it('オフセット付き ISO 日時文字列を Date に変換する', () => {
    const date = zDateIn().parse('2026-07-13T10:30:00+09:00');
    expect(date).toBeInstanceOf(Date);
    expect(date.toISOString()).toBe('2026-07-13T01:30:00.000Z');
  });

  it('Z(UTC)指定も明示オフセットとして受理する', () => {
    const date = zDateIn().parse('2026-07-13T01:30:00Z');
    expect(date.toISOString()).toBe('2026-07-13T01:30:00.000Z');
  });

  it('ミリ秒付きも受理する', () => {
    const date = zDateIn().parse('2026-07-13T10:30:00.123+09:00');
    expect(date.toISOString()).toBe('2026-07-13T01:30:00.123Z');
  });

  it('日付のみの文字列は JST の 0 時と解釈する', () => {
    const date = zDateIn().parse('2026-07-13');
    expect(date.toISOString()).toBe('2026-07-12T15:00:00.000Z');
  });

  it('オフセットなしの日時文字列は受理しない', () => {
    expect(() => zDateIn().parse('2026-07-13T10:30:00')).toThrow();
  });

  it('スラッシュ区切りの日付は受理しない', () => {
    expect(() => zDateIn().parse('2026/07/13')).toThrow();
  });

  it('日時として不正な文字列は受理しない', () => {
    expect(() => zDateIn().parse('not-a-date')).toThrow();
    expect(() => zDateIn().parse('')).toThrow();
  });

  it('文字列以外は受理しない', () => {
    expect(() => zDateIn().parse(new Date())).toThrow();
    expect(() => zDateIn().parse(1752380000000)).toThrow();
  });
});
