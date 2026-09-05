import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameEntity } from '../database/entities/game.entity';
import { RoomEntity } from '../database/entities/room.entity';
import { RoomService } from '../game/room.service';
import { FriendsService } from './friends.service';
import { SocialEventsService } from './social-events.service';

export interface GameInvitePayload {
  roomId: string;
  accessCode: string | null;
  gameSlug: string;
  gameName: string;
  roomName: string | null;
  inviter: { id: string; displayName: string; username: string; avatarUrl: string | null };
  inviteUrl: string;
}

@Injectable()
export class InvitesService {
  constructor(
    @InjectRepository(RoomEntity)
    private readonly rooms: Repository<RoomEntity>,
    @InjectRepository(GameEntity)
    private readonly games: Repository<GameEntity>,
    private readonly roomService: RoomService,
    private readonly friends: FriendsService,
    private readonly events: SocialEventsService,
  ) {}

  /**
   * Invite friends to an existing room. The inviter must be a member; invitees
   * must be friends (blocks are rejected). Delivers a realtime `game:invite`
   * event to each invitee's personal socket room.
   */
  async inviteToRoom(
    inviterId: string,
    roomId: string,
    userIds: string[],
  ): Promise<{ ok: true; invited: string[] }> {
    const room = await this.rooms.findOne({ where: { id: roomId }, relations: { game: true } });
    if (!room) throw new NotFoundException('Room not found.');
    if (room.hostId !== inviterId) {
      throw new ForbiddenException('Only the host can invite players.');
    }
    if (room.status !== 'waiting') {
      throw new BadRequestException('That table has already started.');
    }

    const invitees = [...new Set(userIds)].filter((id) => id !== inviterId);
    const valid: string[] = [];
    for (const id of invitees) {
      if (await this.friends.hasBlock(inviterId, id)) continue;
      valid.push(id);
    }

    const [inviterCard] = await this.friends.toUserCards([inviterId]);
    const payload: GameInvitePayload = {
      roomId: room.id,
      accessCode: room.isPrivate ? room.accessCode : null,
      gameSlug: room.game?.slug ?? '',
      gameName: room.game?.name ?? 'Game',
      roomName: room.name,
      inviter: inviterCard
        ? {
            id: inviterCard.id,
            displayName: inviterCard.displayName,
            username: inviterCard.username,
            avatarUrl: inviterCard.avatarUrl,
          }
        : { id: inviterId, displayName: 'Player', username: '', avatarUrl: null },
      inviteUrl: room.isPrivate && room.accessCode ? `/join/${room.accessCode}` : `/rooms/${room.id}`,
    };

    await this.events.toUsers(valid, 'game:invite', payload);
    return { ok: true, invited: valid };
  }

  /**
   * Convenience flow used by the "Invite friends" button: create a private room
   * for a game and immediately invite the selected friends, returning the room
   * view so the host lands in the lobby.
   */
  async createPrivateAndInvite(
    hostId: string,
    params: {
      gameSlug: string;
      name?: string;
      isRanked?: boolean;
      fillWithBots?: boolean;
      inviteUserIds?: string[];
    },
  ): Promise<{ room: unknown; invite: { ok: true; invited: string[] } | null }> {
    const { view } = await this.roomService.create(
      { id: hostId },
      {
        gameSlug: params.gameSlug,
        name: params.name,
        isPrivate: true,
        isRanked: params.isRanked ?? false,
        fillWithBots: params.fillWithBots ?? false,
      },
    );

    let invite: { ok: true; invited: string[] } | null = null;
    if (params.inviteUserIds && params.inviteUserIds.length > 0) {
      invite = await this.inviteToRoom(hostId, view.id, params.inviteUserIds);
    }
    return { room: view, invite };
  }

  /** Resolve a room for the invitee from an invite payload (used on accept). */
  async resolveForInvitee(userId: string, roomId: string): Promise<unknown> {
    return this.roomService.view({ id: userId }, roomId);
  }
}
