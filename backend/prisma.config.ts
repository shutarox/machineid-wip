import { defineConfig, env } from 'prisma/config';

// Prisma CLI(generate / migrate)の設定。
// スキーマの源泉は prisma/schema.prisma で、db:case-format が命名変換した
// schema.prisma.generated を CLI に渡す(v6 までの package.json#prisma の後継)

export default defineConfig({
  schema: 'prisma/schema.prisma.generated',
  datasource: {
    url: env('DB_URL'),
  },
  migrations: {
    path: 'prisma/migrations',
  },
});
