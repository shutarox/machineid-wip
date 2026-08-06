import * as Config from '@/config.js';
import { ServerError } from '@/libs/appError.js';
import { assertNotInTransaction } from '@/libs/prisma-connection.js';
import nodemailer from 'nodemailer';

// メール送信の注入点。
// 実体は SES(SMTP)だが、テストでは setMailerForTesting でフェイクに差し替える。
// 送信はトランザクション内では禁止(assertNotInTransaction)— tx 内で送信すると
// ロールバック時にメールだけ届く・tx を外部 I/O のレイテンシで長引かせる、を防ぐ

export type Mail = {
  to: string;
  subject: string;
  text: string;
};

export type Mailer = {
  send(mail: Mail): Promise<void>;
};

const sesSmtpMailer: Mailer = {
  async send(mail: Mail) {
    const transporter = nodemailer.createTransport({
      host: 'email-smtp.ap-northeast-1.amazonaws.com',
      port: 465,
      secure: true,
      auth: {
        user: Config.SES_SMTP_USER,
        pass: Config.SES_SMTP_PASS,
      },
      requireTLS: true,
    });

    const info = await transporter.sendMail({
      from: Config.MAIL_FROM,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
    });
    if (info.rejected.length > 0) {
      throw new ServerError('メール送信できませんでした');
    }
  },
};

let mailer: Mailer = sesSmtpMailer;

export const sendMail = async (mail: Mail): Promise<void> => {
  assertNotInTransaction('メール送信');
  await mailer.send(mail);
};

// テスト用: フェイクに差し替える(null で実体に戻す)
export const setMailerForTesting = (fake: Mailer | null): void => {
  mailer = fake ?? sesSmtpMailer;
};
