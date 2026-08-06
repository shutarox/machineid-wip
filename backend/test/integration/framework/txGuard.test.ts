import { Mail, sendMail, setMailerForTesting } from '@/libs/mailer.js';
import { nestableTransaction } from '@/libs/prisma-connection.js';
import {
  presignGetObject,
  putObject,
  removeObjects,
  setStorageForTesting,
} from '@/libs/storage.js';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryStorage } from '../../fakes.js';

// tx 内外部 I/O ガードのテスト。
// メール送信などの外部 I/O はトランザクション内では禁止(ロールバック時の
// 送りっぱなし・外部レイテンシによる tx 長期化を防ぐ)

describe('tx 内外部 I/O ガード', () => {
  afterEach(() => {
    setMailerForTesting(null);
  });

  it('tx 内の sendMail は拒否される', async () => {
    const sent: Mail[] = [];
    setMailerForTesting({
      send: async (mail) => {
        sent.push(mail);
      },
    });

    await expect(
      nestableTransaction(async () => {
        await sendMail({ to: 'a@example.com', subject: 't', text: 'b' });
      })
    ).rejects.toThrow(/トランザクション内での外部 I\/O は禁止/);
    expect(sent).toHaveLength(0);
  });

  it('tx 外の sendMail はフェイクに届く', async () => {
    const sent: Mail[] = [];
    setMailerForTesting({
      send: async (mail) => {
        sent.push(mail);
      },
    });

    await sendMail({ to: 'a@example.com', subject: 't', text: 'b' });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('a@example.com');
  });
});

// オブジェクトストレージも同じガードの対象。tx 内で S3 に書くと、ロールバックしても
// オブジェクトだけ残る(= DB と実体が食い違う)
describe('tx 内外部 I/O ガード(オブジェクトストレージ)', () => {
  afterEach(() => {
    setStorageForTesting(null);
  });

  it.each([
    ['putObject', () => putObject('k', Buffer.from('x'), 'text/plain')],
    ['presignGetObject', () => presignGetObject('k')],
    ['removeObjects', () => removeObjects(['k'])],
  ])('tx 内の %s は拒否される', async (_name, call) => {
    const fake = createMemoryStorage();
    setStorageForTesting(fake);

    await expect(
      nestableTransaction(async () => {
        await call();
      })
    ).rejects.toThrow(/トランザクション内での外部 I\/O は禁止/);
    expect(fake.objects.size).toBe(0);
  });

  it('tx 外なら注入したフェイクに届く', async () => {
    const fake = createMemoryStorage();
    setStorageForTesting(fake);

    await putObject('uploaded-images/abc/original.webp', Buffer.from('img'), 'image/webp');
    expect(fake.objects.get('uploaded-images/abc/original.webp')?.contentType).toBe(
      'image/webp'
    );

    await removeObjects(['uploaded-images/abc/original.webp']);
    expect(fake.objects.size).toBe(0);
  });
});
