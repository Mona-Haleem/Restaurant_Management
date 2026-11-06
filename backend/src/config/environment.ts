/**
 * Environment guards (ROADMAP §2, ADR 0011). Pure functions: no I/O, so they are unit-tested
 * exhaustively and reused by the API boot (main.ts) and the Prisma CLI (prisma.config.ts).
 */

export const APP_ENVS = ['local', 'test', 'staging', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

/** Environments whose database is disposable: the only ones where destructive commands may run. */
const DISPOSABLE_ENVS: readonly AppEnv[] = ['local', 'test'];

/** Hosts that mean "a database on this machine or in the local Docker network". */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'db', 'postgres']);

/** Prisma CLI commands that can drop data or change the schema outside `migrate deploy`. */
const GUARDED_PRISMA_COMMANDS = new Set([
  'migrate reset',
  'migrate dev',
  'db push',
  'db seed',
  'db execute',
]);

export class EnvironmentGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvironmentGuardError';
  }
}

export function isAppEnv(value: unknown): value is AppEnv {
  return typeof value === 'string' && (APP_ENVS as readonly string[]).includes(value);
}

export function parseAppEnv(value: string | undefined): AppEnv {
  if (value === undefined || value === '') {
    throw new EnvironmentGuardError(
      'APP_ENV is not set. Set it to local, test, staging or production (see docs/ENVIRONMENTS.md).',
    );
  }
  if (!isAppEnv(value)) {
    throw new EnvironmentGuardError(
      `APP_ENV must be one of ${APP_ENVS.join(', ')}; got "${value}".`,
    );
  }
  return value;
}

export function isDisposableEnv(appEnv: AppEnv): boolean {
  return DISPOSABLE_ENVS.includes(appEnv);
}

/** libpq and Prisma connect to these query parameters instead of the URL's host part. */
const HOST_OVERRIDE_PARAMS = ['host', 'hostaddr'];

/**
 * Returns only the host a connection string really connects to, so messages never contain
 * credentials. A `?host=` / `?hostaddr=` override wins over the URL's host part, so it is
 * checked instead (otherwise `postgresql://…@localhost/db?host=remote` would look local).
 */
function databaseHost(url: string, variable: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new EnvironmentGuardError(`${variable} is not a valid URL.`);
  }
  for (const param of HOST_OVERRIDE_PARAMS) {
    const override = parsed.searchParams.get(param);
    if (override !== null) return override.toLowerCase();
  }
  return parsed.hostname.toLowerCase();
}

/**
 * Boot guard 1: the connection string must fit APP_ENV.
 * local/test may only use a local database; staging/production must never use one.
 */
export function assertDatabaseUrlAllowed(
  appEnv: AppEnv,
  url: string | undefined,
  variable = 'DATABASE_URL',
): void {
  if (url === undefined || url === '') {
    throw new EnvironmentGuardError(`${variable} is not set.`);
  }
  const host = databaseHost(url, variable);
  const local = LOCAL_HOSTS.has(host);

  if (isDisposableEnv(appEnv) && !local) {
    throw new EnvironmentGuardError(
      `APP_ENV=${appEnv} only allows a local database, but ${variable} points at "${host}". ` +
        'Staging and production databases are reached only from CI (CLAUDE.md rule 7).',
    );
  }
  if (!isDisposableEnv(appEnv) && local) {
    throw new EnvironmentGuardError(
      `APP_ENV=${appEnv} must not point at a local database, but ${variable} points at "${host}".`,
    );
  }
}

/** Finds the Prisma sub-command (e.g. "migrate reset") in CLI arguments, ignoring flags. */
function prismaCommand(args: readonly string[]): string {
  const words: string[] = [];
  for (let i = 0; i < args.length && words.length < 2; i += 1) {
    const arg = args[i] ?? '';
    if (arg.startsWith('-')) {
      if (!arg.includes('=') && (arg === '--schema' || arg === '--config')) i += 1; // skip its value
      continue;
    }
    words.push(arg);
  }
  return words.join(' ');
}

export function isGuardedPrismaCommand(args: readonly string[]): boolean {
  return GUARDED_PRISMA_COMMANDS.has(prismaCommand(args));
}

/**
 * Destructive-command guard, run by prisma.config.ts before any Prisma CLI command touches a
 * database. Guarded commands run only on local/test with local connection strings.
 */
export function assertPrismaCommandAllowed(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): void {
  if (!isGuardedPrismaCommand(args)) return;
  const command = `prisma ${prismaCommand(args)}`;

  const appEnv = parseAppEnv(env.APP_ENV);
  if (!isDisposableEnv(appEnv)) {
    throw new EnvironmentGuardError(
      `${command} is refused: it only runs when APP_ENV is local or test (APP_ENV=${appEnv}). ` +
        'Staging and production change only through `migrate deploy` in CI.',
    );
  }
  assertDatabaseUrlAllowed(appEnv, env.DATABASE_URL, 'DATABASE_URL');
  if (env.DIRECT_URL) assertDatabaseUrlAllowed(appEnv, env.DIRECT_URL, 'DIRECT_URL');
}
