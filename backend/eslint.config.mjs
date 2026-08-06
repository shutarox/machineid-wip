import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { noUnusedTxParam } from './eslint-rules/no-unused-tx-param.mjs';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const compat = new FlatCompat({
  baseDirectory: dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  {
    ignores: [
      '**/generated/',
      '**/build/',
      '**/public/',
      '**/coverage/',
      '**/node_modules/',
      '**/*.min.js',
      '**/*.config.js',
      '**/.*lintrc.js',
      '**/*.js',
      '**/eslint.config.mjs',
    ],
  },
  ...compat.extends(
    'eslint:recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking'
  ),
  {
    plugins: {
      '@typescript-eslint': typescriptEslint,
      // このリポジトリ固有のルール(eslint-rules/ に実装、追加依存なし)
      local: {
        rules: {
          'no-unused-tx-param': noUnusedTxParam,
        },
      },
    },

    languageOptions: {
      globals: {
        ...globals.node,
      },

      parser: tsParser,

      parserOptions: {
        project: './tsconfig.json', // tsconfig.json のパス
        tsconfigRootDir: dirname, // tsconfig.json のルートディレクトリ
        sourceType: 'module',
      },
    },

    rules: {
      '@typescript-eslint/require-await': 0,
      '@typescript-eslint/no-floating-promises': ['warn', { ignoreIIFE: true }],
      '@typescript-eslint/no-misused-promises': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/ban-ts-comment': 'off',

      // 層構造の強制: 純粋関数は tx を受け取らない(使わない tx は層の取り違え)
      'local/no-unused-tx-param': 'error',

      'no-restricted-globals': [
        'error',
        {
          name: '__dirname',
          message:
            'ESM では使えません。`import.meta.url` + `fileURLToPath()` を使うか、リポジトリ基準のパスなら `repoRoot()`(@/libs/repoRoot.js)を使ってください。',
        },
        {
          name: '__filename',
          message:
            'ESM では使えません。`import.meta.url` + `fileURLToPath()` を使ってください。',
        },
      ],

      // 位置非依存化(workplan 1-12)の維持。チェックアウト位置に依存する
      // 絶対パスをコードに埋めない。`/api/...` のような URL パスは対象外。
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'Literal[value=/^\\u002F(app|home|Users|workspace|opt|srv)\\u002F/]',
          message:
            '絶対パスのリテラルは使わないでください。リポジトリ基準のパスは `repoRoot()`(@/libs/repoRoot.js)経由で組み立てます。',
        },
        {
          selector:
            'TemplateElement[value.raw=/^\\u002F(app|home|Users|workspace|opt|srv)\\u002F/]',
          message:
            '絶対パスのリテラルは使わないでください。リポジトリ基準のパスは `repoRoot()`(@/libs/repoRoot.js)経由で組み立てます。',
        },
      ],
    },
  },
];
