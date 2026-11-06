/**
 * A small reader for prisma/schema.prisma, enough to check the schema rules in tests and to draw
 * the ERD. Not a full Prisma parser: it understands one field or attribute per line, which is
 * what `prisma format` produces.
 */

export interface SchemaRelation {
  name: string | undefined;
  fields: string[] | undefined;
  references: string[] | undefined;
  onDelete: string | undefined;
  onUpdate: string | undefined;
}

export interface SchemaField {
  name: string;
  type: string;
  optional: boolean;
  list: boolean;
  dbName: string | undefined;
  nativeType: string | undefined;
  attributes: string;
  relation: SchemaRelation | undefined;
}

export interface SchemaModel {
  name: string;
  dbName: string;
  doc: string | undefined;
  fields: SchemaField[];
  uniques: string[][];
  indexes: string[][];
}

export interface SchemaEnum {
  name: string;
  values: string[];
  dbName: string | undefined;
}

export interface ParsedSchema {
  models: SchemaModel[];
  enums: SchemaEnum[];
}

const BLOCK = /(?:((?:^\s*\/\/\/.*\n)+))?^(model|enum)\s+(\w+)\s*\{([\s\S]*?)^\}/gm;

function list(source: string | undefined): string[] | undefined {
  if (source === undefined) return undefined;
  return source
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function columnsOf(attribute: string): string[] {
  const inside = /\(\s*\[([^\]]*)\]/.exec(attribute)?.[1] ?? '';
  return (list(inside) ?? []).map((c) => c.replace(/\(.*$/, ''));
}

function parseRelation(attributes: string): SchemaRelation | undefined {
  const match = /@relation\(([^)]*(?:\([^)]*\)[^)]*)*)\)/.exec(attributes);
  if (!match) return undefined;
  const args = match[1] ?? '';
  return {
    name: /^\s*"([^"]+)"/.exec(args)?.[1] ?? /name:\s*"([^"]+)"/.exec(args)?.[1],
    fields: list(/fields:\s*\[([^\]]*)\]/.exec(args)?.[1]),
    references: list(/references:\s*\[([^\]]*)\]/.exec(args)?.[1]),
    onDelete: /onDelete:\s*(\w+)/.exec(args)?.[1],
    onUpdate: /onUpdate:\s*(\w+)/.exec(args)?.[1],
  };
}

function parseField(line: string): SchemaField | undefined {
  const match = /^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/.exec(line);
  if (!match) return undefined;
  const [, name = '', type = '', isList, isOptional, attributes = ''] = match;
  return {
    name,
    type,
    optional: isOptional === '?',
    list: isList === '[]',
    dbName: /@map\("([^"]+)"\)/.exec(attributes)?.[1],
    nativeType: /@db\.(\w+(?:\([^)]*\))?)/.exec(attributes)?.[1],
    attributes,
    relation: parseRelation(attributes),
  };
}

export function parseSchema(source: string): ParsedSchema {
  const models: SchemaModel[] = [];
  const enums: SchemaEnum[] = [];

  for (const block of source.matchAll(BLOCK)) {
    const [, docLines, kind, name = '', body = ''] = block;
    const lines = body
      .split('\n')
      .map((l) => l.replace(/\/\/.*$/, '').trim())
      .filter(Boolean);
    const blockMap = /@@map\("([^"]+)"\)/.exec(body)?.[1];

    if (kind === 'enum') {
      enums.push({ name, values: lines.filter((l) => !l.startsWith('@@')), dbName: blockMap });
      continue;
    }

    const model: SchemaModel = {
      name,
      dbName: blockMap ?? name,
      doc: docLines
        ?.split('\n')
        .map((l) => l.replace(/^\s*\/\/\/\s?/, '').trim())
        .filter(Boolean)
        .join(' '),
      fields: [],
      uniques: [],
      indexes: [],
    };
    for (const line of lines) {
      if (line.startsWith('@@unique')) model.uniques.push(columnsOf(line));
      else if (line.startsWith('@@index')) model.indexes.push(columnsOf(line));
      else if (line.startsWith('@@map')) continue;
      else {
        // Anything else must be a field this parser understands: a silent skip could let a
        // table break a rule and still pass the schema tests.
        const field = line.startsWith('@@') ? undefined : parseField(line);
        if (!field || !/^[A-Z]\w*$/.test(field.type) || /Unsupported\(/.test(line)) {
          throw new Error(`schema-parser: unrecognised line in model ${name}: ${line}`);
        }
        model.fields.push(field);
        // A field-level @unique is an index too (not @id: the primary key is checked apart).
        if (/@unique\b/.test(field.attributes)) model.uniques.push([field.name]);
      }
    }
    models.push(model);
  }
  return { models, enums };
}
