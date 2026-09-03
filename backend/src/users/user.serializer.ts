import { ProfileEntity } from '../database/entities/profile.entity';
import { UserEntity } from '../database/entities/user.entity';
import type { UserDto } from './dto/user.dto';

/**
 * Maps a user (+profile) to the public DTO. This is the single chokepoint
 * guaranteeing internal fields (`isBot`, `passwordHash`, tokens…) are never
 * sent to clients.
 */
export function toUserDto(user: UserEntity, profile?: ProfileEntity | null): UserDto {
  const p = profile ?? user.profile ?? null;

  return {
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
    unlockedTitles: Array.isArray(p?.unlockedTitles) ? (p!.unlockedTitles as string[]) : [],
    badges: Array.isArray(p?.badges) ? (p!.badges as Array<Record<string, unknown>>) : [],
    // Cosmetics are resolved by ProfileViewService for the full profile; the
    // compact auth serializer leaves them null.
    frame: null,
    banner: null,
    chatBubble: null,
    theme: null,
    idColor: null,
    createdAt: user.createdAt,
  };
}
