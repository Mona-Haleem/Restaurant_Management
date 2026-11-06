import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

/**
 * Loads `.env`, or `.env.example` when there is no `.env`, into `env` (default `process.env`)
 * using Node's built-in dotenv parser. Variables already set (shell, CI, Render) always win.
 * Returns the file it loaded, or null.
 */
export function loadEnvFiles(
  dir: string,
  env: NodeJS.ProcessEnv = process.env,
): '.env' | '.env.example' | null {
  for (const file of ['.env', '.env.example'] as const) {
    const fullPath = path.join(dir, file);
    if (!existsSync(fullPath)) continue;
    const values = parseEnv(readFileSync(fullPath, 'utf8'));
    for (const [key, value] of Object.entries(values)) {
      if (env[key] === undefined && value !== undefined) env[key] = value;
    }
    return file;
  }
  return null;
}

/**
 * A hint for the most confusing case: a `.env` exists but has no APP_ENV, so `.env.example`
 * (which has one) is never read. Returns null when there is nothing to say.
 */
export function envFileHint(
  loaded: '.env' | '.env.example' | null,
  env: NodeJS.ProcessEnv,
): string | null {
  if (loaded !== '.env' || (env.APP_ENV !== undefined && env.APP_ENV !== '')) return null;
  return (
    'Loaded backend/.env, which does not set APP_ENV. .env.example is only read when there is ' +
    'no .env: add APP_ENV and the database URLs to .env (copy them from .env.example), or remove it.'
  );
}
