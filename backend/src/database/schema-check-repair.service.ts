import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';

/**
 * CHECK-constraint reconciliation for the MySQL driver family.
 *
 * Why this exists: TypeORM 0.3.x deliberately skips check constraints on the
 * MySQL family (`createNewChecks` / `dropOldChecks` early-return with the
 * comment "Mysql does not support check constraints"). Consequences:
 *
 *  1. A database created before the entity-only era (by the old
 *     `database/schema.sql`) keeps its OLD check expressions forever —
 *     `synchronize` never rewrites a check that already exists, so a stale
 *     strict `chk_users_phone_or_identity` (no bot exemption) kept rejecting
 *     bot seed rows that the current metadata allows.
 *  2. Fresh MySQL databases never get the invariants the `@Check` metadata
 *     declares (SQLite test databases do), so DB-level enforcement differed
 *     between environments.
 *
 * This service closes both gaps. On every boot, after `synchronize` has run,
 * it reads the stored `CREATE TABLE` statements and reconciles them with the
 * entity metadata — the single source of truth:
 *
 *   - metadata check missing in DB            -> ADD CONSTRAINT ... CHECK
 *   - metadata check present, different text  -> DROP CHECK + re-ADD
 *   - stored `chk_*` check not in metadata    -> DROP CHECK (leftover)
 *   - anything else (foreign keys, MariaDB's automatic JSON checks, ...)
 *     is never touched.
 *
 * Stored clauses are compared by their canonical AST, not by their text:
 * MySQL rewrites stored clauses (lowercased keywords, backticked
 * identifiers, extra wrapping parentheses), so a text diff would produce
 * false mismatches. The connection goes through the shared TypeORM
 * `DataSource` only — the project's single database path. The SQLite test
 * driver is a no-op: its in-memory database is rebuilt from scratch on every
 * boot, so a stale check can never accumulate.
 */

export interface StoredCheck {
  name: string;
  /** Clause exactly as stored in the database (driver formatting). */
  expression: string;
}

export interface ExpectedCheck {
  name: string;
  /** Expression from the `@Check` decorator metadata. */
  expression: string;
}

export interface TableCheckPlan {
  tableName: string;
  /** Combined `ALTER TABLE ...` statement, or undefined when in sync. */
  sql?: string;
  /** Human-readable change list for logging. */
  changes: string[];
}

/**
 * Extracts the CHECK constraints from a MySQL `SHOW CREATE TABLE` statement.
 * Uses a balanced-parenthesis scan so expressions may contain nested
 * parentheses (MySQL wraps the stored clause in its own parentheses, often
 * doubled: `CHECK ((expr))`).
 */
export function parseStoredChecks(createTableSql: string): StoredCheck[] {
  const checks: StoredCheck[] = [];
  const pattern = /CONSTRAINT\s+`?([A-Za-z0-9_$]+)`?\s+CHECK/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(createTableSql)) !== null) {
    const open = createTableSql.indexOf('(', pattern.lastIndex);
    if (open === -1) break;
    let depth = 0;
    let close = -1;
    for (let i = open; i < createTableSql.length; i += 1) {
      const ch = createTableSql[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') {
        depth -= 1;
        if (depth === 0) {
          close = i;
          break;
        }
      }
    }
    if (close === -1) break;
    checks.push({
      name: match[1],
      expression: createTableSql.slice(open + 1, close),
    });
    pattern.lastIndex = close + 1;
  }
  return checks;
}

type Token =
  | { kind: 'id'; value: string }
  | { kind: 'num'; value: string }
  | { kind: 'op'; value: string }
  | { kind: 'lp' }
  | { kind: 'rp' };

const OP_NAMES: Record<string, string> = {
  '=': 'EQ',
  '<>': 'NE',
  '!=': 'NE',
  '>=': 'GTE',
  '<=': 'LTE',
  '<': 'LT',
  '>': 'GT',
};

