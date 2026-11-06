import { parseSchema } from './schema-parser';

const SAMPLE = `
// comment
enum Unit {
  G
  KG
  @@map("unit")
}

/// A tenant.
model Tenant {
  id        String   @id @default(uuid()) @db.Uuid
  slug      String   @unique
  branches  Branch[]

  @@map("tenants")
}

model Branch {
  id       String @id @default(uuid()) @db.Uuid
  tenantId String @map("tenant_id") @db.Uuid
  price    Decimal? @db.Decimal(12, 2)
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Restrict)

  @@unique([tenantId, id])
  @@index([tenantId, price], map: "x")
  @@map("branches")
}
`;

describe('parseSchema', () => {
  const schema = parseSchema(SAMPLE);

  it('reads enums', () => {
    expect(schema.enums).toEqual([{ name: 'Unit', values: ['G', 'KG'], dbName: 'unit' }]);
  });

  it('reads models, their table names and doc comments', () => {
    expect(schema.models.map((m) => [m.name, m.dbName])).toEqual([
      ['Tenant', 'tenants'],
      ['Branch', 'branches'],
    ]);
    expect(schema.models[0]?.doc).toBe('A tenant.');
  });

  it('reads scalar fields with type, optionality, list, column name and native type', () => {
    const branch = schema.models[1];
    expect(branch?.fields.find((f) => f.name === 'tenantId')).toMatchObject({
      type: 'String',
      optional: false,
      list: false,
      dbName: 'tenant_id',
      nativeType: 'Uuid',
    });
    expect(branch?.fields.find((f) => f.name === 'price')).toMatchObject({
      type: 'Decimal',
      optional: true,
      nativeType: 'Decimal(12, 2)',
    });
    expect(schema.models[0]?.fields.find((f) => f.name === 'branches')).toMatchObject({
      type: 'Branch',
      list: true,
    });
  });

  it('reads relations', () => {
    expect(schema.models[1]?.fields.find((f) => f.name === 'tenant')?.relation).toEqual({
      name: undefined,
      fields: ['tenantId'],
      references: ['id'],
      onDelete: 'Restrict',
      onUpdate: undefined,
    });
  });

  it('reads block attributes', () => {
    expect(schema.models[1]?.uniques).toEqual([['tenantId', 'id']]);
    expect(schema.models[1]?.indexes).toEqual([['tenantId', 'price']]);
  });

  it('counts a field-level @unique as a unique index', () => {
    expect(schema.models[0]?.uniques).toEqual([['slug']]);
  });

  it.each([
    ['an @@id block attribute', '  @@id([a, b])'],
    ['an Unsupported type', '  geo Unsupported("geometry")'],
    ['a line it cannot read', '  this is not a field'],
  ])('refuses %s instead of silently skipping it', (_label, line) => {
    expect(() => parseSchema(`model X {\n  id String @id\n${line}\n}\n`)).toThrow(
      /unrecognised line in model X/,
    );
  });
});
