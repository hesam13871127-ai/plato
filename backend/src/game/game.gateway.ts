import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import type { AppConfig } from '../config/configuration';
import { ProfileEntity } from '../database/entities/profile.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameSessionService } from './game-session.service';
import { MatchmakingService } from './matchmaking.service';
import { RoomService } from './room.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  displayName?: string;
  avatarUrl?: string | null;
}

interface EnqueuePayload {
  gameSlug: string;
  isRanked?: boolean;
  seats?: number;
}

interface RoomIdPayload {
  roomId: string;
}

interface JoinRoomPayload {
  roomId?: string;
  accessCode?: string;
}

interface ActionPayload {
  sessionId: string;
  type: string;
  payload?: Record<string, unknown>;
}

interface SpectatePayload {
  sessionId?: string;
  roomId?: string;
}

interface ReadyPayload extends RoomIdPayload {
  isReady: boolean;
}

const USER_ROOM = (userId: string) => `user:${userId}`;
const GAME_ROOM = (sessionId: string) => `game:${sessionId}`;

/**
 * Real-time gateway for matchmaking, lobbies and live play.
 *
 * Every socket authenticates on the handshake (same JWT scheme as chat). The
 * gateway is a thin transport: all rules live in the services. Hidden game
 * state is projected per seat inside GameSessionService, and the is_bot flag
 * is never placed on any emitted payload.
 */
