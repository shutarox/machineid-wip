import * as Config from '@/config';
import * as OAS from '@/generated/openapi-schema';
import createFetchClient, {
  createQuerySerializer,
  type Middleware,
} from 'openapi-fetch';
import createApiClient from 'openapi-react-query';

// ワイヤー正準形: オフセット付き ISO 文字列(サーバ入出力とも常に +09:00・秒精度)。
// リクエストに載る Date はこの正準形へ直列化し、レスポンスは string のまま扱う。
export const dateToJstCanonical = (date: Date): string => {
  const shifted = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  shifted.setMilliseconds(0);
  // 計画 §8 の受け入れ基準「ミリ秒なし」。setMilliseconds(0) 済みなので toISOString は必ず .000Z を含む。
  return shifted.toISOString().replace('.000Z', '+09:00');
};

// JST 変換は Middleware ではなく serializer で注入する(workplan からの意図的逸脱)。
// openapi-fetch の Middleware onRequest は直列化後の Request しか受け取れず、body の
// Date は既に UTC の Z 文字列になっており正準形(+09:00・秒精度)を保証できないため、
// 直列化そのものに介入する。replacer には toJSON 適用後の値が渡るため this[key] で判定する。
function jstReplacer(
  this: Record<string, unknown>,
  key: string,
  value: unknown
) {
  const raw = this[key];
  return raw instanceof Date ? dateToJstCanonical(raw) : value;
}

const bodySerializer = (body: unknown) => JSON.stringify(body, jstReplacer);

const baseQuerySerializer = createQuerySerializer();
const querySerializer = (query: unknown): string => {
  if (!query || typeof query !== 'object') {
    return baseQuerySerializer(query as Record<string, never>);
  }
  const converted: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(query)) {
    converted[k] = v instanceof Date ? dateToJstCanonical(v) : v;
  }
  return baseQuerySerializer(converted as Record<string, never>);
};

export const client = createFetchClient<OAS.paths>({
  baseUrl: Config.API_SERVER_BASE_URL,
  credentials: 'include',
  bodySerializer,
  querySerializer,
});

// ①ヘッダ付与: 全リクエストに x-for-preflight / x-client-version を付ける
const headerMiddleware: Middleware = {
  onRequest({ request }) {
    request.headers.set('x-for-preflight', 'yes');
    request.headers.set('x-client-version', Config.CLIENT_VERSION);
    return request;
  },
};

// ②エラー正規化: message も actions も持たない非 2xx(空ボディ・text/plain の 500 等)に、
// 旧 useApiCall と同じ「通信エラーが発生しました（status）」を JSON エラーボディとして付与する。
// __transient は「サーバ由来の構造化エラーではない = リトライ対象」を下流に伝えるマーカー。
const errorNormalizeMiddleware: Middleware = {
  async onResponse({ response }) {
    if (response.ok) return;
    let body: unknown;
    try {
      body = await response.clone().json();
    } catch {
      body = undefined;
    }
    const parsed = body as
      | { message?: string; actions?: unknown }
      | undefined;
    if (parsed?.message || parsed?.actions) return;
    return new Response(
      JSON.stringify({
        message: `通信エラーが発生しました（${response.status}）`,
        __transient: true,
      }),
      {
        status: response.status,
        headers: { 'content-type': 'application/json' },
      }
    );
  },
};

client.use(headerMiddleware, errorNormalizeMiddleware);

// openapi-react-query のフック生成器($api.useQuery / $api.useMutation)。
export const $api = createApiClient(client);

//=========================================================== ファイルアップロード

export type UploadedImage =
  OAS.paths['/api/private/uploadedImages']['post']['responses']['200']['content']['application/json']['uploadedImage'];

/**
 * 画像を 1 枚アップロードする。
 *
 * multipart は $api.useMutation では送れない。**理由が 2 つある**:
 *
 * 1. 既定の `bodySerializer` が `JSON.stringify` 固定なので、FormData を渡すと
 *    `"{}"` になって壊れる → リクエスト単位で素通しの serializer に差し替える
 * 2. multipart のルートは Zod で body を検証できず `schema.body` を書いていないため、
 *    生成型では `requestBody?: never` になる → 型を通すためのキャストが要る
 *
 * client 経由なので Middleware(x-client-version 付与・エラー正規化)は効く。
 * エラーは正規化済みのボディをそのまま throw して、queryClient の
 * MutationCache.onError(トースト・actions 処理)に載せる。
 */
export const uploadImage = async (file: File): Promise<UploadedImage> => {
  const formData = new FormData();
  formData.append('file', file);

  const { data, error } = await client.POST('/api/private/uploadedImages', {
    body: formData as never,
    // FormData をそのまま渡す。Content-Type は fetch が boundary 付きで付ける
    bodySerializer: (body: unknown) => body as FormData,
  });

  if (error) {
    throw error;
  }
  return data.uploadedImage;
};
