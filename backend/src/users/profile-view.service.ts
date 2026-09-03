import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProfileEntity } from '../database/entities/profile.entity';
import { UserEntity } from '../database/entities/user.entity';
import { UserInventoryEntity } from '../database/entities/user-inventory.entity';
import { EquippedCosmeticDto, UserDto } from './dto/user.dto';

/**
 * Assembles the full, client-facing profile: wallet, stats, unlocked titles &
 * badges and the currently-equipped cosmetics resolved from the inventory.
 * This is the only place cosmetics are attached to a profile response.
 */
@Injectable()
export class ProfileViewService {
  constructor(
    @InjectRepository(UserInventoryEntity)
    private readonly inventory: Repository<UserInventoryEntity>,
  ) {}

  async toUserDto(user: UserEntity): Promise<UserDto> {
    const p = user.profile;

    const frame = p?.equippedFrameId
      ? await this.resolveCosmetic(p.equippedFrameId)
      : null;
    const banner = p?.equippedBannerId
      ? await this.resolveCosmetic(p.equippedBannerId)
      : null;
    const chatBubble = p?.equippedChatBubbleId
      ? await this.resolveCosmetic(p.equippedChatBubbleId)
      : null;
    const theme = p?.equippedThemeId
      ? await this.resolveCosmetic(p.equippedThemeId)
      : null;
    const idColor = p?.equippedIdColorId
      ? await this.resolveCosmetic(p.equippedIdColorId)
      : null;

    const badges = Array.isArray(p?.badges) ? (p!.badges as Array<Record<string, unknown>>) : [];
    const unlockedTitles = Array.isArray(p?.unlockedTitles) ? (p!.unlockedTitles as string[]) : [];

    const dto: UserDto = {
      id: user.id,
      phone: user.phone,
      email: user.email,
      primaryProvider: user.primaryProvider,
      isVerified: user.isVerified,
      username: p?.username ?? '',
      displayName: p?.displayName ?? '',
      avatarUrl: p?.avatarUrl ?? null,
      country: p?.country ?? null,
      bio: p?.bio ?? null,
      level: Number(p?.level ?? 1),
      xp: Number(p?.xp ?? 0),
      coins: Number(p?.coins ?? 0),
      pips: Number(p?.pips ?? 0),
      gender: user.gender,
      presence: user.presence,
      gamesPlayed: Number(p?.gamesPlayed ?? 0),
      gamesWon: Number(p?.gamesWon ?? 0),
      gamesLost: Number(p?.gamesLost ?? 0),
      gamesDrawn: Number(p?.gamesDrawn ?? 0),
      streakDays: Number(p?.streakDays ?? 0),
      giftsSent: Number(p?.giftsSent ?? 0),
      giftsReceived: Number(p?.giftsReceived ?? 0),
      title: p?.activeTitle ?? null,
      unlockedTitles,
      badges,
      frame,
      banner,
      chatBubble,
      theme,
      idColor,
      createdAt: user.createdAt,
    };

    return this.applyBadges(dto);
  }

  /**
   * Derives achievement-style badges from concrete stats so the profile always
   * reflects earned accomplishments.
   */
  private applyBadges(dto: UserDto): UserDto {
    const earned = new Map<string, { code: string; label: string }>();
    const add = (code: string, label: string) => earned.set(code, { code, label });

    if (dto.gamesPlayed >= 1) add('first_game', 'First Game');
    if (dto.gamesWon >= 1) add('first_win', 'First Victory');
    if (dto.gamesWon >= 10) add('winner_10', 'Veteran Winner');
    if (dto.giftsSent >= 1) add('first_gift', 'Generous Gifter');
    if (dto.streakDays >= 3) add('streak_3', 'On a Roll');
    if (dto.level >= 5) add('level_5', 'High Roller');

    // Merge with any persisted badges (persisted take precedence).
    const persistedCodes = new Set(
      dto.badges.map((b) => b['code']).filter((c): c is string => typeof c === 'string'),
    );
    const merged: Array<Record<string, unknown>> = [...dto.badges];
    for (const badge of earned.values()) {
      if (!persistedCodes.has(badge.code)) {
        merged.push({ code: badge.code, label: badge.label, derived: true });
      }
    }

    // A default starter title plus unlock titles by milestones.
    const titles = new Set<string>(dto.unlockedTitles);
    titles.add('New Player');
    if (dto.gamesWon >= 1) titles.add('Lucky Roller');
    if (dto.gamesWon >= 10) titles.add('Champion');
    if (dto.level >= 5) titles.add('Veteran');

    dto.badges = merged;
    dto.unlockedTitles = [...titles];
    return dto;
  }

  private async resolveCosmetic(inventoryId: string): Promise<EquippedCosmeticDto | null> {
    const row = await this.inventory.findOne({
      where: { id: inventoryId },
      relations: { item: true },
    });
    if (!row || !row.item) return null;
    return {
      inventoryId: row.id,
      itemId: row.itemId,
      name: row.item.name,
      type: row.item.type,
      metadata: row.item.metadata,
    };
  }
}
