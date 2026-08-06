import type { Readable } from 'node:stream';
import * as ts from 'typescript';
import { AstToStringOptions } from './openapi-typescript/ts';
import { OpenAPI3, OpenAPITSOptions } from './openapi-typescript/types';

declare module 'openapi-typescript' {
  export function astToString(
    ast: ts.Node | ts.Node[] | ts.TypeElement | ts.TypeElement[],
    options?: AstToStringOptions
  ): string;

  export default async function openapiTS(
    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
    source: string | URL | OpenAPI3 | Buffer | Readable,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    options: OpenAPITSOptions = {} as Partial<OpenAPITSOptions>
  ): Promise<ts.Node[]>;
}
