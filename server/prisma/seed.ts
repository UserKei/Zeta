import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../libs/shared/src/generated/prisma/client';
import { hashPassword } from '../src/auth/auth.service';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to seed Zeta.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function main() {
  const username = process.env.SEED_ADMIN_USERNAME ?? 'admin';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'zeta-admin';
  const displayName = process.env.SEED_ADMIN_DISPLAY_NAME ?? 'Zeta Admin';
  const passwordHash = await hashPassword(password);

  await prisma.user.upsert({
    where: { username },
    update: {
      displayName,
      passwordHash,
    },
    create: {
      username,
      passwordHash,
      displayName,
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
