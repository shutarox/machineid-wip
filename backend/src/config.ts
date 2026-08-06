import { ServerError } from '@/libs/appError.js';
import { resolveCookieDomain } from '@/libs/cookieDomain.js';
import { getParameters } from '@/libs/ssmClient.js';
import { CookieSerializeOptions } from '@fastify/cookie';
import * as fs from 'fs';
import * as path from 'path';

export const SERVER_VERSION = process.env.BUILD_VERSION ?? 'dynamic';
export const MINIMUM_CLIENT_VERSION = 20260623.1301;

export const MAINTENANCE_MODE = false;
export const MAINTENANCE_MESSAGE =
  '只今メンテナンス中です（3/22 18時頃終了予定）';

// SSMパラメータ取得にリトライ機能を追加
async function getSSMParametersWithRetry(
  parameterNames: string[],
  maxRetries = 30,
  delay = 1000
): Promise<Record<string, string>> {
  // ローカル / CI は AWS へ接続せず、必ず ~/.ssm-keys.json から読む。
  // 開発コンテナに AWS_PROFILE を設定していない(MinIO 用の静的キーを
  // 資格情報チェーンに優先させないため)ので、SSM を引く資格情報が無い
  const ssmKeysPath = path.join(process.env?.HOME ?? '', '.ssm-keys.json');
  if (process.env.IS_LOCAL_DEVELOPMENT === 'true') {
    if (!fs.existsSync(ssmKeysPath)) {
      const template = JSON.stringify(
        Object.fromEntries(parameterNames.map((name) => [name, '<値>'])),
        null,
        2
      );
      throw new ServerError(
        [
          `SSM パラメータのキャッシュがありません: ${ssmKeysPath}`,
          '',
          'ローカル開発では AWS に接続しません。次の内容でこのファイルを作成してください。',
          '',
          template,
          '',
          '値は AWS SSM パラメータストアから取得するか、開発用のダミーで構いません',
          '(ダミーの例は .github/workflows/ci.yml の "Write dummy SSM cache" にあります)。',
          'キー名の接頭辞は環境変数 SSM_KEY_PREFIX で変えられます。',
        ].join('\n')
      );
    }
    const ssmKeys = JSON.parse(fs.readFileSync(ssmKeysPath, 'utf8')) as Record<
      string,
      string
    >;
    console.log(`SSMパラメータを ~/.ssm-keys.json から読み込みました`);
    return ssmKeys;
  }

  const startTime = Date.now();
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`SSMパラメータ取得を試行中... (${i + 1}/${maxRetries})`);
      const result = await getParameters(parameterNames);
      const endTime = Date.now();
      console.log(`SSMパラメータ取得に成功 (${endTime - startTime}ms)`);

      if (process.env.IS_LOCAL_DEVELOPMENT === 'true') {
        fs.writeFileSync(ssmKeysPath, JSON.stringify(result, null, 2));
      }
      return result;
    } catch (error) {
      console.error(`SSMパラメータ取得に失敗 (${i + 1}/${maxRetries}):`, error);
      if (i === maxRetries - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  console.error('SSMパラメータ取得に失敗');
  return {};
}

export const ENABLE_DEBUG_MODE = process.env.ENABLE_DEBUG_MODE === 'true';

// SSM パラメータの名前空間。案件ごとに環境変数 SSM_KEY_PREFIX で差し替える
// (末尾の / は付けても付けなくてもよい)。ローカル / CI では ~/.ssm-keys.json の
// キーがこのプレフィックスと一致している必要がある
const SSM_KEY_PREFIX = `${(process.env.SSM_KEY_PREFIX ?? '/myapp-keys').replace(/\/+$/, '')}/`;

const SSM_KEY_NAMES = [
  'COOKIE_SECRET',
  'CRYPTO_SECRET',
  'SES_SMTP_USER',
  'SES_SMTP_PASS',
  'MASTER_SECRET',
  'MASTER_IP_WHITELIST',
] as const;
const ssmKey = (name: (typeof SSM_KEY_NAMES)[number]) =>
  `${SSM_KEY_PREFIX}${name}`;

const ssmParams =
  (await getSSMParametersWithRetry(SSM_KEY_NAMES.map(ssmKey))) || {};
for (const name of SSM_KEY_NAMES) {
  if (!ssmParams[ssmKey(name)]) {
    // プレフィックスの取り違えがここで分かるよう、解決後のフルパスを出す
    throw new ServerError(`${ssmKey(name)} is not set`);
  }
}

export const SPA_APP_BASE_URL = process.env.SPA_APP_BASE_URL ?? '';
if (!SPA_APP_BASE_URL) {
  throw new ServerError('SPA_APP_BASE_URL is not set');
}
export const API_SERVER_BASE_URL = process.env.API_SERVER_BASE_URL ?? '';
if (!API_SERVER_BASE_URL) {
  throw new ServerError('API_SERVER_BASE_URL is not set');
}

// 起動時 assert: 解決できないまま起動すると secure / sameSite が静かに外れる
// (判断の詳細は libs/cookieDomain.ts)
export const COOKIE_DOMAIN = resolveCookieDomain({
  cookieDomainEnv: process.env.COOKIE_DOMAIN,
  apiServerBaseUrl: API_SERVER_BASE_URL,
  isLocalDevelopment: process.env.IS_LOCAL_DEVELOPMENT === 'true',
});

export const COOKIE_SECRET = ssmParams[ssmKey('COOKIE_SECRET')] ?? '';
const cryptoSecretHex = ssmParams[ssmKey('CRYPTO_SECRET')];
export const CRYPTO_SECRET = cryptoSecretHex
  ? Buffer.from(cryptoSecretHex, 'hex')
  : Buffer.alloc(0);
export const MAIL_FROM = process.env.MAIL_FROM ?? 'noreply@example.com';
export const SES_SMTP_USER = ssmParams[ssmKey('SES_SMTP_USER')] ?? '';
export const SES_SMTP_PASS = ssmParams[ssmKey('SES_SMTP_PASS')] ?? '';
export const MASTER_SECRET = ssmParams[ssmKey('MASTER_SECRET')] ?? '';
export const MASTER_IP_WHITELIST =
  ssmParams[ssmKey('MASTER_IP_WHITELIST')] ?? '';

export const LOCAL_TIMEZONE = 'Asia/Tokyo';

//================= オブジェクトストレージ(S3 / MinIO)

/** 画像などをしまうバケット。ローカル・CI は MinIO、本番は S3 */
export const S3_BUCKET = process.env.S3_BUCKET ?? '';

/**
 * S3 互換エンドポイント。**本番(実 S3)では未設定にする**(SDK の既定に任せる)。
 * ローカル / CI では MinIO の URL を入れる。
 */
export const S3_ENDPOINT = process.env.S3_ENDPOINT || undefined;

/**
 * presigned URL の発行にだけ使うエンドポイント。**未設定なら `S3_ENDPOINT` と同じ**。
 *
 * 分かれている理由: presigned URL を開くのは**ブラウザ**なので、サーバから見た
 * MinIO のホスト名(docker ネットワーク内の `miniohost`)では解決できないことがある。
 * かといって URL のホスト名だけ後から差し替えることはできない — SigV4 は Host
 * ヘッダごと署名するので **403 になる**(実測)。署名の時点でブラウザが到達できる
 * ホスト名を使う必要があるため、発行専用のエンドポイントを持つ。
 *
 * - 開発コンテナ(ホストのブラウザで見る): `http://localhost:9000`(compose が公開)
 * - E2E(コンテナ内の chromium): `http://miniohost:9000`(playwright.config.ts が上書き)
 * - CI: 未設定。minio も chromium も同じランナー上なので `S3_ENDPOINT` と同じでよい
 * - 本番(実 S3): 両方とも未設定
 */
export const S3_PUBLIC_ENDPOINT =
  process.env.S3_PUBLIC_ENDPOINT || S3_ENDPOINT;

/**
 * パススタイル(`http://host/bucket/key`)を強制するか。
 * MinIO は仮想ホスト形式のドメインを持たないので **MinIO では true が要る**。
 * 実 S3 では未設定(= 仮想ホスト形式)。
 */
export const S3_FORCE_PATH_STYLE = process.env.S3_FORCE_PATH_STYLE === 'true';

export const AWS_REGION = process.env.AWS_DEFAULT_REGION ?? 'ap-northeast-1';

/** presigned URL の既定の有効期限(秒) */
export const S3_PRESIGN_EXPIRES_SEC = 10 * 60;

/**
 * セッションのアイドル失効。最後の活動からこの時間が経つとサーバが 401 を返す。
 * **サーバ側の判定(`plugins/sessionRetrieve.ts`)とセッションクッキーの寿命が
 * ともにこの定数から導かれる**ので、変えるときはここだけを変える。
 * 判断の経緯は `docs/decisions/20260804-session-lifetime.md`。
 */
export const SESSION_IDLE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * `lastActiveAt` とセッションクッキーを延長する最小間隔。
 * リクエストのたびに書き込まないための間引きで、失効までの猶予に対して
 * 十分小さければよい(最悪でもこの分だけ早く失効する)。
 */
export const SESSION_TOUCH_INTERVAL_MS = 60 * 60 * 1000;

const COOKIE_BASE: CookieSerializeOptions = COOKIE_DOMAIN
  ? {
      secure: true,
      httpOnly: true,
      domain: COOKIE_DOMAIN,
      path: '/',
      sameSite: 'strict',
      signed: true,
    }
  : {
      // ローカル開発(HTTP)向け。secure / sameSite が付かない条件は
      // libs/cookieDomain.ts の assert で本番環境に漏れないよう縛っている
      httpOnly: true,
      path: '/',
      signed: true,
    };

/**
 * セッションより長生きしてよいクッキー(deviceId など)の既定。
 * `expires` ではなく `maxAge` を使う: `expires` はプロセス起動時に 1 回だけ計算されるため、
 * 長寿命プロセスでは発行時点との差が開いていく。`maxAge` は受信時にブラウザが計算する。
 * 400 日は Chromium が Cookie の寿命を切り詰める上限で、それより長く指定しても意味がない。
 */
export const DEFAULT_COOKIE_OPTIONS: CookieSerializeOptions = {
  ...COOKIE_BASE,
  maxAge: 400 * 24 * 60 * 60,
};

/**
 * セッションクッキー。アイドル失効と同じ寿命にし、活動のたびに再発行して延長する。
 * これによりサーバ側のセッションとクッキーが同じタイミングで延命 / 失効する。
 */
export const SESSION_COOKIE_OPTIONS: CookieSerializeOptions = {
  ...COOKIE_BASE,
  maxAge: SESSION_IDLE_TIMEOUT_MS / 1000,
};
