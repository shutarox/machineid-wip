import { z } from 'zod';

// ワイヤー上の日時と Date オブジェクトの変換を集約するヘルパー。
// ワイヤーの正準形は「オフセット付き ISO 文字列(サーバ出力は常に +09:00・秒精度)」。

// リクエスト入力用: オフセット付き ISO 日時文字列、または日付のみの文字列を Date に変換する。
// 日付のみの場合は JST の 0 時と解釈する。オフセットなしの日時文字列は受理しない
export const zDateIn = () =>
  z
    .union([z.iso.datetime({ offset: true }), z.iso.date()])
    .transform((value) =>
      /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T00:00:00+09:00`)
        : new Date(value)
    );

// レスポンス出力用: ハンドラは Date のまま返す。
// OpenAPI スキーマは fastify-type-provider-zod が string/date-time に変換し、
// 実際のシリアライズは customSerializerCompiler の replacer が +09:00 の ISO 文字列にする
export const zDateOut = () => z.date();
