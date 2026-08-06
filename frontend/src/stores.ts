import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

import * as OAS from '@/generated/openapi-schema';
import type * as OAF from 'openapi-fetch';
import type * as OTH from 'openapi-typescript-helpers';

function createAtomWithStorage<T>(
  atomName: string,
  initialValue: T | undefined
) {
  const storageValue = localStorage.getItem(atomName);
  let loadedValue: T | undefined;
  try {
    loadedValue = storageValue ? JSON.parse(storageValue) : undefined;
  } catch {
    loadedValue = undefined;
  }
  const atom = atomWithStorage<T | undefined>(
    atomName,
    loadedValue || initialValue
  );
  return atom;
}

type MasterReturnValue = OAF.ParseAsResponse<
  OTH.SuccessResponse<
    OTH.ResponseObjectMap<OAS.paths['/api/private/master']['get']>,
    `${string}/${string}`
  >,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  {}
>;

type LoginUser = OAF.ParseAsResponse<
  OTH.SuccessResponse<
    OTH.ResponseObjectMap<OAS.paths['/api/login']['post']>,
    `${string}/${string}`
  >,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  {}
>;

export const tenantCodeAtom = createAtomWithStorage<string | undefined>(
  'tenantCode',
  undefined
);

export const loginUserAtom = createAtomWithStorage<LoginUser | undefined>(
  'loginUser',
  undefined
);

export const isOpenReloadAppDialogAtom = atom<boolean>(false);

// historyBack アクション要求。queryClient の onError(React 外)から発火するため、
// カウンタをインクリメントして通知し、レイアウト常駐の HistoryBackHandler が
// navigate(-1) を担う(memory router のため window.history 不可、React 外から
// router を直接触ると循環 import になる)
export const historyBackRequestAtom = atom<number>(0);

// テナント設定
type TenantConfig = MasterReturnValue['tenantConfig'];
export const tenantConfigAtom = atom<TenantConfig | undefined>(undefined);

// リトライ可能なAPI呼び出しを管理するatom
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const retryTargetApiCallsAtom = atom<Array<() => Promise<any>>>([]);

export const logoutAtom = atom(null, (_, set) => {
  set(loginUserAtom, undefined);
  set(isOpenReloadAppDialogAtom, false);
  set(tenantConfigAtom, undefined);
});
