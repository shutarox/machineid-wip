import type { FastifyInstance } from 'fastify';
import { promises as fsPromise } from 'fs';
import openapiTS, { astToString } from 'openapi-typescript';
import * as path from 'path';
import { repoRoot } from './repoRoot.js';

const DTS_PATH = path.join(
  repoRoot(),
  'frontend/src/generated/openapi-schema.d.ts'
);

export async function generateOpenApiSchema(
  fastify: FastifyInstance
): Promise<void> {
  const swaggerYaml = fastify.swagger({ yaml: true });

  // date-time は string のまま貫く(ワイヤー正準形 = オフセット付き ISO 文字列)。
  // 以前はここで date-time → Date に transform し、実行時に openapi-schema.json を
  // 参照して convertToDate でレスポンスを書き換えていたが、型と実体の乖離が
  // サイレントに壊れる温床だったため廃止(Date が要る画面はローカルで new Date(s))。
  const ast = await openapiTS(swaggerYaml);
  const next = astToString(ast);

  // 内容が変わらないなら書かない。dev サーバは再起動のたびここを通るので、
  // 毎回 mtime が動くとエディタや watch が無駄に反応する
  const current = await fsPromise.readFile(DTS_PATH, 'utf8').catch(() => null);
  if (current === next) {
    return;
  }

  // 同一ディレクトリの一時ファイルへ書いてから rename する。
  // 直接 writeFile すると truncate → 書き込みの間にプロセスが死んだとき
  // **0 バイトのファイルが git 管理下に残る**(実際に複数回踏んでいる)。
  // rename は同一ファイルシステム内では原子的なので、途中で死んでも
  // 以前の内容がそのまま残る
  const tmpPath = `${DTS_PATH}.tmp`;
  try {
    await fsPromise.writeFile(tmpPath, next);
    await fsPromise.rename(tmpPath, DTS_PATH);
  } catch (e) {
    await fsPromise.unlink(tmpPath).catch(() => undefined);
    throw e;
  }
  console.log(`generated: ${DTS_PATH}`);
}
