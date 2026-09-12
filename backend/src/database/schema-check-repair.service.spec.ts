import { SchemaCheckRepairService } from './schema-check-repair.service';
import {
  normalizeCheckExpression,
  parseStoredChecks,
  planTableCheckRepairs,
  sameCheckExpression,
} from './schema-check-repair.service';

/**
 * A realistic `SHOW CREATE TABLE` excerpt: the OLD strict check from the
 * legacy schema.sql era (no bot exemption), exactly what a pre-existing
 * MySQL volume carries, plus a foreign key that must never be touched.
 */
const STALE_USERS_DDL = `CREATE TABLE \`users\` (
  \`id\` char(36) NOT NULL,
  \`phone\` varchar(255) DEFAULT NULL,
  \`email\` varchar(255) DEFAULT NULL,
  \`is_bot\` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (\`id\`),
  KEY \`idx_users_status\` (\`status\`),
  CONSTRAINT \`chk_users_phone_or_identity\` CHECK (((\`phone\` is not null or \`email\` is not null))),
  CONSTRAINT \`chk_leftover_from_old_schema\` CHECK ((\`phone\` <> '')),
  CONSTRAINT \`fk_users_ref\` FOREIGN KEY (\`other_id\`) REFERENCES \`others\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

describe('parseStoredChecks', () => {
  it('extracts CHECK constraints, not foreign keys', () => {
    // The full stored clause is returned (inside the outermost parentheses);
    // MySQL wraps stored clauses in extra parentheses, so the comparison must
    // be parenthesis-insensitive (it is: canonical AST).
    expect(parseStoredChecks(STALE_USERS_DDL)).toEqual([
      {
        name: 'chk_users_phone_or_identity',
        expression: '((`phone` is not null or `email` is not null))',
      },
      {
        name: 'chk_leftover_from_old_schema',
        expression: `(\`phone\` <> '')`,
      },
    ]);
  });

  it('handles expressions with nested parentheses', () => {
    const ddl =
      'CREATE TABLE `t` (\n' +
      'CONSTRAINT `chk_nested` CHECK (((`a` > 1 and `b` = 2) or `c` is not null)),\n' +
      ') ENGINE=InnoDB';
    expect(parseStoredChecks(ddl)).toEqual([
      {
        name: 'chk_nested',
        expression: '((`a` > 1 and `b` = 2) or `c` is not null)',
      },
    ]);
  });

  it('returns empty for a table without checks', () => {
    expect(parseStoredChecks('CREATE TABLE `t` (`id` int) ENGINE=InnoDB')).toEqual([]);
  });
});

describe('normalizeCheckExpression', () => {
  it('returns a canonical AST for the metadata expression', () => {
    expect(
      normalizeCheckExpression('phone IS NOT NULL OR email IS NOT NULL OR is_bot = 1'),
    ).toBe('OR(ISNOTNULL(PHONE),ISNOTNULL(EMAIL),EQ(IS_BOT,1))');
  });

  it('normalises arithmetic and BETWEEN', () => {
    expect(
      normalizeCheckExpression('games_won + games_lost + games_drawn <= games_played'),
    ).toBe('LTE(PLUS(PLUS(GAMES_WON,GAMES_LOST),GAMES_DRAWN),GAMES_PLAYED)');
    expect(normalizeCheckExpression('discount_percent BETWEEN 0 AND 100')).toBe(
      'BETWEEN(DISCOUNT_PERCENT,0,100)',
    );
  });

  it('returns null for unparseable input', () => {
    expect(normalizeCheckExpression('(((')).toBeNull();
    expect(normalizeCheckExpression('a = = 1')).toBeNull();
  });
});

describe('sameCheckExpression', () => {
  const metadata = 'phone IS NOT NULL OR email IS NOT NULL OR is_bot = 1';

  it('treats the MySQL-stored clause and the metadata expression as equal', () => {
    expect(
      sameCheckExpression(
        '(`phone` is not null or `email` is not null or `is_bot` = 1)',
        metadata,
      ),
    ).toBe(true);
  });

  it('ignores any amount of redundant wrapping parentheses', () => {
    expect(sameCheckExpression('(((A OR B)))', '(A OR B)')).toBe(true);
    expect(sameCheckExpression('`coins` >= 0   AND `pips`>=0', 'COINS >= 0 AND pips >= 0')).toBe(
      true,
    );
  });

  it('detects a real difference (the stale strict check)', () => {
    expect(
      sameCheckExpression(
        '(`phone` is not null or `email` is not null)',
        metadata,
      ),
    ).toBe(false);
  });

  it('detects a precedence change, not just text', () => {
    expect(sameCheckExpression('(A AND B) OR C', 'A AND (B OR C)')).toBe(false);
    expect(sameCheckExpression('A OR (B AND C)', '(A OR B) AND C')).toBe(false);
  });

  it('falls back to text comparison when parsing fails', () => {
    expect(sameCheckExpression('((x y z))', '((XY Z))')).toBe(false);
    expect(sameCheckExpression('((x y z))', 'x y z')).toBe(true);
  });
});

