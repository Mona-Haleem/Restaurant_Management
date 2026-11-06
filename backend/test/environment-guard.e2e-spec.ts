import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { runBootGuards } from '../src/config/boot-guard';
import { EnvironmentGuardError } from '../src/config/environment';
import { TEST_DATABASE_URL, testEnv } from './test-env';

// Fake hosts only: the guards must refuse them before any connection is attempted.
const SUPABASE_POOLER =
  'postgresql://postgres.abcdefghijkl:secret@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';
const SUPABASE_DIRECT = 'postgresql://postgres:secret@db.abcdefghijkl.supabase.co:5432/postgres';

const backendDir = path.join(__dirname, '..');

function runNode(
  args: string[],
  env: NodeJS.ProcessEnv,
): { status: number | null; output: string } {
  const result = spawnSync(process.execPath, args, {
    cwd: backendDir,
    env,
    encoding: 'utf8',
    timeout: 30_000,
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe('environment guards (real Postgres)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: TEST_DATABASE_URL }),
  });

  async function setMarker(name: 'test' | 'production' | null): Promise<void> {
    // Test fixture on the disposable test database only.
    await prisma.appEnvironment.deleteMany();
    if (name) await prisma.appEnvironment.create({ data: { id: 1, name } });
  }

  afterEach(() => setMarker('test'));
  afterAll(() => prisma.$disconnect());

  describe('boot guard', () => {
    it('claims an unmarked test database, then matches it on the next boot', async () => {
      await setMarker(null);
      await expect(runBootGuards(testEnv())).resolves.toBe('test');
      expect(await prisma.appEnvironment.findUnique({ where: { id: 1 } })).toMatchObject({
        name: 'test',
      });
      await expect(runBootGuards(testEnv())).resolves.toBe('test');
    });

    it('refuses to boot when the database is marked for another environment', async () => {
      await setMarker('production');
      await expect(runBootGuards(testEnv())).rejects.toThrow(
        'This database is marked "production" but APP_ENV is "test"',
      );
    });

    it.each([SUPABASE_POOLER, SUPABASE_DIRECT])(
      'refuses a local start with a staging/production URL before connecting (%s)',
      async (url) => {
        await expect(
          runBootGuards(testEnv({ APP_ENV: 'local', DATABASE_URL: url })),
        ).rejects.toThrow(EnvironmentGuardError);
      },
    );

    it('the real entrypoint exits with a clear message for a production URL in a local env', () => {
      const { status, output } = runNode(
        ['dist/main.js'],
        testEnv({ APP_ENV: 'local', DATABASE_URL: SUPABASE_POOLER }),
      );
      expect(status).toBe(1);
      expect(output).toContain('Refusing to start: APP_ENV=local only allows a local database');
      expect(output).not.toContain('secret');
    });

    it('the real entrypoint exits when APP_ENV is missing', () => {
      const env = testEnv();
      delete env.APP_ENV;
      // An empty APP_ENV is not overridden by .env / .env.example, which hold APP_ENV=local.
      const { status, output } = runNode(['dist/main.js'], { ...env, APP_ENV: '' });
      expect(status).toBe(1);
      expect(output).toContain('Refusing to start: APP_ENV is not set');
    });
  });

  describe('destructive Prisma commands', () => {
    const prismaCli = path.join('node_modules', 'prisma', 'build', 'index.js');

    it.each([
      ['staging', SUPABASE_POOLER],
      ['production', SUPABASE_DIRECT],
      ['staging', TEST_DATABASE_URL],
      ['production', TEST_DATABASE_URL],
    ])(
      'migrate reset refuses on APP_ENV=%s and leaves the database untouched',
      async (appEnv, url) => {
        const { status, output } = runNode(
          [prismaCli, 'migrate', 'reset', '--force'],
          testEnv({ APP_ENV: appEnv, DATABASE_URL: url, DIRECT_URL: url }),
        );
        expect(status).toBe(1);
        expect(output).toContain(
          `prisma migrate reset is refused: it only runs when APP_ENV is local or test (APP_ENV=${appEnv})`,
        );
        // Nothing ran: the test database still has its marker.
        expect(await prisma.appEnvironment.count()).toBe(1);
      },
    );

    it('migrate reset refuses a Supabase URL even when APP_ENV=local', () => {
      const { status, output } = runNode(
        [prismaCli, 'migrate', 'reset', '--force'],
        testEnv({ APP_ENV: 'local', DATABASE_URL: SUPABASE_DIRECT, DIRECT_URL: SUPABASE_DIRECT }),
      );
      expect(status).toBe(1);
      expect(output).toContain('APP_ENV=local only allows a local database');
    });
  });
});
