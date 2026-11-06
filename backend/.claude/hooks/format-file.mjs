#!/usr/bin/env node
// PostToolUse: format the file Claude just edited with the project's own Prettier.
// Does nothing until Prettier is installed (before B101), so it never gets in the way.

import { existsSync, readFileSync } from 'node:fs';
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

const file = String(input.tool_input?.file_path ?? '');
if (!/\.(ts|mts|cts|js|mjs|cjs|json)$/.test(file)) process.exit(0);

const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const pkgPath = path.join(projectDir, 'node_modules', 'prettier', 'package.json');
if (!existsSync(pkgPath)) process.exit(0);

let binRel;
try {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  binRel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.prettier;
} catch {
  process.exit(0);
}
if (!binRel) process.exit(0);

try {
  execFileSync(process.execPath, [path.join(path.dirname(pkgPath), binRel), '--write', file], {
    cwd: projectDir,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
} catch (error) {
  // Prettier fails on syntax errors: tell Claude so it fixes the file.
  const detail = error.stderr ? String(error.stderr).trim() : String(error.message);
  process.stderr.write(`Prettier could not format ${file}:\n${detail}\n`);
  process.exit(2);
}

process.exit(0);