describe('planTableCheckRepairs', () => {
  const CURRENT_USER_CHECK = {
    name: 'chk_users_phone_or_identity',
    expression: 'phone IS NOT NULL OR email IS NOT NULL OR is_bot = 1',
  };

  it('replaces the stale strict check that broke bot seeding', () => {
    const stored = parseStoredChecks(STALE_USERS_DDL);
    const plan = planTableCheckRepairs('users', stored, [CURRENT_USER_CHECK]);

    expect(plan.changes).toEqual([
      'updated chk_users_phone_or_identity',
      'dropped stale chk_leftover_from_old_schema',
    ]);
    expect(plan.sql).toBe(
      'ALTER TABLE `users` DROP CHECK `chk_users_phone_or_identity`, ' +
        'ADD CONSTRAINT `chk_users_phone_or_identity` CHECK (phone IS NOT NULL OR email IS NOT NULL OR is_bot = 1), ' +
        'DROP CHECK `chk_leftover_from_old_schema`',
    );
  });

  it('leaves a matching check untouched', () => {
    const stored = [
      {
        name: 'chk_users_phone_or_identity',
        expression: '(`phone` is not null or `email` is not null or `is_bot` = 1)',
      },
    ];
    const plan = planTableCheckRepairs('users', stored, [CURRENT_USER_CHECK]);
    expect(plan.sql).toBeUndefined();
    expect(plan.changes).toEqual([]);
  });

  it('adds a check missing from the database', () => {
    const plan = planTableCheckRepairs('users', [], [CURRENT_USER_CHECK]);
    expect(plan.sql).toBe(
      'ALTER TABLE `users` ADD CONSTRAINT `chk_users_phone_or_identity` CHECK (phone IS NOT NULL OR email IS NOT NULL OR is_bot = 1)',
    );
  });

  it('drops stale chk_* leftovers but never anything else', () => {
    const stored = parseStoredChecks(STALE_USERS_DDL);
    const plan = planTableCheckRepairs('users', stored, [CURRENT_USER_CHECK]);
    expect(plan.changes).toContain('dropped stale chk_leftover_from_old_schema');
    expect(plan.sql).toContain('DROP CHECK `chk_leftover_from_old_schema`');
    expect(plan.sql).not.toContain('fk_users_ref');
  });

  it('produces one combined ALTER per table', () => {
    const stored = [
      { name: 'chk_profiles_wallet', expression: '(`coins` < 0)' },
      { name: 'chk_gone', expression: '(`x` > 0)' },
    ];
    const plan = planTableCheckRepairs('profiles', stored, [
      { name: 'chk_profiles_wallet', expression: 'coins >= 0 AND pips >= 0' },
      { name: 'chk_profiles_stats', expression: 'games_won + games_lost + games_drawn <= games_played' },
    ]);
    expect(plan.sql).toBe(
      'ALTER TABLE `profiles` DROP CHECK `chk_profiles_wallet`, ' +
        'ADD CONSTRAINT `chk_profiles_wallet` CHECK (coins >= 0 AND pips >= 0), ' +
        'ADD CONSTRAINT `chk_profiles_stats` CHECK (games_won + games_lost + games_drawn <= games_played), ' +
        'DROP CHECK `chk_gone`',
    );
  });
});

