import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { PrismaClient } from '../src/generated/prisma/client';
import { unscopedClient } from './seed-tenants';
import { TEST_DATABASE_URL } from './test-env';

// B1202 acceptance, locally: a deliberately broken migration makes `prisma migrate deploy` fail,
// and the failure sticks until it is resolved, so the deploy workflows (which run it before any
// build or deploy, and continue on no error) stop and the previous version keeps running. The live
// drill on staging is in ADR 0029. Runs against the local test database only.

const BACKEND = path.join(__dirname, '..');
const PRISMA_CLI = path.join(BACKEND, 'node_modules', 'prisma', 'build', 'index.js');
const BROKEN = '29991231000000_b1202_drill_broken';

describe('a broken migration stops migrate deploy (B1202)', () => {
  let prisma: PrismaClient;
  let dir: string;
  let config: string;

  const migrateDeploy = () =>
    spawnSync(process.execPath, [PRISMA_CLI, 'migrate', 'deploy', '--config', config], {
      cwd: BACKEND,
      env: { ...process.env, APP_ENV: 'test' },
      encoding: 'utf8',
      timeout: 120_000,
    });

  beforeAll(() => {
    prisma = unscopedClient();
    // A copy of the real migrations plus one broken migration, in a temporary folder.
    dir = mkdtempSync(path.join(tmpdir(), 'tablz-b1202-'));
    cpSync(path.join(BACKEND, 'prisma', 'migrations'), path.join(dir, 'migrations'), {
      recursive: true,
    });
    mkdirSync(path.join(dir, 'migrations', BROKEN));
    writeFileSync(
      path.join(dir, 'migrations', BROKEN, 'migration.sql'),
      'SELECT "no_such_column" FROM "no_such_table_b1202";\n',
    );
    config = path.join(dir, 'prisma.config.mjs');
    const slash = (p: string) => p.replaceAll('\\', '/');
    writeFileSync(
      config,
      'export default ' +
        JSON.stringify({
          schema: slash(path.join(BACKEND, 'prisma', 'schema.prisma')),
          migrations: { path: slash(path.join(dir, 'migrations')) },
          datasource: { url: TEST_DATABASE_URL },
        }) +
        ';\n',
    );
  });

  afterAll(async () => {
    // Leave the test database as the e2e setup made it.
    await prisma.$executeRawUnsafe(
      `DELETE FROM "_prisma_migrations" WHERE "migration_name" = '${BROKEN}'`,
    );
    await prisma.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  });

  it('exits non-zero on the broken migration', () => {
    const result = migrateDeploy();
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain(BROKEN);
  });

  it('records it as failed, not applied', async () => {
    const rows = await prisma.$queryRawUnsafe<
      { finished_at: Date | null; rolled_back_at: Date | null }[]
    >(
      `SELECT "finished_at", "rolled_back_at" FROM "_prisma_migrations" WHERE "migration_name" = '${BROKEN}'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.finished_at).toBeNull();
    expect(rows[0]!.rolled_back_at).toBeNull();
  });

  it('keeps refusing every later deploy until the failure is resolved (the migrate-resolve workflow)', () => {
    const again = migrateDeploy();
    expect(again.status).not.toBe(0);
    expect(`${again.stdout}${again.stderr}`).toMatch(/P3009|failed migrations/i);
  });
});
