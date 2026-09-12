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
import { MessageReactionEntity } from '../database/entities/message-reaction.entity';
import { MessageEntity } from '../database/entities/message.entity';
import { ChatService } from './chat.service';
import { toMessageDto } from './chat.serializer';
import { ModerationService } from '../moderation/moderation.service';
import { AutoModerationService } from '../moderation/auto-moderation.service';
import { RateLimitService } from '../common/security/rate-limit.service';
import { ErrorTrackingService } from '../common/observability/error-tracking.service';
import { PresenceService } from './presence.service';
import { VoiceService } from './voice.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  displayName?: string;
}

interface SendMessagePayload {
  chatId: string;
  body: string;
  type?: string;
  replyToId?: string;
  metadata?: Record<string, unknown>;
  clientId?: string;
}

interface ChatIdPayload {
  chatId: string;
}

interface TypingPayload extends ChatIdPayload {
  isTyping?: boolean;
}

interface ReactionPayload {
  messageId: string;
  emoji: string;
}

interface EditPayload {
  messageId: string;
  body: string;
}

interface PinPayload {
  messageId: string;
  pinned: boolean;
}

interface VoiceStatePayload extends ChatIdPayload {
  isMuted?: boolean;
  isSpeaking?: boolean;
  isDeafened?: boolean;
  isBroadcasting?: boolean;
}

const CHAT_ROOM = (chatId: string) => `chat:${chatId}`;
const USER_ROOM = (userId: string) => `user:${userId}`;

/**
 * Real-time chat + voice gateway. Every socket authenticates on the handshake
 * with a valid access token. Messages are persisted by ChatService (the source
 * of truth) and broadcast to chat rooms; ban/mute moderation runs before any
 * post is accepted.
 */
