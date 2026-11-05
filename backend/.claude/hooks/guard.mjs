#!/usr/bin/env node
// PreToolUse guard for Tablz API.
// Exit code 2 blocks the tool call and shows the message to Claude; exit 0 lets it through.
// Permission rules in settings.json stop the obvious forms; this catches variants they miss.

import { execFileSync } from 'node:child_process';
import path from 'node:path';

let raw = '';
for await (const chunk of process.stdin) raw += chunk;

let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}

const tool = input.tool_name;
const toolInput = input.tool_input ?? {};
const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();

function block(message) {
  process.stderr.write(`Blocked by .claude/hooks/guard.mjs: ${message}\n`);
  process.exit(2);
}

if (tool === 'Bash') {
  const cmd = String(toolInput.command ?? '');
  const rules = [
    [
      /\bprisma\s+db\s+push\b/,
      'use `prisma migrate dev` so every schema change is a committed migration (CLAUDE.md rule 6).',
    ],
    [/\bprisma\s+migrate\s+deploy\b/, '`migrate deploy` runs only in CI (CLAUDE.md rule 6).'],
    [
      /supabase\.(co|com)\b|pooler\.supabase/i,
      'commands must not reach Supabase; staging and production are CI-only (CLAUDE.md rule 7).',
    ],
    [
      /\bAPP_ENV\s*=\s*['"]?(staging|production)\b/,
      'never run anything with APP_ENV set to staging or production (CLAUDE.md rule 7).',
    ],
    [
      /\.env\.(staging|production|prod)\b/,
      'staging and production env files are off limits (CLAUDE.md rule 7).',
    ],
    [/\bgit\s+push\b.*(\s--force\b|\s-f\b|--force-with-lease)/, 'no force pushes.'],
    [
      /\bgit\s+push\b.*(\s|:)(main|master)(\s|$)/,
      'never push to main or master; push the ticket branch and open a PR.',
    ],
    [/\s--no-verify\b/, "don't skip git hooks; fix the failing check instead."],
  ];
  for (const [pattern, message] of rules) {
    if (pattern.test(cmd)) block(message);
  }
}

if (tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit') {
  const file = String(toolInput.file_path ?? '');
  const rel = path.relative(projectDir, path.resolve(projectDir, file)).split(path.sep).join('/');

  if (/^prisma\/migrations\/.+\/migration\.sql$/.test(rel)) {
    let committed = false;
    try {
      execFileSync('git', ['ls-files', '--error-unmatch', rel], {
        cwd: projectDir,
        stdio: 'ignore',
      });
      committed = true;
    } catch {
      // not tracked by git yet: a fresh migration created with --create-only, editing is fine
    }
    if (committed) {
      block(
        `${rel} is already committed. Never edit an applied migration; create a new one with \`prisma migrate dev\`.`,
      );
    }
  }
}

process.exit(0);
