import { describe, expect, it } from 'vitest';
import { validateIpAddress } from './validateIpAddress.js';

describe('validateIpAddress', () => {
  it('単一 IP の一致・不一致', () => {
    expect(
      validateIpAddress({ ipAddress: '10.0.0.1', expression: '10.0.0.1' })
    ).toBe(true);
    expect(
      validateIpAddress({ ipAddress: '10.0.0.2', expression: '10.0.0.1' })
    ).toBe(false);
  });

  it('カンマ区切りの複数指定', () => {
    expect(
      validateIpAddress({
        ipAddress: '192.168.1.5',
        expression: '10.0.0.1,192.168.1.5',
      })
    ).toBe(true);
  });

  it('範囲指定(オクテットの n-m)', () => {
    expect(
      validateIpAddress({
        ipAddress: '192.168.1.5',
        expression: '192.168.1.0-10',
      })
    ).toBe(true);
    expect(
      validateIpAddress({
        ipAddress: '192.168.1.11',
        expression: '192.168.1.0-10',
      })
    ).toBe(false);
  });

  it('CIDR 形式', () => {
    expect(
      validateIpAddress({ ipAddress: '10.0.0.7', expression: '10.0.0.0/24' })
    ).toBe(true);
    expect(
      validateIpAddress({ ipAddress: '10.0.1.7', expression: '10.0.0.0/24' })
    ).toBe(false);
    expect(
      validateIpAddress({ ipAddress: '203.0.113.9', expression: '0.0.0.0/0' })
    ).toBe(true);
  });

  it('不正な入力 IP は例外', () => {
    expect(() =>
      validateIpAddress({ ipAddress: 'not-an-ip', expression: '0.0.0.0/0' })
    ).toThrow();
    expect(() =>
      validateIpAddress({ ipAddress: '1.2.3.999', expression: '0.0.0.0/0' })
    ).toThrow();
  });
});
