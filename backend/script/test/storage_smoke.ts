// オブジェクトストレージの疎通確認(手動実行)。
// `script/test/mailtest.ts` と同じ位置づけで、**実体のストレージ**に対して
// put → presigned GET → remove を一往復させる。
//
// Usage:
//   pnpm script script/test/storage_smoke.ts
//   (backend/ で実行。ローカルでは docker compose の MinIO を向く)
//
// 統合テストは storage をフェイクに差し替えるため、**presigned URL が実際に使えるか**
// までは見ていない。ここが S3 固有の配線(署名・エンドポイント・パススタイル・
// Content-Type)を通す唯一の経路になる。

import {
  presignGetObject,
  putObject,
  removeObjects,
} from '@/libs/storage.js';
import { randomUUID } from 'node:crypto';
import { exit } from 'process';

const key = `uploaded-images/${randomUUID()}/smoke.txt`;
const body = Buffer.from('storage smoke test');

await putObject(key, body, 'text/plain');
console.log(`put: ${key}`);

const url = await presignGetObject(key, 60);
if (!/X-Amz-Signature=/.test(url)) {
  console.error('presigned URL に署名が含まれていません');
  exit(1);
}
console.log('presigned URL: 署名あり');

const res = await fetch(url);
const text = await res.text();
console.log(
  `presigned GET: HTTP ${res.status} / content-type=${res.headers.get('content-type')}`
);
if (res.status !== 200 || text !== body.toString()) {
  console.error(`取得内容が一致しません: "${text}"`);
  exit(1);
}

await removeObjects([key]);
const afterDelete = await fetch(url);
console.log(`削除後の GET: HTTP ${afterDelete.status}`);
if (afterDelete.status === 200) {
  console.error('削除できていません');
  exit(1);
}

// S3 は存在しないキーの削除も成功を返す。クリーンアップ処理がこの前提に立つので確認する
await removeObjects([`uploaded-images/${randomUUID()}/missing.txt`]);
console.log('存在しないキーの削除: 例外なし');

console.log('');
console.log('storage smoke: OK');
exit(0);
