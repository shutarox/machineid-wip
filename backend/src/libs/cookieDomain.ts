import { ServerError } from '@/libs/appError.js';

import * as tldts from 'tldts';

/**
 * セッションクッキーの domain を決める。
 *
 * ここが空になると `DEFAULT_COOKIE_OPTIONS` の分岐で **`secure` と `sameSite` が付かない**
 * クッキーになる。HTTP のローカル開発のための分岐なので、それ以外の環境では空を許さず
 * 起動を止める(警告もエラーも無いまま secure が外れるのを防ぐ)。
 *
 * ローカル開発の判定は `IS_LOCAL_DEVELOPMENT`。SSM を実際に引く環境
 * (dev / stg / prod)はこのフラグを持たないため、そこでは必ず解決できる必要がある。
 */
export const resolveCookieDomain = ({
  cookieDomainEnv,
  apiServerBaseUrl,
  isLocalDevelopment,
}: {
  cookieDomainEnv: string | undefined;
  apiServerBaseUrl: string;
  isLocalDevelopment: boolean;
}): string | null => {
  const domain = cookieDomainEnv ?? tldts.parse(apiServerBaseUrl).domain;

  if (!domain && !isLocalDevelopment) {
    throw new ServerError(
      `セッションクッキーの domain を解決できません ` +
        `(COOKIE_DOMAIN=${cookieDomainEnv ?? '(未設定)'}, API_SERVER_BASE_URL=${apiServerBaseUrl})。` +
        `このまま起動すると secure / sameSite が付かないクッキーになるため中止します`
    );
  }

  return domain;
};
