import * as Config from '@/config.js';
import { ServerError } from '@/libs/appError.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const CHARS_ALNUM =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const CHARS_WITH_SYMBOLS = CHARS_ALNUM + '~!@#$%^&*()-_=+[{]}|;:,<.>/?';

export const randomString = (
  length: number,
  options?: { withSymbols?: boolean }
): string => {
  let result = '';
  const chars = options?.withSymbols ? CHARS_WITH_SYMBOLS : CHARS_ALNUM;
  for (let i = 0; i < length; i++) {
    result += chars.charAt(crypto.randomInt(chars.length));
  }
  return result;
};

export const hmacSha256 = (data: string): Buffer => {
  const hmac = crypto.createHmac('sha256', Config.CRYPTO_SECRET);
  hmac.update(data);
  return hmac.digest();
};

export const hmacSha256Base64 = (data: string): string => {
  const hmac = crypto.createHmac('sha256', Config.CRYPTO_SECRET);
  hmac.update(data);
  return hmac.digest('base64').replace(/={1,2}$/, '');
};

export const passwordHashGenerate = async (
  password: string
): Promise<string> => {
  if (!password || typeof password !== 'string') {
    throw new ServerError('Password must be a non-empty string');
  }
  const saltRounds = 10; // 2^10回の反復処理（約100ms）
  const result = await bcrypt.hash(password, saltRounds);
  return result;
};

export const passwordHashValidate = async (
  hash: string,
  password: string
): Promise<boolean> => {
  if (!hash || !password) {
    return false;
  }

  try {
    return await bcrypt.compare(password, hash);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    return false;
  }
};

export const encrypt = (
  text: string,
  options?: { fixed?: boolean }
): string => {
  if (!text) return '';

  const iv = options?.fixed
    ? hmacSha256(text).subarray(0, 16) // 検索可能暗号化（決定的IV）
    : crypto.randomBytes(16); // 通常暗号化（ランダムIV）

  const cipher = crypto.createCipheriv('aes-256-cbc', Config.CRYPTO_SECRET, iv);
  const encrypted = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final(),
  ]);

  return Buffer.concat([iv, encrypted]).toString('base64');
};

export const decrypt = (encryptedBase64: string): string => {
  if (!encryptedBase64) return '';

  try {
    const combined = Buffer.from(encryptedBase64, 'base64');

    if (combined.length < 16) {
      throw new ServerError('Invalid encrypted data length');
    }

    const iv = combined.subarray(0, 16);
    const encrypted = combined.subarray(16);

    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Config.CRYPTO_SECRET,
      iv
    );
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch (error) {
    throw new ServerError(
      `Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};
