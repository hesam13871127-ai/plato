import 'reflect-metadata';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { entities } from '../src/database/entities';
import { SnakeNamingStrategy } from '../src/database/snake-naming.strategy';

/**
 * Audits the parity between TypeORM entity metadata (after the
 * SnakeNamingStrategy — i.e. exactly the column names the ORM will address on
 * MySQL) and the canonical DDL: database/schema.sql plus every CREATE TABLE
 * inside the later migrations.
 *
 * Usage:  npx ts-node scripts/audit-entity-schema.ts   (from backend/)
 * Exit code 1 on any mismatch, so it can be wired into CI.
 */

interface TableDef {
  columns: string[];
  source: string;
}

function parseCreateTables(sql: string, source: string): Map<string, TableDef> {
  const tables = new Map<string, TableDef>();
  // In migration sources the DDL lives inside template literals, where
  // backticks are escaped, so allow an optional backslash before/after them.
  const re =
    /CREATE TABLE (?:IF NOT EXISTS )?(?:\\)?`?([A-Za-z0-9_]+)(?:\\)?`?\s*\(([\s\S]*?)\n\s*\)/g;
  for (const match of sql.matchAll(re)) {
    const [, name, body] = match;
    const columns: string[] = [];
    let depth = 0;
    let inConstraint = false;
    for (const rawLine of body.split('\n')) {
      const line = rawLine.replace(/--.*$/, '').trim();
      if (!line) continue;
      if (!inConstraint) {
        if (
          /^(PRIMARY KEY|UNIQUE|KEY|INDEX|CONSTRAINT|FOREIGN KEY|FULLTEXT|SPATIAL|CHECK)\b/i.test(
            line,
          )
        ) {
          inConstraint = true;
        } else {
          const col = line.match(/^(?:\\)?`?([A-Za-z0-9_]+)(?:\\)?`?/);
          if (col) columns.push(col[1].toLowerCase());
        }
      }
      depth += (line.match(/\(/g) ?? []).length - (line.match(/\)/g) ?? []).length;
      if (inConstraint && depth <= 0) inConstraint = false;
    }
    tables.set(name.toLowerCase(), { columns, source });
  }
  return tables;
}

async function main(): Promise<void> {
  const ddl = parseCreateTables(
    readFileSync(join(__dirname, '..', '..', 'database', 'schema.sql'), 'utf8'),
    'schema.sql',
  );

  const migrationsDir = join(__dirname, '..', 'src', 'database', 'migrations');
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.ts'))) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    for (const [name, def] of parseCreateTables(sql, file)) {
      if (!ddl.has(name)) ddl.set(name, def);
    }
  }

  const ds = new DataSource({
    type: 'sqljs',
    location: ':memory:',
    autoSave: false,
    entities,
    synchronize: false,
    namingStrategy: new SnakeNamingStrategy(),
  });
  await ds.initialize();

  let failures = 0;

  for (const meta of ds.entityMetadatas) {
    const table = meta.tableName.toLowerCase();
    const def = ddl.get(table);
    const entityCols = meta.columns.map((c) => c.databaseName.toLowerCase());

    if (!def) {
      console.error(`✗ table \`${table}\` has an entity but no CREATE TABLE in any DDL source`);
      failures += 1;
      continue;
    }

    const missing = entityCols.filter((c) => !def.columns.includes(c));
    const extra = def.columns.filter((c) => !entityCols.includes(c));

    if (missing.length > 0) {
      console.error(
        `✗ \`${table}\` (${def.source}): entity columns with no DDL column: ${missing.join(', ')}`,
      );
      failures += 1;
    }
    if (extra.length > 0) {
      console.warn(`· \`${table}\` (${def.source}): DDL-only columns (ok if app-managed): ${extra.join(', ')}`);
    }
  }

  const entityTables = new Set(ds.entityMetadatas.map((m) => m.tableName.toLowerCase()));
  for (const [name, def] of ddl) {
    if (!entityTables.has(name)) {
      console.warn(`· table \`${name}\` (${def.source}) has no entity (ok if DDL-only)`);
    }
  }

  await ds.destroy();

  if (failures > 0) {
    console.error(`\n${failures} table(s) FAILED the parity audit.`);
    process.exit(1);
  }
  console.log(`\nEntity ↔ DDL parity OK: ${ds.entityMetadatas.length} entities checked.`);
}

void main();
