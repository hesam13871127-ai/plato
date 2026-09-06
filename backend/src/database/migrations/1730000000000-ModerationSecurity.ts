import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 9 — Performance, Security Hardening & Strong Moderation.
 *
 * Adds the platform role column (`users.role`) and the moderation/observability
 * tables: automated content flags, the immutable audit trail, per-user conduct
 * strikes, and tracked error/security events. Every statement is idempotent so
 * it is safe on fresh MySQL 8 (where `synchronize` may already have created the
 * objects from entity metadata) and on upgraded databases.
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
        \`targetType\` VARCHAR(16) NOT NULL DEFAULT 'message',
        \`targetId\` VARCHAR(36) NOT NULL,
        \`authorId\` VARCHAR(36) NULL,
        \`reason\` VARCHAR(24) NOT NULL,
        \`verdict\` VARCHAR(16) NOT NULL DEFAULT 'flagged',
        \`excerpt\` VARCHAR(512) NULL,
        \`details\` JSON NULL,
        \`status\` VARCHAR(16) NOT NULL DEFAULT 'open',
        \`resolvedBy\` VARCHAR(36) NULL,
        \`createdAt\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );

    await this.createTableIfMissing(
      queryRunner,
      'moderation_audit_log',
      `CREATE TABLE \`moderation_audit_log\` (
        \`id\` CHAR(36) NOT NULL PRIMARY KEY,
        \`actorId\` VARCHAR(36) NOT NULL DEFAULT 'system',
        \`action\` VARCHAR(32) NOT NULL,
        \`targetType\` VARCHAR(16) NULL,
        \`targetId\` VARCHAR(36) NULL,
        \`reason\` VARCHAR(255) NULL,
        \`metadata\` JSON NULL,
        \`createdAt\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );

    await this.createTableIfMissing(
      queryRunner,
      'user_strikes',
      `CREATE TABLE \`user_strikes\` (
        \`id\` CHAR(36) NOT NULL PRIMARY KEY,
        \`userId\` VARCHAR(36) NOT NULL,
        \`issuedBy\` VARCHAR(36) NOT NULL DEFAULT 'auto',
        \`reason\` VARCHAR(32) NOT NULL,
        \`weight\` TINYINT NOT NULL DEFAULT 1,
        \`consequence\` VARCHAR(16) NOT NULL DEFAULT 'note',
        \`relatedFlagId\` VARCHAR(36) NULL,
        \`createdAt\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX \`idx_strikes_user\` (\`userId\`, \`createdAt\`)
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
        \`statusCode\` INT NULL,
        \`userId\` VARCHAR(64) NULL,
        \`context\` JSON NULL,
        \`occurrences\` INT NOT NULL DEFAULT 1,
        \`firstSeenAt\` DATETIME(6) NULL,
        \`createdAt\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX \`idx_errors_level_time\` (\`level\`, \`createdAt\`),
        INDEX \`idx_errors_fingerprint\` (\`fingerprint\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );

    await this.addIndexIfMissing(queryRunner, 'moderation_flags', 'idx_mod_flags_status', '`status`, `createdAt`');
    await this.addIndexIfMissing(queryRunner, 'moderation_flags', 'idx_mod_flags_target', '`targetType`, `targetId`');
    await this.addIndexIfMissing(queryRunner, 'moderation_flags', 'idx_mod_flags_author', '`authorId`');
    await this.addIndexIfMissing(queryRunner, 'moderation_audit_log', 'idx_audit_created', '`createdAt`');
    await this.addIndexIfMissing(queryRunner, 'moderation_audit_log', 'idx_audit_target', '`targetType`, `targetId`');
    await this.addIndexIfMissing(queryRunner, 'moderation_audit_log', 'idx_audit_actor', '`actorId`');
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