@WebSocketGateway({
  cors: { origin: true, credentials: true },
  namespace: '/',
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly chats: ChatService,
    private readonly presence: PresenceService,
    private readonly moderation: ModerationService,
    private readonly autoModeration: AutoModerationService,
    private readonly rateLimiter: RateLimitService,
    private readonly voice: VoiceService,
    private readonly errorTracking: ErrorTrackingService,
  ) {}

  afterInit(): void {
    this.logger.log('Chat gateway initialised.');
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
      const author = await this.chats.authorSummary(client.userId);
      client.displayName = author.displayName;
      client.data.displayName = author.displayName;

      await client.join(USER_ROOM(client.userId));
      await this.presence.connect(client.userId, client.id);

      client.emit('authenticated', { userId: client.userId });
      // Notify users who share a chat with this user that they came online.
      this.broadcastPresence(client.userId, 'online');
      this.logger.log(`Socket connected: user=${client.userId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invalid token';
      const isExpired = (error as { name?: string })?.name === 'TokenExpiredError' || message === 'jwt expired';
      client.emit('unauthorized', {
        message: isExpired ? 'Access token expired.' : 'Invalid or expired access token.',
        code: isExpired ? 'token_expired' : 'invalid_token',
        expired: isExpired,
      });
      if (isExpired) {
        this.logger.debug(`Socket handshake expired: ${client.id}`);
      } else {
        void this.errorTracking?.track({
          level: 'warning',
          source: 'ws',
          message: `Socket handshake rejected: ${message}`,
          path: 'ws:/chat',
          context: { socketId: client.id },
        });
      }
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthenticatedSocket): Promise<void> {
    if (!client.userId) return;
    const voiceChats = await this.chats.endAllVoiceSessions(client.userId);
    for (const chatId of voiceChats) {
      await this.emitVoiceRoster(chatId);
    }
    await this.presence.disconnect(client.userId, client.id);
    this.broadcastPresence(client.userId, 'offline');
    this.logger.log(`Socket disconnected: user=${client.userId}`);
  }

  // ── Room membership ─────────────────────────────────────────────────────

  @SubscribeMessage('chat:join')
  async handleJoinChat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ChatIdPayload,
  ): Promise<{ joined?: boolean; role?: string; error?: string }> {
    if (!client.userId) return { error: 'unauthenticated' };
    try {
      const participant = await this.chats.assertMember(payload.chatId, client.userId);
      await client.join(CHAT_ROOM(payload.chatId));
      // Bring read cursor forward when opening a chat.
      await this.chats.markRead(client.userId, payload.chatId);
      client.to(CHAT_ROOM(payload.chatId)).emit('chat:read', {
        chatId: payload.chatId,
        userId: client.userId,
        lastReadAt: new Date().toISOString(),
      });
      return { joined: true, role: participant.role };
    } catch (error) {
      return { error: this.messageOf(error) };
    }
  }

  @SubscribeMessage('chat:leave')
  async handleLeaveChat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ChatIdPayload,
  ): Promise<{ left: boolean }> {
    await client.leave(CHAT_ROOM(payload.chatId));
    return { left: true };
  }

  // ── Messages ────────────────────────────────────────────────────────────

  @SubscribeMessage('chat:message:send')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: SendMessagePayload,
  ): Promise<{ ok: boolean; id?: string; error?: string }> {
    if (!client.userId) return { ok: false, error: 'unauthenticated' };
    try {
      // Global chat/login ban takes precedence over membership checks.
      await this.moderation.assertCanChat(client.userId);

      // Realtime rate limit: at most 20 messages per 10s per user.
      if (!this.rateLimiter.consume(`ws:chat:${client.userId}`, 20, 10_000)) {
        return { ok: false, error: 'You are sending messages too quickly. Please slow down.' };
      }

      // Auto-moderation: block severe toxicity/spam, censor mild profanity.
      const screened = this.autoModeration.screenMessage(client.userId, payload.body ?? '');
      if (!screened.allowed) {
        return { ok: false, error: screened.reason ?? 'Message rejected by the content filter.' };
      }

      await this.chats.assertMember(payload.chatId, client.userId);
      await this.moderation.assertNotMutedInChat(payload.chatId, client.userId);

      const entity = await this.chats.createMessage({
        chatId: payload.chatId,
        senderId: client.userId,
        body: screened.body,
        type: payload.type,
        replyToId: payload.replyToId,
        metadata: payload.metadata,
      });

      let replyPreview: MessageEntity | null = null;
      if (entity.replyToId) {
        replyPreview = await this.chats.findMessage(entity.replyToId);
      }
      const dto = await toMessageDto(
        entity,
        this.presence,
        (uid) => this.chats.authorSummary(uid),
        (mid) => this.chats.reactionsForMessage(mid),
        replyPreview,
      );

      this.server.to(CHAT_ROOM(payload.chatId)).emit('chat:message', { ...dto, clientId: payload.clientId });
      // Push notifications to participants not currently in the socket room.
      await this.notifyAbsentParticipants(payload.chatId, dto);
      return { ok: true, id: entity.id };
    } catch (error) {
      return { ok: false, error: this.messageOf(error) };
    }
  }

  @SubscribeMessage('message:edit')
  async handleEdit(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: EditPayload,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!client.userId) return { ok: false, error: 'unauthenticated' };
    try {
      await this.moderation.assertCanChat(client.userId);
      const screened = this.autoModeration.screenMessage(client.userId, payload.body ?? '');
      if (!screened.allowed) {
        return { ok: false, error: screened.reason ?? 'Message rejected by the content filter.' };
      }
      const updated = await this.chats.editMessage(client.userId, payload.messageId, screened.body);
      this.server.to(CHAT_ROOM(updated.chatId)).emit('message:edited', {
        id: updated.id,
        chatId: updated.chatId,
        body: updated.body,
        editedAt: updated.editedAt?.toISOString() ?? null,
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: this.messageOf(error) };
    }
  }

  @SubscribeMessage('message:delete')
  async handleDelete(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { messageId: string; asModerator?: boolean },
  ): Promise<{ ok: boolean; error?: string }> {
    if (!client.userId) return { ok: false, error: 'unauthenticated' };
    try {
      const deleted = await this.chats.deleteMessage(
        client.userId,
        payload.messageId,
        payload.asModerator ?? false,
      );
      this.server.to(CHAT_ROOM(deleted.chatId)).emit('message:deleted', {
        id: deleted.id,
        chatId: deleted.chatId,
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: this.messageOf(error) };
    }
  }

  @SubscribeMessage('message:reaction')
  async handleReaction(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ReactionPayload,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!client.userId) return { ok: false, error: 'unauthenticated' };
    try {
      const message = await this.chats.findMessage(payload.messageId);
      if (!message) return { ok: false, error: 'Message not found.' };
      const { added, reactions } = await this.chats.toggleReaction(
        client.userId,
        payload.messageId,
        payload.emoji,
      );
      this.server.to(CHAT_ROOM(message.chatId)).emit('message:reaction:update', {
        messageId: payload.messageId,
        chatId: message.chatId,
        groups: this.groupReactions(reactions),
        by: { userId: client.userId, emoji: payload.emoji, added },
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: this.messageOf(error) };
    }
  }

  @SubscribeMessage('message:pin')
  async handlePin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: PinPayload,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!client.userId) return { ok: false, error: 'unauthenticated' };
    try {
      const { chat, message } = await this.chats.setPinned(client.userId, payload.messageId, payload.pinned);
      this.server.to(CHAT_ROOM(chat.id)).emit('message:pinned', {
        chatId: chat.id,
        messageId: message.id,
        pinned: payload.pinned,
        pinnedBy: client.userId,
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: this.messageOf(error) };
    }
  }

  @SubscribeMessage('chat:read')
  async handleReadReceipt(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ChatIdPayload,
  ): Promise<{ ok: boolean }> {
    if (!client.userId) return { ok: false };
    await this.chats.markRead(client.userId, payload.chatId);
    client.to(CHAT_ROOM(payload.chatId)).emit('chat:read', {
      chatId: payload.chatId,
      userId: client.userId,
      lastReadAt: new Date().toISOString(),
    });
    return { ok: true };
  }

  // ── Typing ──────────────────────────────────────────────────────────────

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: TypingPayload,
  ): { ok: boolean } {
    if (!client.userId) return { ok: false };
    client.to(CHAT_ROOM(payload.chatId)).emit('typing', {
      chatId: payload.chatId,
      userId: client.userId,
      displayName: client.displayName ?? 'Player',
      isTyping: payload.isTyping ?? true,
    });
    return { ok: true };
  }

  // ── Voice ───────────────────────────────────────────────────────────────

  @SubscribeMessage('voice:join')
  async handleVoiceJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ChatIdPayload,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!client.userId) return { ok: false, error: 'unauthenticated' };
    try {
      await this.chats.assertMember(payload.chatId, client.userId);
      const identity = this.voice.identityForUser(client.userId);
      await this.chats.startVoiceSession({ chatId: payload.chatId, userId: client.userId, identity });
      await client.join(this.voiceRoom(payload.chatId));
      this.server.to(CHAT_ROOM(payload.chatId)).emit('voice:join', {
        chatId: payload.chatId,
        userId: client.userId,
        displayName: client.displayName ?? 'Player',
      });
      await this.emitVoiceRoster(payload.chatId);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: this.messageOf(error) };
    }
  }

  @SubscribeMessage('voice:leave')
  async handleVoiceLeave(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ChatIdPayload,
  ): Promise<{ ok: boolean }> {
    if (!client.userId) return { ok: false };
    await this.leaveVoice(client, payload.chatId);
    return { ok: true };
  }

  @SubscribeMessage('voice:state')
  async handleVoiceState(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: VoiceStatePayload,
  ): Promise<{ ok: boolean }> {
    if (!client.userId) return { ok: false };
    await this.chats.updateVoiceState(payload.chatId, client.userId, {
      ...(payload.isMuted !== undefined ? { isMuted: payload.isMuted } : {}),
      ...(payload.isSpeaking !== undefined ? { isSpeaking: payload.isSpeaking } : {}),
      ...(payload.isDeafened !== undefined ? { isDeafened: payload.isDeafened } : {}),
      ...(payload.isBroadcasting !== undefined ? { isBroadcasting: payload.isBroadcasting } : {}),
    });
    client.to(CHAT_ROOM(payload.chatId)).emit('voice:state', {
      chatId: payload.chatId,
      userId: client.userId,
      isMuted: payload.isMuted,
      isSpeaking: payload.isSpeaking,
      isDeafened: payload.isDeafened,
      isBroadcasting: payload.isBroadcasting,
    });
    return { ok: true };
  }

  // ── Presence queries ────────────────────────────────────────────────────

  @SubscribeMessage('presence:request')
  handlePresenceRequest(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { userIds: string[] },
  ): { ok: boolean; presence: unknown } {
    const ids = Array.isArray(payload?.userIds) ? payload.userIds.slice(0, 200) : [];
    return { ok: true, presence: this.presence.snapshotFor(ids) };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private voiceRoom(chatId: string): string {
    return `voice:${chatId}`;
  }

  private async leaveVoice(client: AuthenticatedSocket, chatId: string): Promise<void> {
    if (!client.userId) return;
    await client.leave(this.voiceRoom(chatId));
    await this.chats.endVoiceSession(chatId, client.userId);
    this.server.to(CHAT_ROOM(chatId)).emit('voice:leave', { chatId, userId: client.userId });
    await this.emitVoiceRoster(chatId);
  }

  async emitVoiceRoster(chatId: string): Promise<void> {
    const sessions = await this.chats.listVoiceSessions(chatId);
    const roster = await Promise.all(
      sessions.map(async (s) => {
        const author = await this.chats.authorSummary(s.userId);
        return {
          userId: s.userId,
          identity: s.identity,
          displayName: author.displayName,
          avatarUrl: author.avatarUrl,
          isMuted: s.isMuted,
          isSpeaking: s.isSpeaking,
          isDeafened: s.isDeafened,
          isBroadcasting: s.isBroadcasting,
        };
      }),
    );
    this.server.to(CHAT_ROOM(chatId)).emit('voice:roster', { chatId, participants: roster });
  }

  private groupReactions(rows: MessageReactionEntity[]): Array<{ emoji: string; count: number; userIds: string[] }> {
    const map = new Map<string, string[]>();
    for (const row of rows) {
      const list = map.get(row.emoji) ?? [];
      list.push(row.userId);
      map.set(row.emoji, list);
    }
    return [...map.entries()].map(([emoji, userIds]) => ({ emoji, count: userIds.length, userIds }));
  }

  /** Notifies participants who are not currently in the chat socket room. */
  private async notifyAbsentParticipants(chatId: string, dto: unknown): Promise<void> {
    const members = await this.chats.memberSummaries(chatId);
    for (const member of members) {
      const room = CHAT_ROOM(chatId);
      const sockets = await this.server.in(room).fetchSockets();
      const inRoom = sockets.some((s) => (s.data as { userId?: string }).userId === member.id);
      if (!inRoom) {
        this.server.to(USER_ROOM(member.id)).emit('chat:notification', { chatId, message: dto });
      }
    }
  }

  private broadcastPresence(userId: string, presence: 'online' | 'offline'): void {
    // Presence is delivered via user rooms; clients query on demand for others.
    this.server.emit('presence:update', { userId, presence });
  }

  private messageOf(error: unknown): string {
    if (error instanceof Error) return error.message;
    return 'An unexpected error occurred.';
  }

  private extractToken(client: Socket): string | null {
    const handshakeToken = client.handshake.auth?.token ?? client.handshake.query?.token;
    if (typeof handshakeToken === 'string' && handshakeToken.length > 0) {
      return handshakeToken;
    }
    const authHeader = client.handshake.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice('Bearer '.length);
    }
    return null;
  }
}
