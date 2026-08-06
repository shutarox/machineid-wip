import * as Config from '@/config.js';
import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';
import { createSerializerCompiler } from 'fastify-type-provider-zod';

// シリアライズ時に、JST で出力するようにする

// Date オブジェクトを含む配列、マップによって構成されたオブジェクトを、再帰的に Date オブジェクトだけ JST の文字列に変換する
// その他のオブジェクトはそのままにする
// この関数は、fastify の replacer として使う

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertDatesToJSTString(obj: any): any {
  if (obj instanceof Date) {
    return format(
      new TZDate(obj, Config.LOCAL_TIMEZONE),
      "yyyy-MM-dd'T'HH:mm:ssXXX"
    );
  } else if (Array.isArray(obj)) {
    return obj.map(convertDatesToJSTString);
  } else if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      Object.entries(obj).map(([key, value]) => [
        key,
        convertDatesToJSTString(value),
      ])
    );
  }
  return obj;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fastifyReplacer = (key: string, value: any) =>
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  convertDatesToJSTString(value);

export const customSerializerCompiler = createSerializerCompiler({
  replacer: fastifyReplacer,
});