describe('SchemaCheckRepairService (mocked MySQL)', () => {
  // mysql2 resolves `query()` to the [rows, fields] tuple — the exact shape
  // the real driver returns (this is what the shape-masking regression
  // covered: the sqljs shape `[rows]` used to mask a misread of `rows[0]`).
  const mysql2Result = (ddl: string) => [
    [{ Table: 'users', 'Create Table': ddl }],
    [
      { name: 'Table', type: 254 },
      { name: 'Create Table', type: 252 },
    ],
  ];

  it('heals an existing database that still carries the stale strict check', async () => {
    const executed: string[] = [];
    const dataSource = {
      driver: { options: { type: 'mysql' } },
      isInitialized: true,
      entityMetadatas: [
        {
          tableName: 'users',
          checks: [
            {
              name: 'chk_users_phone_or_identity',
              expression: 'phone IS NOT NULL OR email IS NOT NULL OR is_bot = 1',
            },
          ],
        },
        { tableName: 'profiles', checks: [] },
      ],
      query: jest.fn(async (sql: string) => {
        if (sql.startsWith('SHOW CREATE TABLE `users`')) {
          return mysql2Result(STALE_USERS_DDL);
        }
        executed.push(sql);
        return [];
      }),
    };

    const service = new SchemaCheckRepairService(dataSource as never);
    await service.repairCheckConstraints();

    expect(executed).toEqual([
      'ALTER TABLE `users` DROP CHECK `chk_users_phone_or_identity`, ' +
        'ADD CONSTRAINT `chk_users_phone_or_identity` CHECK (phone IS NOT NULL OR email IS NOT NULL OR is_bot = 1), ' +
        'DROP CHECK `chk_leftover_from_old_schema`',
    ]);
  });

  it('does nothing when the stored checks already match the metadata', async () => {
    const inSyncDdl = `CREATE TABLE \`users\` (
  \`id\` char(36) NOT NULL,
  CONSTRAINT \`chk_users_phone_or_identity\` CHECK (((\`phone\` is not null or \`email\` is not null or \`is_bot\` = 1)))
) ENGINE=InnoDB`;
    const executed: string[] = [];
    const dataSource = {
      driver: { options: { type: 'mysql' } },
      isInitialized: true,
      entityMetadatas: [
        {
          tableName: 'users',
          checks: [
            {
              name: 'chk_users_phone_or_identity',
              expression: 'phone IS NOT NULL OR email IS NOT NULL OR is_bot = 1',
            },
          ],
        },
      ],
      query: jest.fn(async (sql: string) => {
        if (sql.startsWith('SHOW CREATE TABLE `users`')) {
          return mysql2Result(inSyncDdl);
        }
        executed.push(sql);
        return [];
      }),
    };

    const service = new SchemaCheckRepairService(dataSource as never);
    await service.repairCheckConstraints();
    expect(executed).toEqual([]);
  });

  it('treats an empty SHOW CREATE TABLE result as nothing to do', async () => {
    const executed: string[] = [];
    const dataSource = {
      driver: { options: { type: 'mysql' } },
      isInitialized: true,
      entityMetadatas: [
        {
          tableName: 'users',
          checks: [
            {
              name: 'chk_users_phone_or_identity',
              expression: 'phone IS NOT NULL OR email IS NOT NULL OR is_bot = 1',
            },
          ],
        },
      ],
      query: jest.fn(async (sql: string) => {
        if (sql.startsWith('SHOW CREATE TABLE `users`')) {
          return [[], []]; // mysql2 zero-row shape
        }
        executed.push(sql);
        return [];
      }),
    };

    const service = new SchemaCheckRepairService(dataSource as never);
    await expect(service.repairCheckConstraints()).resolves.toBeUndefined();
    expect(executed).toEqual([]);
  });

  it('never crashes the boot when SHOW CREATE TABLE fails', async () => {
    const dataSource = {
      driver: { options: { type: 'mysql' } },
      isInitialized: true,
      entityMetadatas: [
        {
          tableName: 'users',
          checks: [
            {
              name: 'chk_users_phone_or_identity',
              expression: 'phone IS NOT NULL OR email IS NOT NULL OR is_bot = 1',
            },
          ],
        },
      ],
      query: jest.fn(() => {
        throw new Error('connection lost');
      }),
    };

    const service = new SchemaCheckRepairService(dataSource as never);
    await expect(service.repairCheckConstraints()).resolves.toBeUndefined();
  });
});

describe('SchemaCheckRepairService', () => {
  it('skips non-MySQL drivers (sqljs test databases are rebuilt each boot)', async () => {
    const service = new SchemaCheckRepairService({
      driver: { options: { type: 'sqljs' } },
      isInitialized: true,
      entityMetadatas: [],
      query: jest.fn(),
    } as never);

    await expect(service.repairCheckConstraints()).resolves.toBeUndefined();
    expect(service['dataSource'].query).not.toHaveBeenCalled();
  });
});
