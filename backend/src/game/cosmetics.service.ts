import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserInventoryEntity } from '../database/entities/user-inventory.entity';
import type { SeatCosmetics, SeatInfo } from './engine/types';

/**
 * Bot skins rotate through the same free/purchasable catalogue ids so an
 * opponent's cosmetics are never a tell. Kept deliberately modest (no
 * legendary skins) to feel like an ordinary mix of players.
 */
const BOT_PIECE_SKINS = ['classic', 'classic', 'neon', 'candy', 'classic', 'wooden'];
const BOT_BOARD_SKINS = ['classic', 'classic', 'midnight', 'classic', 'forest'];
const BOT_DICE_SKINS = ['classic', 'classic', 'ivory', 'classic'];

/**
 * Resolves the cosmetics (game pieces, board theme, dice set) each seat brings
 * to a table. Humans get whatever they have equipped from their inventory;
 * bots get a deterministic-looking rotation. Cosmetics are strictly visual.
 */
@Injectable()
export class CosmeticsService {
  constructor(
    @InjectRepository(UserInventoryEntity)
    private readonly inventory: Repository<UserInventoryEntity>,
  ) {}

  /** Attaches `cosmetics` to every seat in place and returns the same array. */
  async decorateSeats(seats: SeatInfo[], gameSlug: string): Promise<SeatInfo[]> {
    const humanIds = seats.filter((s) => !s.isBot).map((s) => s.playerId);
    const equippedByUser = new Map<string, SeatCosmetics>();

    if (humanIds.length > 0) {
      const rows = await this.inventory.find({
        where: { userId: In(humanIds), isEquipped: true },
        relations: { item: true },
      });
      for (const row of rows) {
        const item = row.item;
        if (!item) continue;
        const meta = (item.metadata ?? {}) as { game?: string; piece?: string; theme?: string; dice?: string };
        const current = equippedByUser.get(row.userId) ?? {};
        if (item.type === 'game_piece' && typeof meta.piece === 'string') {
          // A piece set may be game-specific or universal (no `game` key).
          if (!meta.game || meta.game === gameSlug) current.piece = meta.piece;
        } else if (item.type === 'board_theme' && typeof meta.theme === 'string') {
          current.board = meta.theme;
        } else if (item.type === 'dice_set' && typeof meta.dice === 'string') {
          current.dice = meta.dice;
        }
        equippedByUser.set(row.userId, current);
      }
    }

    seats.forEach((seat, index) => {
      if (seat.isBot) {
        seat.cosmetics = this.botCosmetics(seat.playerId, index);
        return;
      }
      const equipped = equippedByUser.get(seat.playerId) ?? {};
      seat.cosmetics = {
        piece: equipped.piece ?? 'classic',
        board: equipped.board ?? 'classic',
        dice: equipped.dice ?? 'classic',
      };
    });
    return seats;
  }

  /** Stable per-bot skin choice (hash of the bot's id) so it looks like a preference. */
  private botCosmetics(botId: string, seatIndex: number): SeatCosmetics {
    let hash = seatIndex;
    for (let i = 0; i < botId.length; i++) hash = (hash * 31 + botId.charCodeAt(i)) >>> 0;
    return {
      piece: BOT_PIECE_SKINS[hash % BOT_PIECE_SKINS.length],
      board: BOT_BOARD_SKINS[(hash >>> 3) % BOT_BOARD_SKINS.length],
      dice: BOT_DICE_SKINS[(hash >>> 6) % BOT_DICE_SKINS.length],
    };
  }
}
