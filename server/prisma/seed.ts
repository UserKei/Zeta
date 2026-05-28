import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../libs/shared/src/generated/prisma/client';
import { AiModelType } from '../libs/shared/src/generated/prisma/enums';
import { hashPassword } from '../src/auth/auth.service';
import { loadZetaEnv } from '../libs/shared/src/env/load-env';

loadZetaEnv();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to seed Zeta.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function main() {
  const username = process.env.SEED_ADMIN_USERNAME ?? 'admin';
  const password = process.env.SEED_ADMIN_PASSWORD ?? '123456';
  const displayName = process.env.SEED_ADMIN_DISPLAY_NAME ?? 'Zeta Admin';
  const passwordHash = await hashPassword(password);

  await prisma.user.upsert({
    where: { username },
    update: {
      passwordHash,
      displayName,
    },
    create: {
      username,
      passwordHash,
      displayName,
    },
  });

  const dashScopeApiKey = process.env.DASHSCOPE_API_KEY?.trim() || null;

  await prisma.aiModel.upsert({
    where: { id: '6f8f4f4d-7f4c-4d2f-9b50-2e90c7bfb001' },
    update: {
      apiKey: dashScopeApiKey,
      isEnabled: Boolean(dashScopeApiKey),
      configJson: {
        dimensions: 1024,
        encodingFormat: 'float',
        protocol: 'openai-compatible',
      },
    },
    create: {
      id: '6f8f4f4d-7f4c-4d2f-9b50-2e90c7bfb001',
      name: 'zeta-aliyun-embedding',
      provider: 'aliyun-bailian',
      type: AiModelType.EMBEDDING,
      modelName: 'text-embedding-v4',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: dashScopeApiKey,
      isEnabled: Boolean(dashScopeApiKey),
      configJson: {
        dimensions: 1024,
        encodingFormat: 'float',
        protocol: 'openai-compatible',
      },
    },
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