function tokenize(expression: string): Token[] {
  const s = expression.replace(/`/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  const tokens: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === ' ') {
      i += 1;
      continue;
    }
    if (ch === '(') {
      tokens.push({ kind: 'lp' });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ kind: 'rp' });
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j += 1;
      tokens.push({ kind: 'num', value: s.slice(i, j) });
      i = j;
      continue;
    }
    const two = s.slice(i, i + 2);
    if (two === '>=' || two === '<=' || two === '<>' || two === '!=') {
      tokens.push({ kind: 'op', value: two });
      i += 2;
      continue;
    }
    if (ch === '=' || ch === '<' || ch === '>' || ch === '+') {
      tokens.push({ kind: 'op', value: ch });
      i += 1;
      continue;
    }
    let j = i;
    while (j < s.length && /[A-Z0-9_]/.test(s[j])) j += 1;
    if (j === i) throw new Error(`unexpected character "${ch}"`);
    tokens.push({ kind: 'id', value: s.slice(i, j) });
    i = j;
  }
  return tokens;
}

/**
 * Canonical form of a boolean check expression: an AST serialisation
 * (e.g. `OR(ISNOTNULL(PHONE),EQ(IS_BOT,1))`) that is identical for
 * semantically identical expressions regardless of case, backticks,
 * whitespace or redundant parentheses — exactly the formatting differences
 * MySQL applies to stored clauses.
 *
 * Returns null when the expression cannot be parsed (callers then fall back
 * to a conservative text comparison).
 */
export function normalizeCheckExpression(raw: string): string | null {
  try {
    const tokens = tokenize(raw);
    let pos = 0;

    const peek = (): Token | undefined => tokens[pos];
    const isId = (value: string): boolean => {
      const t = peek();
      return t?.kind === 'id' && t.value === value;
    };
    const eatId = (value: string): boolean => {
      if (isId(value)) {
        pos += 1;
        return true;
      }
      return false;
    };

    const parseOr = (): string => {
      const parts = [parseAnd()];
      while (isId('OR')) {
        pos += 1;
        parts.push(parseAnd());
      }
      return parts.length === 1 ? parts[0] : `OR(${parts.join(',')})`;
    };
    const parseAnd = (): string => {
      const parts = [parseNot()];
      while (isId('AND')) {
        pos += 1;
        parts.push(parseNot());
      }
      return parts.length === 1 ? parts[0] : `AND(${parts.join(',')})`;
    };
    const parseNot = (): string => {
      if (isId('NOT')) {
        pos += 1;
        return `NOT(${parseNot()})`;
      }
      return parsePrimary();
    };
    const parsePrimary = (): string => {
      if (peek()?.kind === 'lp') {
        pos += 1;
        const inner = parseOr();
        if (peek()?.kind !== 'rp') throw new Error('unbalanced parentheses');
        pos += 1;
        return inner;
      }
      return parseComparison();
    };
    const parseTerm = (): string => {
      const t = tokens[pos];
      if (!t || (t.kind !== 'id' && t.kind !== 'num')) {
        throw new Error('unexpected token in term');
      }
      pos += 1;
      let value = t.value;
      let op = peek();
      while (op?.kind === 'op' && op.value === '+') {
        pos += 1;
        const t2 = tokens[pos];
        if (!t2 || (t2.kind !== 'id' && t2.kind !== 'num')) {
          throw new Error('dangling +');
        }
        pos += 1;
        value = `PLUS(${value},${t2.value})`;
        op = peek();
      }
      return value;
    };
    const parseComparison = (): string => {
      const left = parseTerm();
      const t = peek();
      if (t?.kind === 'op' && t.value !== '+') {
        pos += 1;
        const right = parseTerm();
        return `${OP_NAMES[t.value]}(${left},${right})`;
      }
      if (isId('IS')) {
        pos += 1;
        const not = eatId('NOT');
        if (!eatId('NULL')) throw new Error('expected NULL after IS');
        return not ? `ISNOTNULL(${left})` : `ISNULL(${left})`;
      }
      if (isId('BETWEEN')) {
        pos += 1;
        const lo = parseTerm();
        if (!eatId('AND')) throw new Error('expected AND in BETWEEN');
        const hi = parseTerm();
        return `BETWEEN(${left},${lo},${hi})`;
      }
      return left;
    };

    const canonical = parseOr();
    if (pos !== tokens.length) {
      throw new Error('trailing tokens');
    }
    return canonical;
  } catch {
    return null;
  }
}

/**
 * Conservative text fallback when an expression cannot be parsed: case,
 * backticks, whitespace and whole-expression wrapping parentheses are
 * neutralised before comparison.
 */
function normalizeCheckExpressionFallback(raw: string): string {
  let s = raw.replace(/`/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  for (;;) {
    if (!s.startsWith('(') || !s.endsWith(')')) break;
    let depth = 0;
    let wrapsWhole = false;
    for (let i = 0; i < s.length; i += 1) {
      const ch = s[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') {
        depth -= 1;
        if (depth === 0) {
          wrapsWhole = i === s.length - 1;
          break;
        }
      }
    }
    if (!wrapsWhole) break;
    s = s.slice(1, -1).trim();
  }
  return s;
}

/** True when two check expressions are semantically identical. */
export function sameCheckExpression(a: string, b: string): boolean {
  const ca = normalizeCheckExpression(a);
  const cb = normalizeCheckExpression(b);
  if (ca !== null && cb !== null) return ca === cb;
  return normalizeCheckExpressionFallback(a) === normalizeCheckExpressionFallback(b);
}

const escapeIdentifier = (name: string): string =>
  name.replace(/`/g, '``');

/**
 * Decides what to do for one table. Pure function — easy to unit test
 * against the exact stale-schema scenario.
 */
export function planTableCheckRepairs(
  tableName: string,
  stored: StoredCheck[],
  expected: ExpectedCheck[],
): TableCheckPlan {
  const storedByName = new Map(stored.map((c) => [c.name, c]));
  const clauses: string[] = [];
  const changes: string[] = [];
  const seenExpected = new Set<string>();

  for (const check of expected) {
    seenExpected.add(check.name);
    const existing = storedByName.get(check.name);
    if (!existing) {
      clauses.push(
        `ADD CONSTRAINT \`${escapeIdentifier(check.name)}\` CHECK (${check.expression})`,
      );
      changes.push(`added ${check.name}`);
      continue;
    }
    if (sameCheckExpression(existing.expression, check.expression)) {
      continue; // in sync
    }
    clauses.push(
      `DROP CHECK \`${escapeIdentifier(check.name)}\`, ADD CONSTRAINT \`${escapeIdentifier(check.name)}\` CHECK (${check.expression})`,
    );
    changes.push(`updated ${check.name}`);
  }

  // Leftover checks from the old schema.sql era (our `chk_*` naming
  // convention). Anything else — foreign keys, MariaDB automatic checks —
  // is never dropped.
  for (const check of stored) {
    if (check.name.startsWith('chk_') && !seenExpected.has(check.name)) {
      clauses.push(`DROP CHECK \`${escapeIdentifier(check.name)}\``);
      changes.push(`dropped stale ${check.name}`);
    }
  }

  if (clauses.length === 0) return { tableName, changes };
  return {
    tableName,
    sql: `ALTER TABLE \`${escapeIdentifier(tableName)}\` ${clauses.join(', ')}`,
    changes,
  };
}

