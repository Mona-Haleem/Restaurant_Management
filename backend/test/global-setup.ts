import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { testEnv } from './test-env';

/** Recreates the test database from the committed migrations before the suite runs. */
export default function globalSetup(): void {
  const prismaCli = path.join(__dirname, '..', 'node_modules', 'prisma', 'build', 'index.js');
  const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'reset', '--force'], {
    cwd: path.join(__dirname, '..'),
    env: testEnv(),
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(
      `Could not reset the test database. Is it running (npm run db:up)?\n${result.stdout}\n${result.stderr}`,
    );
  }
}
