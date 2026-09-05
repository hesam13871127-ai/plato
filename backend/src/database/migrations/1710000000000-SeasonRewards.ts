import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 6 — Ranked System, Seasons & Rewards.
 *
 * Adds:
 *  - rankings.final_tier / rankings.rewards_granted (tier snapshot + reward flag)
 *  - season_reward_claims table (idempotent tier + per-game reward grants)
 *  - transactions.type 'season_reward' enum value
 *
 * Idempotent guards (`IF NOT EXISTS` / information_schema checks) make the
 * migration safe to run against both fresh MySQL 8 (where synchronize may
 * already have applied entity metadata) and upgraded databases.
 */
export class SeasonRewards1710000000000 implements MigrationInterface {
  name = 'SeasonRewards1710000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addColumnIfMissing(queryRunner, 'rankings', 'final_tier', 'VARCHAR(16) NULL');
    await this.addColumnIfMissing(queryRunner, 'rankings', 'rewards_granted', 'TINYINT(1) NOT NULL DEFAULT 0');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS season_reward_claims (
        id             CHAR(36)    NOT NULL,
        season_id      CHAR(36)    NOT NULL,
        user_id        CHAR(36)    NOT NULL,
        kind           ENUM('tier','game') NOT NULL DEFAULT 'tier',
        game_id        CHAR(36)    NULL,
        rank_achieved  INT         NOT NULL DEFAULT 0,
        tier           VARCHAR(16) NOT NULL DEFAULT 'bronze',
        coins_granted  BIGINT      NOT NULL DEFAULT 0,
        pips_granted   BIGINT      NOT NULL DEFAULT 0,
        xp_granted     BIGINT      NOT NULL DEFAULT 0,
        granted_at     DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_season_claim (season_id, user_id, kind, game_id),
        KEY idx_season_claim_season (season_id),
        KEY idx_season_claim_user (user_id),
        CONSTRAINT fk_season_claim_season FOREIGN KEY (season_id) REFERENCES seasons (id) ON DELETE CASCADE,
        CONSTRAINT fk_season_claim_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT fk_season_claim_game FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Widen the transactions.type enum to include season_reward (MySQL only;
    // SQLite stores it as plain varchar and needs no change).
    const isMysql = (queryRunner.connection.options.type as string) === 'mysql';
    if (isMysql) {
      await queryRunner.query(`
        ALTER TABLE transactions
        MODIFY COLUMN type ENUM('purchase','reward','gift','gift_purchase','refund','admin_adjustment','match_payout','daily_reward','quest_reward','season_reward') NOT NULL;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS season_reward_claims');
    await this.dropColumnIfExists(queryRunner, 'rankings', 'rewards_granted');
    await this.dropColumnIfExists(queryRunner, 'rankings', 'final_tier');
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
}
