import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Shop catalogue alignment — game pieces & board themes.
 *
 * The catalogue grew `game_piece` items (one per game, waves 3–6) and
 * `board_theme` items long after `shop_items.type` was written, so the MySQL
 * ENUM lacked both values while the runtime catalogue (and database/seed.sql)
 * used them. Fresh databases already get the full ENUM from schema.sql; this
 * migration upgrades existing databases so seeding and purchases no longer
 * fail with "Data truncated for column 'type'".
 *
 * Idempotent: MODIFY to the identical definition is a no-op on MySQL 8.
 */
export class ShopItemTypeValues1740000000000 implements MigrationInterface {
  name = 'ShopItemTypeValues1740000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE shop_items
      MODIFY COLUMN type ENUM(
        'avatar_frame','banner','chat_bubble','theme','game_skin',
        'game_piece','board_theme','id_color','username_change',
        'dice_set','emote','bundle','consumable'
      ) NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Narrowing the ENUM would orphan every game_piece / board_theme row —
    // instead we leave the widened values in place on revert.
    void queryRunner;
  }
}
