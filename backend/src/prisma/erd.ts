import type { ParsedSchema, SchemaField, SchemaModel } from './schema-parser';

/** Generated file; regenerate with `npm run erd:generate`. */
export const ERD_FILE = 'docs/ERD.md';

const SCALAR_TYPES = new Set(['String', 'Int', 'BigInt', 'Boolean', 'DateTime', 'Decimal', 'Json']);

function columnType(field: SchemaField, enumNames: Set<string>): string {
  if (field.type === 'Decimal' && field.nativeType)
    return field.nativeType.replace(/[(), ]+/g, '_').replace(/_$/, '');
  if (field.nativeType === 'Uuid') return 'uuid';
  if (enumNames.has(field.type)) return field.type;
  return field.type;
}

function isForeignKey(model: SchemaModel, column: string): boolean {
  return model.fields.some((f) => f.relation?.fields?.includes(column) && column !== 'tenantId');
}

function isOneToOne(model: SchemaModel, fields: readonly string[]): boolean {
  const key = [...fields].join(',');
  return (
    model.uniques.some((u) => u.join(',') === key) ||
    (fields.length === 1 &&
      model.fields.some((f) => f.name === fields[0] && /@unique\b/.test(f.attributes)))
  );
}

/**
 * Mermaid ER diagram of the schema. Every tenant-owned table also references `tenants`
 * through tenant_id; those edges are left out so the diagram stays readable.
 */
export function renderErd(schema: ParsedSchema): string {
  const enumNames = new Set(schema.enums.map((e) => e.name));
  const tableOf = new Map(schema.models.map((m) => [m.name, m.dbName]));
  const lines: string[] = ['erDiagram'];

  for (const model of schema.models) {
    for (const rel of model.fields.filter((f) => f.relation?.fields)) {
      if (rel.type === 'Tenant') continue;
      const fields = rel.relation?.fields ?? [];
      const own = fields.filter((f) => f !== 'tenantId');
      const left = rel.optional ? '|o' : '||';
      const right = isOneToOne(model, fields) ? 'o|' : 'o{';
      lines.push(
        `  ${tableOf.get(rel.type)} ${left}--${right} ${model.dbName} : "${own.join(', ')}"`,
      );
    }
  }

  for (const model of schema.models) {
    lines.push(`  ${model.dbName} {`);
    for (const field of model.fields) {
      if (!SCALAR_TYPES.has(field.type) && !enumNames.has(field.type)) continue;
      if (field.list) continue;
      const keys = [
        field.name === 'id' ? 'PK' : undefined,
        isForeignKey(model, field.name) ? 'FK' : undefined,
      ].filter(Boolean);
      const column = field.dbName ?? field.name;
      const note = field.optional ? ' "nullable"' : '';
      lines.push(
        `    ${columnType(field, enumNames)} ${column}${keys.length ? ` ${keys.join(', ')}` : ''}${note}`,
      );
    }
    lines.push('  }');
  }

  const enums = schema.enums.map(
    (e) => `| \`${e.name}\` | ${e.values.map((v) => `\`${v}\``).join(', ')} |`,
  );

  return [
    '# Entity–relationship diagram',
    '',
    '<!-- Generated from prisma/schema.prisma by `npm run erd:generate`. Do not edit by hand. -->',
    '',
    'Every tenant-owned table also has `tenant_id` → `tenants.id`, and every foreign key between',
    'tenant-owned tables is composite `(tenant_id, …)`. Those `tenants` edges are omitted for',
    'readability. Rules and CHECK constraints: [SCHEMA.md](SCHEMA.md).',
    '',
    '```mermaid',
    ...lines,
    '```',
    '',
    '## Enums',
    '',
    '| Enum | Values |',
    '| --- | --- |',
    ...enums,
    '',
  ].join('\n');
}
