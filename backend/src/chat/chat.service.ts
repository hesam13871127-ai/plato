import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { ChatParticipantEntity } from '../database/entities/chat-participant.entity';
import { ChatEntity } from '../database/entities/chat.entity';
import { MessageReactionEntity } from '../database/entities/message-reaction.entity';
import { MessageEntity } from '../database/entities/message.entity';
import { ProfileEntity } from '../database/entities/profile.entity';
import { UserEntity } from '../database/entities/user.entity';
import { VoiceSessionEntity } from '../database/entities/voice-session.entity';
import { ChatMemberRole, ChatType } from '../database/enums';
import { PresenceService } from './presence.service';

const MAX_GROUP_MEMBERS = 100;
const DIRECT_CONTEXT = null;

export interface AuthorSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  online?: boolean;
  lastSeenAt?: Date | null;
}

/**
 * Persistence + permission logic for chats and messages. Real-time
 * broadcasting lives in the gateway; this service is the single source of
 * truth for data and access rules.
 */
@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatEntity)
    private readonly chats: Repository<ChatEntity>,
    @InjectRepository(ChatParticipantEntity)
    private readonly participants: Repository<ChatParticipantEntity>,
    @InjectRepository(MessageEntity)
    private readonly messages: Repository<MessageEntity>,
    @InjectRepository(MessageReactionEntity)
    private readonly reactions: Repository<MessageReactionEntity>,
    @InjectRepository(VoiceSessionEntity)
    private readonly voiceSessions: Repository<VoiceSessionEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    private readonly presence: PresenceService,
    private readonly dataSource: DataSource,
  ) {}

  // ── Chat creation / lookup ──────────────────────────────────────────────

  /** Finds or creates the 1:1 direct chat between two users. Idempotently
   * ensures both users are participants (so either side can open/read it). */
  async getOrCreateDirectChat(userId: string, otherUserId: string): Promise<ChatEntity> {
    if (userId === otherUserId) {
      throw new BadRequestException('You cannot start a chat with yourself.');
    }
    const other = await this.users.findOne({ where: { id: otherUserId } });
    if (!other) throw new NotFoundException('User not found.');

    const existing = await this.findDirectChat(userId, otherUserId);
    if (existing) {
      await this.ensureParticipant(existing.id, userId, 'member');
      await this.ensureParticipant(existing.id, otherUserId, 'member');
      return existing;
    }

    const chat = await this.dataSource.transaction(async (manager) => {
      const created = manager.create(ChatEntity, {
        type: 'direct',
        title: null,
        contextId: DIRECT_CONTEXT,
        isPublic: false,
      });
      const saved = await manager.save(created);
      const rows = [userId, otherUserId].map((uid) =>
        manager.create(ChatParticipantEntity, {
          chatId: saved.id,
          userId: uid,
          role: 'member',
          lastReadAt: new Date(),
        }),
      );
      await manager.save(rows);
      return saved;
    });
    // Ensure rows exist outside the transaction view too (idempotent).
    await this.ensureParticipant(chat.id, userId, 'member');
    await this.ensureParticipant(chat.id, otherUserId, 'member');
    return chat;
  }

  private async findDirectChat(a: string, b: string): Promise<ChatEntity | null> {
    // Load direct chats involving a, then check b is the other participant.
    const mine = await this.participants.find({ where: { userId: a } });
    const chatIds = mine.map((p) => p.chatId);
    if (chatIds.length === 0) return null;
    const chats = await this.chats.find({ where: { id: In(chatIds), type: 'direct' } });
    for (const chat of chats) {
      const others = await this.participants.find({ where: { chatId: chat.id } });
      const userIds = others.map((p) => p.userId);
      if (userIds.includes(b) && userIds.length === 2) return chat;
    }
    return null;
  }

  /** Creates a group chat with the creator as owner. */
  async createGroupChat(
    ownerId: string,
    data: { title: string; description?: string; memberIds?: string[]; accessPass?: string; themeKey?: string },
  ): Promise<ChatEntity> {
    const members = new Set<string>([ownerId, ...(data.memberIds ?? [])]);
    if (members.size > MAX_GROUP_MEMBERS) {
      throw new BadRequestException(`A group chat can hold at most ${MAX_GROUP_MEMBERS} members.`);
    }
    for (const uid of members) {
      const exists = await this.users.count({ where: { id: uid } });
      if (!exists) throw new BadRequestException(`User ${uid} does not exist.`);
    }

    return this.dataSource.transaction(async (manager) => {
      const chat = manager.create(ChatEntity, {
        type: 'group',
        title: data.title,
        contextId: null,
        accessPass: data.accessPass ?? null,
        themeKey: data.themeKey ?? null,
        isPublic: false,
      });
      const saved = await manager.save(chat);
      const rows = [...members].map((uid) =>
        manager.create(ChatParticipantEntity, {
          chatId: saved.id,
          userId: uid,
          role: uid === ownerId ? 'owner' : 'member',
          lastReadAt: new Date(),
        }),
      );
      await manager.save(rows);
      return saved;
    });
  }

  /** Ensures the public Lounge chat exists and joins the user to it. */
  async getOrCreateLounge(userId: string): Promise<ChatEntity> {
    let lounge = await this.chats.findOne({ where: { type: 'lounge', isPublic: true } });
    if (!lounge) {
      lounge = await this.dataSource.transaction(async (manager) => {
        const chat = manager.create(ChatEntity, {
          type: 'lounge',
          title: 'Lounge',
          isPublic: true,
          contextId: null,
        });
        return manager.save(chat);
      });
    }
    await this.ensureParticipant(lounge.id, userId, 'member');
    return lounge;
  }

  /** Finds or creates the ephemeral in-game chat attached to a room. */
  async getOrCreateRoomChat(userId: string, roomId: string): Promise<ChatEntity> {
    let chat = await this.chats.findOne({ where: { type: 'room', contextId: roomId } });
    if (!chat) {
      chat = await this.dataSource.transaction(async (manager) => {
        const created = manager.create(ChatEntity, {
          type: 'room',
          title: `Table ${roomId.slice(0, 8)}`,
          contextId: roomId,
          isPublic: false,
        });
        return manager.save(created);
      });
    }
    // Room chat membership follows room seat; joining ensures presence.
    await this.ensureParticipant(chat.id, userId, 'member');
    return chat;
  }

  async ensureParticipant(chatId: string, userId: string, role: ChatMemberRole): Promise<void> {
    const existing = await this.participants.findOne({ where: { chatId, userId } });
    if (existing) return;
    await this.participants.save(
      this.participants.create({ chatId, userId, role, lastReadAt: new Date() }),
    );
  }

  // ── Membership / access ─────────────────────────────────────────────────

  async getParticipant(chatId: string, userId: string): Promise<ChatParticipantEntity | null> {
    return this.participants.findOne({ where: { chatId, userId } });
  }

  async memberCount(chatId: string): Promise<number> {
    return this.participants.count({ where: { chatId } });
  }

  /** Throws unless the user is a participant of the chat. */
  async assertMember(chatId: string, userId: string): Promise<ChatParticipantEntity> {
    const participant = await this.getParticipant(chatId, userId);
    if (!participant) throw new ForbiddenException('You are not a member of this chat.');
    return participant;
  }

  async isMember(chatId: string, userId: string): Promise<boolean> {
    return !!(await this.getParticipant(chatId, userId));
  }

  /** Joins a group/lounge chat, honouring the Chat Pass. */
  async joinChat(userId: string, chatId: string, accessPass?: string): Promise<ChatEntity> {
    const chat = await this.chats.findOne({ where: { id: chatId } });
    if (!chat) throw new NotFoundException('Chat not found.');
    if (chat.type !== 'group' && chat.type !== 'lounge' && chat.type !== 'room') {
      throw new BadRequestException('This chat cannot be joined directly.');
    }
    const existing = await this.getParticipant(chatId, userId);
    if (existing) return chat;

    const count = await this.participants.count({ where: { chatId } });
    if (chat.type === 'group' && count >= MAX_GROUP_MEMBERS) {
      throw new BadRequestException(`This group is full (max ${MAX_GROUP_MEMBERS}).`);
    }
    if (chat.accessPass && chat.accessPass !== accessPass) {
      throw new ForbiddenException('Incorrect Chat Pass.');
    }
    await this.ensureParticipant(chatId, userId, 'member');
    return chat;
  }

  async leaveChat(userId: string, chatId: string): Promise<void> {
    const participant = await this.getParticipant(chatId, userId);
    if (!participant) return;
    const chat = await this.chats.findOne({ where: { id: chatId } });
    if (chat?.type === 'direct') {
      throw new BadRequestException('You cannot leave a direct chat.');
    }
    await this.participants.delete({ id: participant.id });
    if (chat?.type === 'group') {
      // If the owner leaves, promote the oldest remaining member.
      if (participant.role === 'owner') {
        const next = await this.participants.findOne({
          where: { chatId },
          order: { joinedAt: 'ASC' },
        });
        if (next) {
          next.role = 'owner';
          await this.participants.save(next);
        }
      }
    }
  }

  async addMembers(actorId: string, chatId: string, memberIds: string[]): Promise<void> {
    const chat = await this.chats.findOne({ where: { id: chatId } });
    if (!chat) throw new NotFoundException('Chat not found.');
    if (chat.type !== 'group') throw new BadRequestException('Only group chats can add members.');
    await this.assertManager(chatId, actorId);

    const current = await this.participants.count({ where: { chatId } });
    const incoming = memberIds.filter((id) => id !== actorId);
    if (current + incoming.length > MAX_GROUP_MEMBERS) {
      throw new BadRequestException(`This group can hold at most ${MAX_GROUP_MEMBERS} members.`);
    }
    for (const uid of incoming) {
      await this.ensureParticipant(chatId, uid, 'member');
    }
  }

  async removeMember(actorId: string, chatId: string, targetUserId: string): Promise<void> {
    await this.assertManager(chatId, actorId);
    if (actorId === targetUserId) {
      await this.leaveChat(actorId, chatId);
      return;
    }
    const target = await this.getParticipant(chatId, targetUserId);
    if (!target) throw new NotFoundException('User is not in this chat.');
    await this.participants.delete({ id: target.id });
  }

  async setMemberRole(actorId: string, chatId: string, targetUserId: string, role: 'admin' | 'member'): Promise<void> {
    await this.assertManager(chatId, actorId);
    const target = await this.getParticipant(chatId, targetUserId);
    if (!target) throw new NotFoundException('User is not in this chat.');
    target.role = role;
    await this.participants.save(target);
  }

  async updateChatSettings(
    actorId: string,
    chatId: string,
    settings: { title?: string; accessPass?: string | null; themeKey?: string | null },
  ): Promise<ChatEntity> {
    const chat = await this.chats.findOne({ where: { id: chatId } });
    if (!chat) throw new NotFoundException('Chat not found.');
    if (chat.type !== 'group' && chat.type !== 'lounge') {
      throw new BadRequestException('Only group chats have editable settings.');
    }
    await this.assertManager(chatId, actorId);
    if (settings.title !== undefined) chat.title = settings.title;
    if (settings.accessPass !== undefined) chat.accessPass = settings.accessPass;
    if (settings.themeKey !== undefined) chat.themeKey = settings.themeKey;
    return this.chats.save(chat);
  }

  /** Transfers group-chat ownership to another member (owner only). */
  async transferChatOwnership(
    actorId: string,
    chatId: string,
    targetUserId: string,
  ): Promise<void> {
    const actor = await this.getParticipant(chatId, actorId);
    if (!actor || actor.role !== 'owner') {
      throw new ForbiddenException('Only the owner can transfer ownership.');
    }
    const target = await this.getParticipant(chatId, targetUserId);
    if (!target) throw new NotFoundException('That user is not in this chat.');
    actor.role = 'admin';
    target.role = 'owner';
    await this.participants.save([actor, target]);
  }

  /** Owner/admin check. */
  async assertManager(chatId: string, userId: string): Promise<ChatParticipantEntity> {
    const participant = await this.assertMember(chatId, userId);
    if (participant.role !== 'owner' && participant.role !== 'admin') {
      throw new ForbiddenException('Only group owners or admins can do that.');
    }
    return participant;
  }

  // ── Messages ────────────────────────────────────────────────────────────

  /** Persists a message and returns it with author info. Caller has already
   * run ban/mute checks. */
  async createMessage(params: {
    chatId: string;
    senderId: string;
    body: string;
    type?: string;
    replyToId?: string;
    metadata?: Record<string, unknown> | null;
  }): Promise<MessageEntity> {
    const { chatId, senderId } = params;
    if (params.replyToId) {
      const parent = await this.messages.findOne({ where: { id: params.replyToId, chatId } });
      if (!parent) throw new BadRequestException('The message you are replying to was not found.');
    }

    return this.dataSource.transaction(async (manager) => {
      const message = manager.create(MessageEntity, {
        chatId,
        senderId,
        body: params.body,
        type: (params.type as MessageEntity['type']) ?? 'text',
        replyToId: params.replyToId ?? null,
        metadata: params.metadata ?? null,
        isPinned: false,
      });
      const saved = await manager.save(message);

      await manager.update(
        ChatEntity,
        { id: chatId },
        { lastMessageId: saved.id, lastMessageAt: saved.createdAt },
      );
      return saved;
    });
  }

  async getMessages(
    userId: string,
    chatId: string,
    options: { before?: string; limit?: number },
  ): Promise<MessageEntity[]> {
    await this.assertMember(chatId, userId);
    const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);

    let cutoff: Date | null = null;
    if (options.before) {
      const cursor = await this.messages.findOne({ where: { id: options.before } });
      if (cursor) cutoff = cursor.createdAt;
    }

    // Load via the repository (driver-agnostic column naming) then paginate in
    // memory by creation time + id so cursor paging behaves identically on
    // MySQL and SQLite.
    const all = await this.messages.find({
      where: { chatId },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: cutoff ? 500 : limit,
    });

    let rows = all;
    if (cutoff) {
      rows = all.filter(
        (m) => m.createdAt < cutoff || (m.createdAt.getTime() === cutoff.getTime() && m.id < (options.before ?? '')),
      );
      rows = rows.slice(0, limit);
    }
    return rows.reverse();
  }

  async findMessage(id: string): Promise<MessageEntity | null> {
    return this.messages.findOne({ where: { id } });
  }

  async editMessage(userId: string, messageId: string, body: string): Promise<MessageEntity> {
    const message = await this.messages.findOne({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found.');
    if (message.senderId !== userId) {
      throw new ForbiddenException('You can only edit your own messages.');
    }
    if (message.deletedAt) throw new BadRequestException('This message was deleted.');
    message.body = body;
    message.editedAt = new Date();
    return this.messages.save(message);
  }

  async deleteMessage(userId: string, messageId: string, asModerator = false): Promise<MessageEntity> {
    const message = await this.messages.findOne({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found.');
    const isOwner = message.senderId === userId;
    if (!isOwner && !asModerator) {
      throw new ForbiddenException('You can only delete your own messages.');
    }
    message.deletedAt = new Date();
    message.body = '';
    message.metadata = null;
    await this.messages.save(message);
    await this.reactions.delete({ messageId });
    return message;
  }

  // ── Reactions ───────────────────────────────────────────────────────────

  async toggleReaction(userId: string, messageId: string, emoji: string): Promise<{ added: boolean; reactions: MessageReactionEntity[] }> {
    const message = await this.messages.findOne({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found.');
    await this.assertMember(message.chatId, userId);

    const existing = await this.reactions.findOne({ where: { messageId, userId, emoji } });
    if (existing) {
      await this.reactions.delete({ id: existing.id });
      const reactions = await this.reactions.find({ where: { messageId } });
      return { added: false, reactions };
    }
    await this.reactions.save(this.reactions.create({ messageId, userId, emoji }));
    const reactions = await this.reactions.find({ where: { messageId } });
    return { added: true, reactions };
  }

  async reactionsForMessage(messageId: string): Promise<MessageReactionEntity[]> {
    return this.reactions.find({ where: { messageId } });
  }

  // ── Pins ────────────────────────────────────────────────────────────────

  async setPinned(
    actorId: string,
    messageId: string,
    pinned: boolean,
  ): Promise<{ chat: ChatEntity; message: MessageEntity }> {
    const message = await this.messages.findOne({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found.');
    await this.assertManager(message.chatId, actorId);

    return this.dataSource.transaction(async (manager) => {
      // Unpin any previously pinned message in the same chat.
      await manager.update(
        MessageEntity,
        { chatId: message.chatId, isPinned: true },
        { isPinned: false, pinnedAt: null, pinnedBy: null },
      );
      message.isPinned = pinned;
      message.pinnedAt = pinned ? new Date() : null;
      message.pinnedBy = pinned ? actorId : null;
      const savedMessage = await manager.save(message);
      await manager.update(
        ChatEntity,
        { id: message.chatId },
        { pinnedMessageId: pinned ? message.id : null },
      );
      const chat = await manager.findOne(ChatEntity, { where: { id: message.chatId } });
      return { chat: chat!, message: savedMessage };
    });
  }

  async getPinnedMessage(chatId: string): Promise<MessageEntity | null> {
    const chat = await this.chats.findOne({ where: { id: chatId } });
    if (!chat?.pinnedMessageId) return null;
    return this.messages.findOne({ where: { id: chat.pinnedMessageId } });
  }

  // ── Read receipts ───────────────────────────────────────────────────────

  async markRead(userId: string, chatId: string): Promise<void> {
    const participant = await this.getParticipant(chatId, userId);
    if (!participant) return;
    participant.lastReadAt = new Date();
    await this.participants.save(participant);
  }

  // ── List views ──────────────────────────────────────────────────────────

  async listChats(userId: string): Promise<Array<{ chat: ChatEntity; participant: ChatParticipantEntity; unread: number; lastMessage: MessageEntity | null; other: AuthorSummary | null }>> {
    const memberships = await this.participants.find({ where: { userId } });
    const chatIds = memberships.map((m) => m.chatId);
    if (chatIds.length === 0) return [];

    const chats = await this.chats.find({ where: { id: In(chatIds) }, order: { lastMessageAt: 'DESC' } });
    const result = [];
    for (const chat of chats) {
      const participant = memberships.find((m) => m.chatId === chat.id)!;
      const lastMessage = chat.lastMessageId
        ? await this.messages.findOne({ where: { id: chat.lastMessageId } })
        : null;
      const unread = await this.unreadCount(chat.id, participant.lastReadAt);
      const other: AuthorSummary | null =
        chat.type === 'direct' ? await this.directOther(chat.id, userId) : null;
      result.push({ chat, participant, unread, lastMessage, other });
    }
    result.sort((a, b) => {
      const ta = a.chat.lastMessageAt?.getTime() ?? a.chat.createdAt.getTime();
      const tb = b.chat.lastMessageAt?.getTime() ?? b.chat.createdAt.getTime();
      return tb - ta;
    });
    return result;
  }

  async unreadCount(chatId: string, since: Date): Promise<number> {
    const rows = await this.messages.find({
      where: { chatId, deletedAt: IsNull() },
      select: { id: true, createdAt: true },
    });
    return rows.filter((m) => m.createdAt > since).length;
  }

  /** The other participant in a direct chat (for titles/avatars). */
  async directOther(chatId: string, userId: string): Promise<AuthorSummary | null> {
    const others = await this.participants.find({ where: { chatId } });
    const otherRow = others.find((p) => p.userId !== userId);
    if (!otherRow) return null;
    return this.authorSummary(otherRow.userId);
  }

  async memberSummaries(chatId: string): Promise<Array<AuthorSummary & { role: ChatMemberRole; isMuted: boolean; online: boolean; lastSeenAt: Date | null }>> {
    const rows = await this.participants.find({ where: { chatId }, order: { joinedAt: 'ASC' } });
    const userIds = rows.map((r) => r.userId);
    const users = userIds.length ? await this.users.find({ where: { id: In(userIds) } }) : [];
    const online = this.presence.filterOnline(userIds);
    return rows.map((row) => {
      const user = users.find((u) => u.id === row.userId);
      return {
        id: row.userId,
        username: user?.profile?.username ?? '',
        displayName: user?.profile?.displayName ?? 'Player',
        avatarUrl: user?.profile?.avatarUrl ?? null,
        role: row.role,
        isMuted: row.isMuted,
        online: online.includes(row.userId),
        lastSeenAt: user?.lastSeenAt ?? null,
      };
    });
  }

  async authorSummary(userId: string): Promise<AuthorSummary> {
    const profile = await this.profiles.findOne({ where: { userId } });
    const user = await this.users.findOne({ where: { id: userId } });
    return {
      id: userId,
      username: profile?.username ?? '',
      displayName: profile?.displayName ?? 'Player',
      avatarUrl: profile?.avatarUrl ?? null,
      online: this.presence.isOnline(userId),
      lastSeenAt: user?.lastSeenAt ?? null,
    } as AuthorSummary;
  }

  // ── Voice sessions (roster) ─────────────────────────────────────────────

  async startVoiceSession(params: { chatId: string; userId: string; identity: string }): Promise<VoiceSessionEntity> {
    await this.assertMember(params.chatId, params.userId);
    const existing = await this.voiceSessions.findOne({
      where: { chatId: params.chatId, userId: params.userId },
    });
    if (existing) return existing;
    return this.voiceSessions.save(
      this.voiceSessions.create({
        chatId: params.chatId,
        userId: params.userId,
        identity: params.identity,
      }),
    );
  }

  async endVoiceSession(chatId: string, userId: string): Promise<void> {
    await this.voiceSessions.delete({ chatId, userId });
  }

  async listVoiceSessions(chatId: string): Promise<VoiceSessionEntity[]> {
    return this.voiceSessions.find({ where: { chatId }, order: { joinedAt: 'ASC' } });
  }

  async updateVoiceState(
    chatId: string,
    userId: string,
    patch: Partial<Pick<VoiceSessionEntity, 'isMuted' | 'isDeafened' | 'isSpeaking' | 'isBroadcasting'>>,
  ): Promise<VoiceSessionEntity | null> {
    const session = await this.voiceSessions.findOne({ where: { chatId, userId } });
    if (!session) return null;
    Object.assign(session, patch);
    return this.voiceSessions.save(session);
  }

  /** Cleans up voice sessions for a user across all chats (on disconnect). */
  async endAllVoiceSessions(userId: string): Promise<string[]> {
    const sessions = await this.voiceSessions.find({ where: { userId } });
    const chatIds = sessions.map((s) => s.chatId);
    await this.voiceSessions.delete({ userId });
    return chatIds;
  }

  // ── Misc ────────────────────────────────────────────────────────────────

  async getChatOrThrow(chatId: string): Promise<ChatEntity> {
    const chat = await this.chats.findOne({ where: { id: chatId } });
    if (!chat) throw new NotFoundException('Chat not found.');
    return chat;
  }
}
