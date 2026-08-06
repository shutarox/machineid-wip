// pm2 コマンドで指定した名前のプロセスが起動しているかチェックして、存在したらエラーを返す

import { exec } from 'node:child_process';

const processName = process.argv[2]; // コマンドラインの第一引数からプロセス名を取得
if (!processName) {
  console.error('Error: Please provide a process name as the first argument.');
  process.exit(1);
}
exec(`pm2 pid ${processName}`, (error, stdout, stderr) => {
  if (error) {
    console.error(`exec error: ${error}`);
    return;
  }
  if (stderr) {
    console.error(`stderr: ${stderr}`);
    return;
  }
  if (stdout.trim()) {
    console.error(`Error: Process ${processName} is already running.`);
    process.exit(1);
  }
});
