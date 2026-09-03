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
    gems: Number(p?.gems ?? 0),
    gender: user.gender,
    presence: user.presence,
    gamesPlayed: Number(p?.gamesPlayed ?? 0),
    gamesWon: Number(p?.gamesWon ?? 0),
    createdAt: user.createdAt,
  };
}
