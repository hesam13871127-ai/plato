import { GameEntity } from '../database/entities/game.entity';
import { RoomService, RoomView } from './room.service';

/**
 * Client serialisers for the game feature. CRITICAL INVARIANT: no payload here
 * (or anywhere emitted by this module) ever includes an `isBot`/`is_bot`
 * field — bots are indistinguishable from human players on the wire.
 */

export interface GameCatalogItemDto {
  slug: string;
  name: string;
  description: string;
  iconUrl: string | null;
  minPlayers: number;
  maxPlayers: number;
  avgDurationMinutes: number;
  supportsBots: boolean;
  rankedEnabled: boolean;
  isLive: boolean;
  status: string;
}

export function toGameCatalogItem(game: GameEntity, isLive: boolean): GameCatalogItemDto {
  return {
    slug: game.slug,
    name: game.name,
    description: game.description ?? '',
    iconUrl: game.iconUrl ?? null,
    minPlayers: game.minPlayers,
    maxPlayers: game.maxPlayers,
    avgDurationMinutes: game.avgDurationMinutes ?? 10,
    supportsBots: game.supportsBots,
    rankedEnabled: game.rankedEnabled,
    isLive,
    status: game.status,
  };
}

export function toRoomDto(view: RoomView): RoomView {
  // The view already excludes isBot on every seat; the access code is only
  // populated for members. Returned as-is to keep a single typed shape.
  return view;
}
