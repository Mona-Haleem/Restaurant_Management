import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { assertDatabaseEnvironment, type EnvironmentMarkerStore } from './database-environment';
import { assertDatabaseUrlAllowed, parseAppEnv, type AppEnv } from './environment';

const MARKER_ID = 1;

export function prismaMarkerStore(prisma: PrismaClient): EnvironmentMarkerStore {
  return {
    async read() {
      const row = await prisma.appEnvironment.findUnique({ where: { id: MARKER_ID } });
      return row?.name ?? null;
    },
    async claim(appEnv: AppEnv) {
      // INSERT ... ON CONFLICT DO NOTHING: never overwrites a marker another process wrote.
      await prisma.appEnvironment.createMany({
        data: [{ id: MARKER_ID, name: appEnv }],
        skipDuplicates: true,
      });
    },
  };
}

/**
 * Runs every boot guard before Nest starts: APP_ENV is valid, the URL fits it, and the database's
 * own app_environment marker agrees. Throws EnvironmentGuardError with a clear message otherwise.
 * Uses a short-lived client; the app's PrismaService arrives in B503.
 */
export async function runBootGuards(env: NodeJS.ProcessEnv): Promise<AppEnv> {
  const appEnv = parseAppEnv(env.APP_ENV);
  const databaseUrl = env.DATABASE_URL;
  assertDatabaseUrlAllowed(appEnv, databaseUrl);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  try {
    await assertDatabaseEnvironment(prismaMarkerStore(prisma), appEnv);
  } finally {
    await prisma.$disconnect();
  }
  return appEnv;
}
