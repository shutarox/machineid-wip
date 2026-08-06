import js from '@eslint/js';
import betterTailwindcss from 'eslint-plugin-better-tailwindcss';
import eslintPluginNode from 'eslint-plugin-node';
import reactCompiler from 'eslint-plugin-react-compiler';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'generated'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: process.cwd(),
      },
    },
    plugins: {
      'react-compiler': reactCompiler,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      node: eslintPluginNode,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-floating-promises': ['warn', { ignoreIIFE: true }],
      '@typescript-eslint/no-misused-promises': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'node/no-process-env': 'error',
      'react-compiler/react-compiler': 'error',
    },
  },
  {
    // Tailwind クラス名の静的検査(存在しない / 競合する / 重複するクラスを検出)。
    // 整形系(line-wrapping 等)は prettier と衝突するため correctness 群のみ採用する。
    extends: [betterTailwindcss.configs.correctness],
    files: ['**/*.tsx'],
    settings: {
      'better-tailwindcss': {
        entryPoint: 'src/index.css',
      },
    },
    rules: {
      // sonner のコンテナ識別クラスは Tailwind クラスではないため除外する
      'better-tailwindcss/no-unknown-classes': [
        'error',
        { ignore: ['^toaster$'] },
      ],
    },
  }
);
