import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseSchema, type SchemaModel } from './schema-parser';

// B302: docs/MODEL-MAPPING.md maps each TABLZ-401 Angular model to its tables and columns.
// This test keeps the database side of that mapping honest: a renamed, dropped or added column
// fails here until the mapping (and, if needed, the Angular model) is updated.

const root = path.join(__dirname, '..', '..');
const schema = parseSchema(readFileSync(path.join(root, 'prisma', 'schema.prisma'), 'utf8'));
const mappingDoc = readFileSync(path.join(root, 'docs', 'MODEL-MAPPING.md'), 'utf8');

/** TABLZ-401 requirements, plus the workflow config it asks for (PRD §7.3, §9). */
const TABLZ_401_MODELS = [
  'User',
  'MenuItem',
  'Order',
  'OrderWorkflowConfig',
  'InventoryItem',
  'InventoryTransaction',
  'InventorySnapshot',
  'WasteEntry',
  'ReconciliationEntry',
];

interface Section {
  title: string;
  tables: string[];
  columnRefs: string[];
}

const backticked = (text: string): string[] =>
  [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? '');

/** `### <title>` sections under `## Mapping`, each with a `Tables:` line and a field table. */
function parseSections(doc: string): Section[] {
  const mapping = /^## Mapping\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(doc)?.[1] ?? '';
  return mapping
    .split(/^### /m)
    .slice(1)
    .map((block) => {
      const [title = '', ...lines] = block.split('\n');
      const tablesLine = lines.find((l) => l.startsWith('Tables:')) ?? '';
      const columnRefs = lines
        .filter((l) => l.startsWith('|'))
        .flatMap((row) => backticked(row.split('|')[2] ?? ''))
        .filter((ref) => /^[a-z_]+\.[a-z_]+$/.test(ref));
      return { title: title.trim(), tables: backticked(tablesLine), columnRefs };
    });
}

const sections = parseSections(mappingDoc);
const modelNames = new Set(schema.models.map((m) => m.name));
const tableByName = new Map(schema.models.map((m) => [m.dbName, m]));
const columnsOf = (model: SchemaModel): string[] =>
  model.fields.filter((f) => !f.list && !modelNames.has(f.type)).map((f) => f.dbName ?? f.name);

describe('MODEL-MAPPING.md', () => {
  it('has a section for every TABLZ-401 model', () => {
    expect(sections.map((s) => s.title)).toEqual(expect.arrayContaining(TABLZ_401_MODELS));
  });

  it('names a real table in every Tables: line', () => {
    for (const section of sections) {
      expect({ section: section.title, count: section.tables.length }).not.toEqual({
        section: section.title,
        count: 0,
      });
      for (const table of section.tables) {
        expect({ section: section.title, table, exists: tableByName.has(table) }).toEqual({
          section: section.title,
          table,
          exists: true,
        });
      }
    }
  });

  it('references only columns that exist in the schema', () => {
    for (const section of sections) {
      for (const ref of section.columnRefs) {
        const [table = '', column = ''] = ref.split('.');
        const model = tableByName.get(table);
        const exists = model !== undefined && columnsOf(model).includes(column);
        expect({ section: section.title, ref, exists }).toEqual({
          section: section.title,
          ref,
          exists: true,
        });
      }
    }
  });

  it('accounts for every column of the tables a section covers', () => {
    for (const section of sections) {
      for (const table of section.tables) {
        const model = tableByName.get(table);
        if (!model) continue;
        const missing = columnsOf(model).filter(
          (column) => !section.columnRefs.includes(`${table}.${column}`),
        );
        expect({ section: section.title, table, missing }).toEqual({
          section: section.title,
          table,
          missing: [],
        });
      }
    }
  });

  it('covers every table in the schema', () => {
    const covered = new Set(sections.flatMap((s) => s.tables));
    const uncovered = [...tableByName.keys()].filter((table) => !covered.has(table));
    expect(uncovered).toEqual([]);
  });

  it('records the deviations from PRD §7.3, §7.4 and §9', () => {
    expect(mappingDoc).toMatch(/^## Deviations\s*$/m);
  });
});
