import { resolveCookieDomain } from '@/libs/cookieDomain.js';

import { describe, expect, it } from 'vitest';

describe('resolveCookieDomain', () => {
  it('COOKIE_DOMAIN が明示されていればそれを使う', () => {
    expect(
      resolveCookieDomain({
        cookieDomainEnv: 'example.com',
        apiServerBaseUrl: 'https://api.other.example',
        isLocalDevelopment: false,
      })
    ).toBe('example.com');
  });

  it('COOKIE_DOMAIN が無ければ API_SERVER_BASE_URL から解決する', () => {
    expect(
      resolveCookieDomain({
        cookieDomainEnv: undefined,
        apiServerBaseUrl: 'https://api.example.com',
        isLocalDevelopment: false,
      })
    ).toBe('example.com');
  });

  it('ローカル開発では解決できなくても null を返す(HTTP 開発のための分岐)', () => {
    expect(
      resolveCookieDomain({
        cookieDomainEnv: undefined,
        apiServerBaseUrl: 'http://localhost:8080',
        isLocalDevelopment: true,
      })
    ).toBeNull();
  });

  it('ローカル開発以外で解決できなければ throw する(secure が黙って外れるのを防ぐ)', () => {
    expect(() =>
      resolveCookieDomain({
        cookieDomainEnv: undefined,
        apiServerBaseUrl: 'http://localhost:8080',
        isLocalDevelopment: false,
      })
    ).toThrow(/domain を解決できません/);
  });

  it('ローカル開発以外で IP アドレス指定なら throw する', () => {
    expect(() =>
      resolveCookieDomain({
        cookieDomainEnv: undefined,
        apiServerBaseUrl: 'https://192.0.2.10:8080',
        isLocalDevelopment: false,
      })
    ).toThrow(/domain を解決できません/);
  });

  it('COOKIE_DOMAIN が空文字なら throw する(未設定と同じ扱い)', () => {
    expect(() =>
      resolveCookieDomain({
        cookieDomainEnv: '',
        apiServerBaseUrl: 'https://api.example.com',
        isLocalDevelopment: false,
      })
    ).toThrow(/domain を解決できません/);
  });
});
