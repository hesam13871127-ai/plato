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
 * no-op on databases that are already snake_case (or lack the tables).
 */
const RENAMES: ReadonlyArray<readonly [table: string, from: string, to: string]> = [
  ['moderation_flags', 'targetType', 'target_type'],
  ['moderation_flags', 'targetId', 'target_id'],
  ['moderation_flags', 'authorId', 'author_id'],
  ['moderation_flags', 'resolvedBy', 'resolved_by'],
  ['moderation_flags', 'createdAt', 'created_at'],
  ['moderation_audit_log', 'actorId', 'actor_id'],
  ['moderation_audit_log', 'targetType', 'target_type'],
  ['moderation_audit_log', 'targetId', 'target_id'],
  ['moderation_audit_log', 'createdAt', 'created_at'],
  ['user_strikes', 'userId', 'user_id'],
  ['user_strikes', 'issuedBy', 'issued_by'],
  ['user_strikes', 'relatedFlagId', 'related_flag_id'],
  ['user_strikes', 'createdAt', 'created_at'],
  ['error_events', 'statusCode', 'status_code'],
  ['error_events', 'userId', 'user_id'],
  ['error_events', 'firstSeenAt', 'first_seen_at'],
  ['error_events', 'createdAt', 'created_at'],
];

export class SnakeCaseModerationColumns1750000000000 implements MigrationInterface {
  name = 'SnakeCaseModerationColumns1750000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, from, to] of RENAMES) {
      if (await this.needsRename(queryRunner, table, from, to)) {
        await queryRunner.query(
          `ALTER TABLE \`${table}\` RENAME COLUMN \`${from}\` TO \`${to}\``,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table, from, to] of [...RENAMES].reverse()) {
      if (await this.needsRename(queryRunner, table, to, from)) {
        await queryRunner.query(
          `ALTER TABLE \`${table}\` RENAME COLUMN \`${to}\` TO \`${from}\``,
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
    )) as Array<{ hasFrom: string | number; hasTo: string | number }>;

    const row = rows[0];
    if (!row) return false;
    return Number(row.hasFrom) > 0 && Number(row.hasTo) === 0;
  }
}
