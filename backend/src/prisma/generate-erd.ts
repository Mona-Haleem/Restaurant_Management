// Writes docs/ERD.md from prisma/schema.prisma. Run with `npm run erd:generate`.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ERD_FILE, renderErd } from './erd';
import { parseSchema } from './schema-parser';

const backendDir = path.join(__dirname, '..', '..');
const schema = readFileSync(path.join(backendDir, 'prisma', 'schema.prisma'), 'utf8');
const file = path.join(backendDir, ERD_FILE);
writeFileSync(file, renderErd(parseSchema(schema)));
process.stdout.write(`Wrote ${file}\n`);
