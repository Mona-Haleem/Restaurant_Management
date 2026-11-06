import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ERD_FILE, renderErd } from './erd';
import { parseSchema } from './schema-parser';

const backendDir = path.join(__dirname, '..', '..');

describe('renderErd', () => {
  const sample = parseSchema(`
enum Unit {
  G
  KG
}
model Tenant {
  id String @id @db.Uuid
  @@map("tenants")
}
model Branch {
  id       String @id @db.Uuid
  tenantId String @map("tenant_id") @db.Uuid
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  @@unique([tenantId, id])
  @@map("branches")
}
model Stock {
  id       String  @id @db.Uuid
  tenantId String  @map("tenant_id") @db.Uuid
  branchId String? @map("branch_id") @db.Uuid
  qty      Decimal @db.Decimal(14, 3)
  unit     Unit
  branch   Branch? @relation(fields: [tenantId, branchId], references: [tenantId, id], onDelete: Restrict)
  @@map("stock")
}
`);
  const erd = renderErd(sample);

  it('draws foreign keys except the tenant edges', () => {
    expect(erd).toContain('  branches |o--o{ stock : "branchId"');
    expect(erd).not.toContain('tenants ||--o{');
  });

  it('lists columns with types and keys', () => {
    expect(erd).toContain('    uuid branch_id FK "nullable"');
    expect(erd).toContain('    Decimal_14_3 qty');
    expect(erd).toContain('    uuid id PK');
    expect(erd).toContain('| `Unit` | `G`, `KG` |');
  });
});

describe('docs/ERD.md', () => {
  it('matches prisma/schema.prisma (run `npm run erd:generate` after changing the schema)', () => {
    const schema = readFileSync(path.join(backendDir, 'prisma', 'schema.prisma'), 'utf8');
    const committed = readFileSync(path.join(backendDir, ERD_FILE), 'utf8');
    expect(renderErd(parseSchema(schema))).toBe(committed);
  });
});
