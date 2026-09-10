import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 9 — Performance, Security Hardening & Strong Moderation.
 *
 * Adds the platform role column (`users.role`) and the moderation/observability
 * tables: automated content flags, the immutable audit trail, per-user conduct
 * strikes, and tracked error/security events. Column names are snake_case to
 * match the SnakeNamingStrategy entities and the rest of schema.sql (databases
 * created by the earlier camelCase variant are upgraded by migration
 * 1750000000000). Every statement is idempotent so it is safe on fresh MySQL 8
 * (where `synchronize` may already have created the objects from entity
 * metadata) and on upgraded databases.
 */
export class ModerationSecurity1730000000000 implements MigrationInterface {
  name = 'ModerationSecurity1730000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addColumnIfMissing(queryRunner, 'users', 'role', "VARCHAR(16) NOT NULL DEFAULT 'player'");

    await this.createTableIfMissing(
      queryRunner,
      'moderation_flags',
      `CREATE TABLE \`moderation_flags\` (
        \`id\` CHAR(36) NOT NULL PRIMARY KEY,
        \`target_type\` VARCHAR(16) NOT NULL DEFAULT 'message',
        \`target_id\` VARCHAR(36) NOT NULL,
        \`author_id\` VARCHAR(36) NULL,
        \`reason\` VARCHAR(24) NOT NULL,
        \`verdict\` VARCHAR(16) NOT NULL DEFAULT 'flagged',
        \`excerpt\` VARCHAR(512) NULL,
        \`details\` JSON NULL,
        \`status\` VARCHAR(16) NOT NULL DEFAULT 'open',
        \`resolved_by\` VARCHAR(36) NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );

    await this.createTableIfMissing(
      queryRunner,
      'moderation_audit_log',
      `CREATE TABLE \`moderation_audit_log\` (
        \`id\` CHAR(36) NOT NULL PRIMARY KEY,
        \`actor_id\` VARCHAR(36) NOT NULL DEFAULT 'system',
        \`action\` VARCHAR(32) NOT NULL,
        \`target_type\` VARCHAR(16) NULL,
        \`target_id\` VARCHAR(36) NULL,
        \`reason\` VARCHAR(255) NULL,
        \`metadata\` JSON NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );

    await this.createTableIfMissing(
      queryRunner,
      'user_strikes',
      `CREATE TABLE \`user_strikes\` (
        \`id\` CHAR(36) NOT NULL PRIMARY KEY,
        \`user_id\` VARCHAR(36) NOT NULL,
        \`issued_by\` VARCHAR(36) NOT NULL DEFAULT 'auto',
        \`reason\` VARCHAR(32) NOT NULL,
        \`weight\` TINYINT NOT NULL DEFAULT 1,
        \`consequence\` VARCHAR(16) NOT NULL DEFAULT 'note',
        \`related_flag_id\` VARCHAR(36) NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX \`idx_strikes_user\` (\`user_id\`, \`created_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );

    await this.createTableIfMissing(
      queryRunner,
      'error_events',
      `CREATE TABLE \`error_events\` (
        \`id\` CHAR(36) NOT NULL PRIMARY KEY,
        \`level\` VARCHAR(12) NOT NULL,
        \`fingerprint\` VARCHAR(64) NOT NULL,
        \`source\` VARCHAR(12) NOT NULL DEFAULT 'http',
        \`message\` VARCHAR(255) NOT NULL,
        \`stack\` TEXT NULL,
        \`method\` VARCHAR(10) NULL,
        \`path\` VARCHAR(512) NULL,
        \`status_code\` INT NULL,
        \`user_id\` VARCHAR(64) NULL,
        \`context\` JSON NULL,
        \`occurrences\` INT NOT NULL DEFAULT 1,
        \`first_seen_at\` DATETIME(6) NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX \`idx_errors_level_time\` (\`level\`, \`created_at\`),
        INDEX \`idx_errors_fingerprint\` (\`fingerprint\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );

    await this.addIndexIfMissing(queryRunner, 'moderation_flags', 'idx_mod_flags_status', '`status`, `created_at`');
    await this.addIndexIfMissing(queryRunner, 'moderation_flags', 'idx_mod_flags_target', '`target_type`, `target_id`');
    await this.addIndexIfMissing(queryRunner, 'moderation_flags', 'idx_mod_flags_author', '`author_id`');
    await this.addIndexIfMissing(queryRunner, 'moderation_audit_log', 'idx_audit_created', '`created_at`');
    await this.addIndexIfMissing(queryRunner, 'moderation_audit_log', 'idx_audit_target', '`target_type`, `target_id`');
    await this.addIndexIfMissing(queryRunner, 'moderation_audit_log', 'idx_audit_actor', '`actor_id`');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropTableIfExists(queryRunner, 'error_events');
    await this.dropTableIfExists(queryRunner, 'user_strikes');
    await this.dropTableIfExists(queryRunner, 'moderation_audit_log');
    await this.dropTableIfExists(queryRunner, 'moderation_flags');
    await this.dropColumnIfExists(queryRunner, 'users', 'role');
  }

  private async tableExists(queryRunner: QueryRunner, table: string): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
      [table],
    );
    return (rows as unknown[]).length > 0;
  }

  private async createTableIfMissing(queryRunner: QueryRunner, table: string, ddl: string): Promise<void> {
    if (!(await this.tableExists(queryRunner, table))) {
      await queryRunner.query(ddl);
    }
  }

  private async dropTableIfExists(queryRunner: QueryRunner, table: string): Promise<void> {
    if (await this.tableExists(queryRunner, table)) {
      await queryRunner.query(`DROP TABLE \`${table}\``);
    }
  }

  private async addColumnIfMissing(queryRunner: QueryRunner, table: string, column: string, ddl: string): Promise<void> {
    const exists = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
      [table, column],
    );
    if ((exists as unknown[]).length === 0) {
      await queryRunner.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${ddl}`);
    }
  }

  private async dropColumnIfExists(queryRunner: QueryRunner, table: string, column: string): Promise<void> {
    const exists = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
      [table, column],
    );
    if ((exists as unknown[]).length > 0) {
      await queryRunner.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``);
    }
  }

  private async addIndexIfMissing(queryRunner: QueryRunner, table: string, index: string, columns: string): Promise<void> {
    const exists = await queryRunner.query(
      `SELECT 1 FROM information_schema.statistics
       WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1`,
      [table, index],
    );
    if ((exists as unknown[]).length === 0) {
      await queryRunner.query(`ALTER TABLE \`${table}\` ADD INDEX \`${index}\` (${columns})`);
    }
  }
}
