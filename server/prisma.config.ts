import { defineConfig } from 'prisma/config';
import { loadZetaEnv } from './libs/shared/src/env/load-env';

loadZetaEnv();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
