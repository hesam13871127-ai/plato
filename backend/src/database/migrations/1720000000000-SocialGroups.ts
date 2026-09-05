import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 7 — Friends, Groups, Private Rooms & Social System.
 *
 * Adds the link between a social group/club and its auto-provisioned group
 * chat: `groups.chat_id`. The friendships / group_members tables already exist
 * from the initial schema; this migration only introduces the new column and
 * its foreign key, with an idempotent guard so it is safe on both fresh MySQL 8
 * (where synchronize may already have applied entity metadata) and upgrades.
 */
export class SocialGroups1720000000000 implements MigrationInterface {
  name = 'SocialGroups1720000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addColumnIfMissing(queryRunner, 'groups', 'chat_id', 'CHAR(36) NULL');

    const isMysql = (queryRunner.connection.options.type as string) === 'mysql';
    if (isMysql) {
      await this.addIndexIfMissing(queryRunner, 'groups', 'idx_groups_chat', '`chat_id`');
      await this.addForeignKeyIfMissing(
        queryRunner,
        'groups',
        'fk_groups_chat',
        '`chat_id` REFERENCES `chats` (`id`) ON DELETE SET NULL',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isMysql = (queryRunner.connection.options.type as string) === 'mysql';
    if (isMysql) {
      await this.dropForeignKeyIfExists(queryRunner, 'groups', 'fk_groups_chat');
      await this.dropIndexIfExists(queryRunner, 'groups', 'idx_groups_chat');
    }
    await this.dropColumnIfExists(queryRunner, 'groups', 'chat_id');
  }

  private async addColumnIfMissing(
    queryRunner: QueryRunner,
    table: string,
    column: string,
    ddl: string,
  ): Promise<void> {
    const exists = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
      [table, column],
    );
    if ((exists as unknown[]).length === 0) {
      await queryRunner.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${ddl}`);
    }
  }

  private async dropColumnIfExists(
    queryRunner: QueryRunner,
    table: string,
    column: string,
  ): Promise<void> {
    const exists = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
      [table, column],
    );
    if ((exists as unknown[]).length > 0) {
      await queryRunner.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``);
    }
  }

  private async addIndexIfMissing(
    queryRunner: QueryRunner,
    table: string,
    index: string,
    columns: string,
  ): Promise<void> {
    const exists = await queryRunner.query(
      `SELECT 1 FROM information_schema.statistics
       WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1`,
      [table, index],
    );
    if ((exists as unknown[]).length === 0) {
      await queryRunner.query(`ALTER TABLE \`${table}\` ADD INDEX \`${index}\` (${columns})`);
    }
  }

  private async dropIndexIfExists(
    queryRunner: QueryRunner,
    table: string,
    index: string,
  ): Promise<void> {
    const exists = await queryRunner.query(
      `SELECT 1 FROM information_schema.statistics
       WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1`,
      [table, index],
    );
    if ((exists as unknown[]).length > 0) {
      await queryRunner.query(`ALTER TABLE \`${table}\` DROP INDEX \`${index}\``);
    }
  }

  private async addForeignKeyIfMissing(
    queryRunner: QueryRunner,
    table: string,
    constraint: string,
    definition: string,
  ): Promise<void> {
    const exists = await queryRunner.query(
      `SELECT 1 FROM information_schema.table_constraints
       WHERE table_schema = DATABASE() AND table_name = ? AND constraint_name = ? LIMIT 1`,
      [table, constraint],
    );
    if ((exists as unknown[]).length === 0) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${constraint}\` FOREIGN KEY (${definition})`,
      );
    }
  }

  private async dropForeignKeyIfExists(
    queryRunner: QueryRunner,
    table: string,
    constraint: string,
  ): Promise<void> {
    const exists = await queryRunner.query(
      `SELECT 1 FROM information_schema.table_constraints
       WHERE table_schema = DATABASE() AND table_name = ? AND constraint_name = ? LIMIT 1`,
      [table, constraint],
    );
    if ((exists as unknown[]).length > 0) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${constraint}\``,
      );
    }
  }
}
