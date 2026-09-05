import { readFileSync } from 'fs';
import { join } from 'path';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial VibeTable schema.
 *
 * Executes the canonical MySQL 8.0 DDL (`../../../../database/schema.sql`)
 * statement by statement. Keeping a single hand-tuned SQL file as the source
 * of truth lets us express MySQL-native constructs (ENUM, generated columns,
 * CHECK constraints) that the entity metadata cannot emit portably.
 */
export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sqlPath = join(__dirname, '..', '..', '..', '..', 'database', 'schema.sql');
    const sql = readFileSync(sqlPath, 'utf8');

    for (const statement of this.splitStatements(sql)) {
      await queryRunner.query(statement);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'daily_reward_claims',
      'user_quests',
      'quests',
      'bots',
      'bans',
      'reports',
      'voice_sessions',
      'message_reactions',
      'message_reads',
      'messages',
      'chat_participants',
      'chats',
      'transactions',
      'user_inventory',
      'shop_items',
      'rankings',
      'match_players',
      'matches',
      'seasons',
      'room_players',
      'rooms',
      'games',
      'group_members',
      'groups',
      'friendships',
      'otp_codes',
      'refresh_tokens',
      'profiles',
      'users',
    ];
    await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of tables) {
      await queryRunner.query(`DROP TABLE IF EXISTS \`${table}\``);
    }
    await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1');
  }

  /** Split a SQL script into individual statements, stripping comments. */
  private splitStatements(sql: string): string[] {
    return sql
      .split(/;\s*(?:\r?\n|$)/)
      .map((raw) =>
        raw
          .split('\n')
          .filter((line) => !line.trim().startsWith('--'))
          .join('\n')
          .trim(),
      )
      .filter((statement) => statement.length > 0);
  }
}
