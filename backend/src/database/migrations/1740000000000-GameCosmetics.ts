import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Game cosmetics & new classic board games.
 *
 * - Widens `shop_items.type` so the catalogue can carry `game_piece` (piece
 *   sets / skins) and `board_theme` ("playgrounds") items. Databases created
 *   from entity metadata already use VARCHAR(32) and are left untouched; only
 *   legacy ENUM columns from `database/schema.sql` are altered.
 * - Adds a composite index on `user_inventory (user_id, is_equipped)` — the
 *   lookup performed at every match start to resolve equipped cosmetics.
 *
 * Game rows (checkers, reversi, backgammon, dots_boxes, sea_battle) and the
 * cosmetic items themselves are inserted by the runtime seeders
 * (`GameCatalogSeeder`, `ShopCatalogueSeeder`) which are idempotent.
 */
export class GameCosmetics1740000000000 implements MigrationInterface {
  name = 'GameCosmetics1740000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const column = await this.columnType(queryRunner, 'shop_items', 'type');
    if (column && column.toLowerCase().startsWith('enum(')) {
      await queryRunner.query(
        "ALTER TABLE `shop_items` MODIFY `type` ENUM('avatar_frame','banner','chat_bubble','theme','game_skin','id_color','username_change','dice_set','emote','bundle','consumable','game_piece','board_theme') NOT NULL",
      );
    }

    const hasIndex = await this.indexExists(queryRunner, 'user_inventory', 'idx_user_inventory_user_equipped');
    if (!hasIndex) {
      const userCol = (await this.columnType(queryRunner, 'user_inventory', 'user_id')) ? 'user_id' : 'userId';
      const equippedCol = (await this.columnType(queryRunner, 'user_inventory', 'is_equipped')) ? 'is_equipped' : 'isEquipped';
      await queryRunner.query(
        `CREATE INDEX \`idx_user_inventory_user_equipped\` ON \`user_inventory\` (\`${userCol}\`, \`${equippedCol}\`)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasIndex = await this.indexExists(queryRunner, 'user_inventory', 'idx_user_inventory_user_equipped');
    if (hasIndex) {
      await queryRunner.query('DROP INDEX `idx_user_inventory_user_equipped` ON `user_inventory`');
    }
    // The widened ENUM is intentionally kept: shrinking it would destroy rows.
  }

  private async columnType(queryRunner: QueryRunner, table: string, column: string): Promise<string | null> {
    const rows: Array<{ COLUMN_TYPE: string }> = await queryRunner.query(
      `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column],
    );
    return rows[0]?.COLUMN_TYPE ?? null;
  }

  private async indexExists(queryRunner: QueryRunner, table: string, index: string): Promise<boolean> {
    const rows: Array<{ n: number }> = await queryRunner.query(
      `SELECT COUNT(1) AS n FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
      [table, index],
    );
    return Number(rows[0]?.n ?? 0) > 0;
  }
}
