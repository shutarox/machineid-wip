import net from 'node:net';
import process from 'node:process';

// コマンドライン引数からポート番号を取得
const PORT = process.argv[2];

if (!PORT || isNaN(PORT)) {
  console.error(
    'Error: Please provide a valid port number as the first argument.'
  );
  process.exit(1); // 引数がない、または不正な場合はエラー終了
}

function checkPort(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use.`));
      } else {
        reject(err);
      }
    });

    server.once('listening', () => {
      server.close(() => resolve(port));
    });

    server.listen(port);
  });
}

(async () => {
  try {
    await checkPort(PORT);
    process.exit(0); // 成功終了
  } catch (err) {
    console.error(err.message);
    process.exit(1); // エラー終了
  }
})();
