// マスターログイン用 TOTP シークレットの生成スクリプト
//
// 出力された secretBase32 を SSM の MASTER_SECRET に設定し、
// QR コードを Authenticator アプリに読み込ませて使う。

import { randomBytes } from 'node:crypto';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';

const name = 'myapp';
const issuer = 'myapp';

const secret = new OTPAuth.Secret({ buffer: randomBytes(32).buffer });

const totp = new OTPAuth.TOTP({
  issuer,
  label: name,
  secret,
  digits: 6,
  period: 30,
});

const secretBase32 = secret.base32;
const urlForQRCode = totp.toString();

console.log(`secretBase32: ${secretBase32}`);
console.log(`urlForQRCode: ${urlForQRCode}`);

// output QR code to file
const outputPath = new URL('../qrCode.png', import.meta.url).pathname;
await QRCode.toFile(outputPath, urlForQRCode);
console.log(`QR code generated to ${outputPath} successfully`);
