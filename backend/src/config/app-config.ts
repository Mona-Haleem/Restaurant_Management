import { isOriginPatternValid } from '../common/http/cors';
import { EnvironmentGuardError, isDisposableEnv, parseAppEnv, type AppEnv } from './environment';

/** Typed, validated configuration. Built once at boot; inject it with `@Inject(APP_CONFIG)`. */
export interface AppConfig {
  appEnv: AppEnv;
  port: number;
  databaseUrl: string;
  directUrl: string | undefined;
  corsOrigins: string[];
  logLevel: LogLevel;
  /** B503: per-IP limit of `max` requests per `windowSeconds` (health routes excluded). */
  rateLimit: { max: number; windowSeconds: number };
  /** B1201: the commit Render deployed (RENDER_GIT_COMMIT); null when not deployed by Render. */
  gitCommit: string | null;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const DEFAULT_LOG_LEVEL: Record<AppEnv, LogLevel> = {
  local: 'debug',
  test: 'silent',
  staging: 'info',
  production: 'info',
};

/** The Angular dev server. Staging/production must list their origins explicitly. */
const DEFAULT_DEV_ORIGINS = ['http://localhost:4200'];

const DEFAULT_RATE_LIMIT = { max: 120, windowSeconds: 60 };

/** Thrown when the environment is invalid. Lists every problem so one fix-and-restart is enough. */
export class ConfigValidationError extends EnvironmentGuardError {
  constructor(readonly problems: string[]) {
    super(
      problems.length === 1
        ? (problems[0] ?? '')
        : `${problems.length} configuration problems:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    );
    this.name = 'ConfigValidationError';
  }
}

type RawEnv = Readonly<Record<string, string | undefined>>;

function isPostgresUrl(value: string): boolean {
  try {
    return ['postgresql:', 'postgres:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

/**
 * Validates and types the environment (fail fast at boot, ROADMAP B501).
 * Messages name the variable, never echo a connection string.
 */
export function loadConfig(env: RawEnv): AppConfig {
  const problems: string[] = [];

  let appEnv: AppEnv | undefined;
  try {
    appEnv = parseAppEnv(env.APP_ENV);
  } catch (error) {
    problems.push((error as Error).message);
  }

  let port = 3000;
  if (env.PORT !== undefined && env.PORT !== '') {
    port = /^\d+$/.test(env.PORT) ? Number(env.PORT) : NaN;
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      problems.push('PORT must be an integer between 1 and 65535.');
    }
  }

  const databaseUrl = env.DATABASE_URL ?? '';
  if (databaseUrl === '') problems.push('DATABASE_URL is required.');
  else if (!isPostgresUrl(databaseUrl)) problems.push('DATABASE_URL must be a postgresql:// URL.');

  const directUrl = env.DIRECT_URL === '' ? undefined : env.DIRECT_URL;
  if (directUrl !== undefined && !isPostgresUrl(directUrl)) {
    problems.push('DIRECT_URL must be a postgresql:// URL.');
  }

  let logLevel: LogLevel | undefined;
  if (env.LOG_LEVEL !== undefined && env.LOG_LEVEL !== '') {
    if ((LOG_LEVELS as readonly string[]).includes(env.LOG_LEVEL)) {
      logLevel = env.LOG_LEVEL as LogLevel;
    } else {
      problems.push(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}.`);
    }
  }

  const corsOrigins = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');
  for (const origin of corsOrigins) {
    if (!isOriginPatternValid(origin)) {
      problems.push(
        `CORS_ORIGINS has an invalid origin "${origin}": use scheme://host[:port] with no path; ` +
          '"*" is allowed only inside the first label of the host (e.g. https://tablz-*-team.vercel.app).',
      );
    }
  }
  if (appEnv !== undefined && !isDisposableEnv(appEnv) && corsOrigins.length === 0) {
    problems.push(
      `CORS_ORIGINS is required when APP_ENV=${appEnv} (comma-separated origins, see docs/ENVIRONMENTS.md).`,
    );
  }

  const positiveInt = (variable: string, fallback: number): number => {
    const raw = env[variable];
    if (raw === undefined || raw === '') return fallback;
    if (!/^\d+$/.test(raw) || Number(raw) < 1) {
      problems.push(`${variable} must be a positive integer.`);
      return fallback;
    }
    return Number(raw);
  };
  const rateLimit = {
    max: positiveInt('RATE_LIMIT_MAX', DEFAULT_RATE_LIMIT.max),
    windowSeconds: positiveInt('RATE_LIMIT_WINDOW_SECONDS', DEFAULT_RATE_LIMIT.windowSeconds),
  };

  const gitCommit =
    env.RENDER_GIT_COMMIT === undefined || env.RENDER_GIT_COMMIT === ''
      ? null
      : env.RENDER_GIT_COMMIT;
  if (gitCommit !== null && !/^[0-9a-f]{7,40}$/.test(gitCommit)) {
    problems.push('RENDER_GIT_COMMIT must be a git commit hash (set by Render).');
  }

  if (problems.length > 0 || appEnv === undefined) throw new ConfigValidationError(problems);

  return {
    appEnv,
    port,
    databaseUrl,
    directUrl,
    corsOrigins: corsOrigins.length > 0 ? corsOrigins : DEFAULT_DEV_ORIGINS,
    logLevel: logLevel ?? DEFAULT_LOG_LEVEL[appEnv],
    rateLimit,
    gitCommit,
  };
}
