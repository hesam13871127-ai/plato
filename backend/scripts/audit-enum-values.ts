import 'reflect-metadata';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { entities } from '../src/database/entities';
import { SnakeNamingStrategy } from '../src/database/snake-naming.strategy';

/**
 * Audits ENUM-value parity between the TS domain unions (src/database/enums.ts
 * — what the application can write) and the MySQL DDL ENUM declarations in
 * database/schema.sql (what the database accepts).
 *
 * A union value missing from the DDL ENUM fails every insert with
 * `Data truncated for column …` on MySQL, while SQLite tests keep passing
 * because the test schema stores plain varchars. This check closes that gap.
 *
 * Usage:  npx ts-node scripts/audit-enum-values.ts   (from backend/)
 * Exit code 1 on any hard failure.
 */

interface ColumnDef {
  kind: 'enum' | 'varchar';
  values: string[];
  length: number;
}

function parseSchemaEnums(sql: string): Map<string, ColumnDef> {
  const columns = new Map<string, ColumnDef>();
  let table = '';
  for (const rawLine of sql.split('\n')) {
    const line = rawLine.replace(/--.*$/, '').trim();
    const tableMatch = line.match(/^CREATE TABLE (?:IF NOT EXISTS )?`?([A-Za-z0-9_]+)`?/);
    if (tableMatch) {
      table = tableMatch[1].toLowerCase();
      continue;
    }
    if (!table || !line) continue;
    if (/^(PRIMARY KEY|UNIQUE|KEY|INDEX|CONSTRAINT|FOREIGN KEY|FULLTEXT|SPATIAL|CHECK|\))/i.test(line)) {
      continue;
    }
    const colMatch = line.match(/^`?([A-Za-z0-9_]+)`?\s+(ENUM|VARCHAR)/i);
    if (!colMatch) continue;
    const column = colMatch[1].toLowerCase();
    const type = colMatch[2].toUpperCase();
    if (type === 'ENUM') {
      const values = [...line.matchAll(/'([^']*)'/g)].map((m) => m[1]);
      columns.set(`${table}.${column}`, { kind: 'enum', values, length: 0 });
    } else {
      const len = line.match(/VARCHAR\((\d+)\)/i);
      columns.set(`${table}.${column}`, { kind: 'varchar', values: [], length: len ? Number(len[1]) : 0 });
    }
  }
  return columns;
}

function parseUnions(enumsSource: string): Map<string, string[]> {
  const unions = new Map<string, string[]>();
  for (const match of enumsSource.matchAll(/export type (\w+)\s*=\s*([^;]+);/g)) {
    const [, name, body] = match;
    const values = [...body.matchAll(/'([^']*)'/g)].map((m) => m[1]);
    if (values.length > 0) unions.set(name, values);
  }
  return unions;
}

async function main(): Promise<void> {
  const enumsSource = readFileSync(join(__dirname, '..', 'src', 'database', 'enums.ts'), 'utf8');
  const unions = parseUnions(enumsSource);

  const schemaSql = readFileSync(join(__dirname, '..', '..', 'database', 'schema.sql'), 'utf8');
  const ddl = parseSchemaEnums(schemaSql);

  const ds = new DataSource({
    type: 'sqljs',
    location: ':memory:',
    autoSave: false,
    entities,
    synchronize: false,
    namingStrategy: new SnakeNamingStrategy(),
  });
  await ds.initialize();

  // propertyName → { table, column } straight from the ORM metadata.
  const propToColumn = new Map<string, { table: string; column: string }>();
  for (const meta of ds.entityMetadatas) {
    for (const column of meta.columns) {
      propToColumn.set(`${meta.targetName}.${column.propertyName}`, {
        table: meta.tableName.toLowerCase(),
        column: column.databaseName.toLowerCase(),
      });
    }
  }

  // Property type annotations from the entity sources.
  const entityDir = join(__dirname, '..', 'src', 'database', 'entities');
  let failures = 0;
  let checks = 0;

  for (const file of readdirSync(entityDir).filter((f) => f.endsWith('.entity.ts'))) {
    const source = readFileSync(join(entityDir, file), 'utf8');
    const classMatch = source.match(/export class (\w+)/);
    if (!classMatch) continue;
    const className = classMatch[1];
    for (const match of source.matchAll(/^\s{2}(\w+):\s*([A-Z]\w+)(?:\s*\|\s*null)?;\s*$/gm)) {
      const [, propertyName, typeName] = match;
      const unionValues = unions.get(typeName);
      if (!unionValues) continue; // not a domain union (Date, string, …)

      const target = propToColumn.get(`${className}.${propertyName}`);
      if (!target) continue;

      const columnDef = ddl.get(`${target.table}.${target.column}`);
      if (!columnDef) continue;

      checks += 1;
      if (columnDef.kind === 'enum') {
        const missing = unionValues.filter((v) => !columnDef.values.includes(v));
        if (missing.length > 0) {
          console.error(
            `✗ ${target.table}.${target.column}: ${typeName} value(s) rejected by the DDL ENUM: ` +
              `${missing.join(', ')} — writes fail with 'Data truncated' on MySQL`,
          );
          failures += 1;
        }
        const extra = columnDef.values.filter((v) => !unionValues.includes(v));
        if (extra.length > 0) {
          console.warn(
            `· ${target.table}.${target.column}: DDL-only ENUM value(s) never written by the app: ${extra.join(', ')}`,
          );
        }
      } else {
        const longest = unionValues.reduce((max, v) => Math.max(max, v.length), 0);
        if (longest > columnDef.length) {
          console.error(
            `✗ ${target.table}.${target.column}: ${typeName} value(s) exceed VARCHAR(${columnDef.length}): ` +
              `longest is ${longest} chars`,
          );
          failures += 1;
        }
      }
    }
  }

  await ds.destroy();

  if (failures > 0) {
    console.error(`\n${failures} ENUM/VARCHAR parity failure(s) after ${checks} checks.`);
    process.exit(1);
  }
  console.log(`\nENUM ↔ TS-union parity OK: ${checks} typed columns checked against the DDL.`);
}

void main();