@Injectable()
export class SchemaCheckRepairService implements OnModuleInit {
  private readonly logger = new Logger(SchemaCheckRepairService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Runs right after `synchronize`, before any bootstrap seeding. */
  async onModuleInit(): Promise<void> {
    await this.repairCheckConstraints();
  }

  /**
   * Reconciles stored CHECK constraints with the entity metadata. Never
   * crashes the boot: a failure is logged and the app continues (the
   * application layer upholds the invariants in any case).
   */
  async repairCheckConstraints(): Promise<void> {
    const type = this.dataSource.driver?.options?.type;
    if (type !== 'mysql' && type !== 'mariadb') return; // sqljs: fresh in-memory DB each boot

    if (!this.dataSource.isInitialized) {
      await this.dataSource.initialize();
    }

    try {
      const expected = this.dataSource.entityMetadatas
        .filter((metadata) => metadata.checks.length > 0)
        .map((metadata) => ({
          tableName: metadata.tableName,
          checks: metadata.checks.map((check) => ({
            name: check.name,
            expression: check.expression,
          })),
        }));
      if (expected.length === 0) return;

      const plans: TableCheckPlan[] = [];
      for (const table of expected) {
        const rows = await this.dataSource.query(
          `SHOW CREATE TABLE \`${escapeIdentifier(table.tableName)}\``,
        );
        const row = Array.isArray(rows) ? rows[0] : rows;
        const createSql: string =
          row?.['Create Table'] ?? row?.['Create View'] ?? '';
        const stored = parseStoredChecks(createSql);
        const plan = planTableCheckRepairs(table.tableName, stored, table.checks);
        if (plan.sql) plans.push(plan);
      }

      for (const plan of plans) {
        await this.dataSource.query(plan.sql as string);
        this.logger.log(`${plan.tableName}: ${plan.changes.join('; ')}`);
      }
      if (plans.length === 0) {
        this.logger.log(
          `check constraints in sync with entity metadata (${expected.length} tables)`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `check-constraint repair skipped: ${(error as Error).message}`,
      );
    }
  }
}
