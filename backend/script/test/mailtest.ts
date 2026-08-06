// メール送信の手動確認スクリプト(実 SES を叩く)。
// `script/test/storage_smoke.ts` と同じ位置づけで、**実体の外部サービス**に対して
// 一往復させる。統合テストは `libs/mailer.ts` の注入点をフェイクに差し替えるので、
// SES 固有の配線(認証・TLS・送信元の検証済みドメイン)を通すのはこの経路だけ。
//
// Usage:
//   pnpm script script/test/mailtest.ts <宛先アドレス>
//   (backend/ で実行)
//
// **認証情報はコードに書かない。** SSM(`SES_SMTP_USER` / `SES_SMTP_PASS`)から取る。
// 以前はここに IAM のアクセスキーが平文で埋まっていた。

import * as Config from '@/config.js';
import nodemailer from 'nodemailer';

const to = process.argv[2];
if (!to) {
  console.error('宛先アドレスを指定してください: pnpm script script/test/mailtest.ts <宛先>');
  process.exit(1);
}

if (!Config.SES_SMTP_USER || !Config.SES_SMTP_PASS) {
  console.error(
    'SES_SMTP_USER / SES_SMTP_PASS が取得できません。SSM かキャッシュファイルを確認してください'
  );
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  // libs/mailer.ts と同じエンドポイント(秘密ではない)
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
  to,
  subject: 'Test mail via Amazon SES (SMTP)',
  text: 'Hello via SES SMTP.',
  html: '<p>Hello via <b>SES SMTP</b>.</p>',
});

console.log(`送信しました: ${to}`);
console.log(`  Message ID: ${info.messageId}`);
process.exit(0);
