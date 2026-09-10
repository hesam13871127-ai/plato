import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Moderation/observability tables: camelCase → snake_case column rename.
 *
 * Migration 1730000000000 created `moderation_flags`, `moderation_audit_log`,
 * `user_strikes` and `error_events` with camelCase column names
 * (`targetType`, `authorId`, `createdAt`, …) because the entities relied on
 * TypeORM's default naming. The runtime now uses the SnakeNamingStrategy, so
 * every column the ORM addresses must be snake_case — matching the rest of
 * database/schema.sql.
 *
 * 1730000000000 already creates these tables with the corrected names on
 * fresh databases; this migration upgrades databases that ran the older
 * variant. Every rename is guarded with information_schema checks, so it is a
 * no-op on databases that are already snake_case (or lack the tables), and
 * safe to re-run after a partial failure (MySQL DDL is not transactional).
 *
 * Uses `ALTER TABLE … CHANGE COLUMN` with the full column definition instead
 * of the shorter `RENAME COLUMN`: RENAME COLUMN requires MySQL 8.0+ or
 * MariaDB 10.5.2+, while CHANGE COLUMN works on every MySQL 5.x/8.x and
 * MariaDB version (definitions mirror migration 1730000000000 verbatim).
 */
const RENAMES: ReadonlyArray<readonly [table: string, from: string, to: string, definition: string]> = [
  ['moderation_flags', 'targetType', 'target_type', "VARCHAR(16) NOT NULL DEFAULT 'message'"],
  ['moderation_flags', 'targetId', 'target_id', 'VARCHAR(36) NOT NULL'],
  ['moderation_flags', 'authorId', 'author_id', 'VARCHAR(36) NULL'],
  ['moderation_flags', 'resolvedBy', 'resolved_by', 'VARCHAR(36) NULL'],
  ['moderation_flags', 'createdAt', 'created_at', 'DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)'],
  ['moderation_audit_log', 'actorId', 'actor_id', "VARCHAR(36) NOT NULL DEFAULT 'system'"],
  ['moderation_audit_log', 'targetType', 'target_type', 'VARCHAR(16) NULL'],
  ['moderation_audit_log', 'targetId', 'target_id', 'VARCHAR(36) NULL'],
  ['moderation_audit_log', 'createdAt', 'created_at', 'DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)'],
  ['user_strikes', 'userId', 'user_id', 'VARCHAR(36) NOT NULL'],
  ['user_strikes', 'issuedBy', 'issued_by', "VARCHAR(36) NOT NULL DEFAULT 'auto'"],
  ['user_strikes', 'relatedFlagId', 'related_flag_id', 'VARCHAR(36) NULL'],
  ['user_strikes', 'createdAt', 'created_at', 'DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)'],
  ['error_events', 'statusCode', 'status_code', 'INT NULL'],
  ['error_events', 'userId', 'user_id', 'VARCHAR(64) NULL'],
  ['error_events', 'firstSeenAt', 'first_seen_at', 'DATETIME(6) NULL'],
  ['error_events', 'createdAt', 'created_at', 'DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)'],
];

export class SnakeCaseModerationColumns1750000000000 implements MigrationInterface {
  name = 'SnakeCaseModerationColumns1750000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, from, to, definition] of RENAMES) {
      if (await this.needsRename(queryRunner, table, from, to)) {
        await queryRunner.query(
          `ALTER TABLE \`${table}\` CHANGE COLUMN \`${from}\` \`${to}\` ${definition}`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table, from, to, definition] of [...RENAMES].reverse()) {
      if (await this.needsRename(queryRunner, table, to, from)) {
        await queryRunner.query(
          `ALTER TABLE \`${table}\` CHANGE COLUMN \`${to}\` \`${from}\` ${definition}`,
        );
      }
    }
  }

  /** True when the table exists, `from` exists and `to` does not. */
  private async needsRename(
    queryRunner: QueryRunner,
    table: string,
    from: string,
    to: string,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `SELECT
         SUM(column_name = ?) AS hasFrom,
         SUM(column_name = ?) AS hasTo
       FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ?`,
      [from, to, table],
    )) as Array<{ hasFrom: string | number | null; hasTo: string | number | null }>;

    const row = rows[0];
    if (!row) return false;
    return Number(row.hasFrom ?? 0) > 0 && Number(row.hasTo ?? 0) === 0;
  }
}