@WebSocketGateway({
  cors: { origin: true, credentials: true },
  namespace: '/',
})
export class GameGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(GameGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly sessions: GameSessionService,
    private readonly matchmaking: MatchmakingService,
    private readonly rooms: RoomService,
    @InjectRepository(ProfileEntity) private readonly profiles: Repository<ProfileEntity>,
  ) {}

  afterInit(): void {
    this.sessions.attachServer(this.server);
    this.matchmaking.attachServer(this.server);
    this.logger.log('Game gateway initialised.');
  }

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    const token = this.extractToken(client);
    if (!token) {
      client.emit('unauthorized', { message: 'Missing access token.' });
      client.disconnect(true);
      return;
    }
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('jwt.accessSecret', { infer: true }),
        issuer: this.configService.get('jwt.issuer', { infer: true }),
      });
      client.userId = payload.sub as string;
      client.data.userId = client.userId;
      const profile = await this.profiles.findOne({ where: { userId: client.userId } });
      client.displayName = profile?.displayName ?? 'Player';
      client.avatarUrl = profile?.avatarUrl ?? null;
      client.data.displayName = client.displayName;

      await client.join(USER_ROOM(client.userId));
      client.emit('authenticated', { userId: client.userId });

      // Reconnection: if the player has a live table, hand them the snapshot.
      const live = this.sessions.getByPlayer(client.userId);
      if (live) {
        const seat = this.sessions.connectPlayer(live, client.userId, client.id);
        await client.join(GAME_ROOM(live.sessionId));
        if (seat >= 0) {
          const snapshot = this.sessions.viewForPlayer(live, client.userId);
          client.emit('game:reconnect', snapshot);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? (error as Error).message : 'invalid token';
      const isExpired = (error as { name?: string })?.name === 'TokenExpiredError' || message === 'jwt expired';
      client.emit('unauthorized', {
        message: isExpired ? 'Access token expired.' : 'Invalid or expired access token.',
        code: isExpired ? 'token_expired' : 'invalid_token',
        expired: isExpired,
      });
      if (isExpired) {
        // expired → silent (see ChatGateway)
      } else {
        this.logger.warn(`Game socket handshake rejected: ${message} (${client.id})`);
      }
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthenticatedSocket): Promise<void> {
    if (!client.userId) return;
    // Detach this socket from any sessions it was seated in.
    for (const [sessionId] of this.sessions.all()) {
      const session = this.sessions.get(sessionId);
      if (session && session.playerSeat.has(client.userId)) {
        this.sessions.disconnectPlayer(session, client.id);
      }
    }
    this.matchmaking.cancel(client.userId, true);
  }

  // ── Matchmaking ─────────────────────────────────────────────────────────

  @SubscribeMessage('matchmaking:enqueue')
  async handleEnqueue(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: EnqueuePayload,
  ): Promise<{ ok: boolean; error?: string; state?: string; sessionId?: string }> {
    if (!client.userId) return { ok: false, error: 'unauthenticated' };
    if (!body?.gameSlug) return { ok: false, error: 'gameSlug is required.' };
    try {
      const result = await this.matchmaking.enqueue(
        { id: client.userId, displayName: client.displayName ?? 'Player', avatarUrl: client.avatarUrl ?? null },
        { gameSlug: body.gameSlug, isRanked: body.isRanked ?? false, seats: body.seats },
      );
      return { ok: true, state: result.status, sessionId: result.sessionId };
    } catch (error) {
      return { ok: false, error: this.messageOf(error) };
    }
  }

  @SubscribeMessage('matchmaking:cancel')
  handleCancel(@ConnectedSocket() client: AuthenticatedSocket): { ok: boolean } {
    if (client.userId) this.matchmaking.cancel(client.userId, true);
    return { ok: true };
  }

  // ── Rooms / lobbies ──────────────────────────────────────────────────────

  @SubscribeMessage('room:join')
  async handleRoomJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: JoinRoomPayload,
  ): Promise<{ ok: boolean; error?: string; room?: unknown }> {
    if (!client.userId) return { ok: false, error: 'unauthenticated' };
    try {
      const { room } = await this.rooms.join(
        { id: client.userId },
        { roomId: body?.roomId, accessCode: body?.accessCode },
      );
      await client.join(`room:${room.id}`);
      const view = await this.rooms.view({ id: client.userId }, room.id);
      this.server.to(`room:${room.id}`).emit('room:update', view);
      return { ok: true, room: view };
    } catch (error) {
      return { ok: false, error: this.messageOf(error) };
    }
  }

  @SubscribeMessage('room:leave')
  async handleRoomLeave(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: RoomIdPayload,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!client.userId) return { ok: false, error: 'unauthenticated' };
    try {
      await this.rooms.leave({ id: client.userId }, body.roomId);
      await client.leave(`room:${body.roomId}`);
      this.server.to(`room:${body.roomId}`).emit('room:left', { userId: client.userId });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: this.messageOf(error) };
    }
  }

  @SubscribeMessage('room:ready')
  async handleReady(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: ReadyPayload,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!client.userId) return { ok: false, error: 'unauthenticated' };
    try {
      await this.rooms.setReady({ id: client.userId }, body.roomId, body.isReady);
      const view = await this.rooms.view({ id: client.userId }, body.roomId);
      this.server.to(`room:${body.roomId}`).emit('room:update', view);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: this.messageOf(error) };
    }
  }

  @SubscribeMessage('room:start')
  async handleRoomStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: RoomIdPayload,
  ): Promise<{ ok: boolean; error?: string; sessionId?: string; channel?: string }> {
    if (!client.userId) return { ok: false, error: 'unauthenticated' };
    try {
      const { sessionId, channel } = await this.rooms.start({ id: client.userId }, body.roomId);
      const session = this.sessions.get(sessionId);
      // Seat every human member into the game channel + presence.
      if (session) {
        for (const seat of session.seats) {
          if (seat.isBot) continue;
          const sockets = await this.server.in(USER_ROOM(seat.playerId)).fetchSockets();
          for (const sock of sockets) {
            await sock.join(GAME_ROOM(sessionId));
            this.sessions.connectPlayer(session, seat.playerId, sock.id);
          }
        }
      }
      this.server.to(`room:${body.roomId}`).emit('room:started', { sessionId, channel });
      return { ok: true, sessionId, channel };
    } catch (error) {
      return { ok: false, error: this.messageOf(error) };
    }
  }

  // ── Live play ────────────────────────────────────────────────────────────

  @SubscribeMessage('game:join')
  async handleGameJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { sessionId: string },
  ): Promise<{ ok: boolean; error?: string; snapshot?: unknown }> {
    if (!client.userId) return { ok: false, error: 'unauthenticated' };
    const session = this.sessions.get(body?.sessionId);
    if (!session) return { ok: false, error: 'Table not found or already finished.' };
    await client.join(GAME_ROOM(session.sessionId));
    if (session.playerSeat.has(client.userId)) {
      this.sessions.connectPlayer(session, client.userId, client.id);
      return { ok: true, snapshot: this.sessions.viewForPlayer(session, client.userId) };
    }
    // Spectator.
    return { ok: true, snapshot: this.sessions.viewForSpectator(session) };
  }

  @SubscribeMessage('game:action')
  handleAction(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: ActionPayload,
  ): { ok: boolean; error?: string } {
    if (!client.userId) return { ok: false, error: 'unauthenticated' };
    const session = this.sessions.get(body?.sessionId);
    if (!session) return { ok: false, error: 'Table not found or already finished.' };
    const result = this.sessions.submitAction(session, client.userId, body.type, body.payload ?? {});
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  }

  @SubscribeMessage('game:chat')
  handleGameChat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { sessionId: string; text?: string },
  ): { ok: boolean; error?: string } {
    if (!client.userId) return { ok: false, error: 'unauthenticated' };
    const session = this.sessions.get(body?.sessionId);
    if (!session) return { ok: false, error: 'Table not found.' };
    const seat = session.playerSeat.get(client.userId);
    // Only seated players may chat at the table (spectators watch quietly).
    if (seat === undefined) return { ok: false, error: 'Only players can chat here.' };
    const text = String(body.text ?? '').trim().slice(0, 240);
    if (!text) return { ok: false, error: 'Message is empty.' };
    // Emoji/quick-chat friendly; no bot flag or sensitive data is attached.
    this.server.to(GAME_ROOM(session.sessionId)).emit('game:chat:message', {
      sessionId: session.sessionId,
      seat,
      sender: client.displayName ?? 'Player',
      avatarUrl: client.avatarUrl ?? null,
      text,
      at: new Date().toISOString(),
    });
    return { ok: true };
  }

  @SubscribeMessage('game:spectate')
  async handleSpectate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: SpectatePayload,
  ): Promise<{ ok: boolean; error?: string; snapshot?: unknown }> {
    if (!client.userId) return { ok: false, error: 'unauthenticated' };
    let session = body?.sessionId ? this.sessions.get(body.sessionId) : undefined;
    if (!session && body?.roomId) session = this.sessions.getByRoom(body.roomId);
    if (!session) return { ok: false, error: 'No live table to spectate.' };
    await client.join(GAME_ROOM(session.sessionId));
    return { ok: true, snapshot: this.sessions.viewForSpectator(session) };
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private extractToken(client: Socket): string | null {
    const header = client.handshake.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);
    const auth = (client.handshake.auth as { token?: string } | undefined)?.token;
    return auth ?? null;
  }

  private messageOf(error: unknown): string {
    if (error instanceof Error) return error.message;
    return 'Unexpected error.';
  }
}
