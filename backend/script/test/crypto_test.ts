import * as Utils from '@/libs/cryptoUtils.js';

const encrypted = Utils.encrypt('test', { fixed: false });
const N = 1000;
const t1 = Date.now();
for (let i = 0; i < N; i++) {
  Utils.randomString(16);
  //  encrypted = utils.secure.encrypt('testtestkasdjflkjaslfkj', { fixed: false });
}
const t2 = Date.now();
console.log(`${t2 - t1} ms / ${N} times`);
const decrypted = Utils.decrypt(encrypted);

console.log(encrypted);
console.log(decrypted);
