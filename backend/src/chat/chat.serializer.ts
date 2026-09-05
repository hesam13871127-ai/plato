import { ChatParticipantEntity } from '../database/entities/chat-participant.entity';
import { ChatEntity } from '../database/entities/chat.entity';
import { MessageReactionEntity } from '../database/entities/message-reaction.entity';
import { MessageEntity } from '../database/entities/message.entity';
import { PresenceService } from './presence.service';
import type { AuthorSummary } from './chat.service';

export interface ReactionGroup {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface MessageDto {
  id: string;
  chatId: string;
  senderId: string;
  type: string;
  body: string;
  metadata: Record<string, unknown> | null;
  replyToId: string | null;
  replyPreview: { id: string; body: string; senderName: string } | null;
  isPinned: boolean;
  reactions: ReactionGroup[];
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  author: (AuthorSummary & { online: boolean }) | null;
}

export interface ChatListItemDto {
  id: string;
  type: string;
  title: string | null;
  avatarUrl: string | null;
  themeKey: string | null;
  isPublic: boolean;
  isMuted: boolean;
  role: string;
  unread: number;
  memberCount: number;
  lastMessageAt: string | null;
  lastMessage: { id: string; body: string; senderId: string; type: string; createdAt: string } | null;
  other: AuthorSummary | null;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function toMessageDto(
  message: MessageEntity,
  presence: PresenceService,
  authorLookup: (userId: string) => Promise<AuthorSummary | null>,
  reactionLookup?: (messageId: string) => Promise<MessageReactionEntity[]>,
  replyPreview?: MessageEntity | null,
): Promise<MessageDto> {
  const deleted = !!message.deletedAt;
  const reactions: ReactionGroup[] = [];
  if (!deleted && reactionLookup) {
    const rows = await reactionLookup(message.id);
    const grouped = new Map<string, string[]>();
    for (const row of rows) {
      const list = grouped.get(row.emoji) ?? [];
      list.push(row.userId);
      grouped.set(row.emoji, list);
    }
    for (const [emoji, userIds] of grouped) {
      reactions.push({ emoji, count: userIds.length, userIds });
    }
  }

  const author = deleted ? null : await authorLookup(message.senderId);
  let reply: MessageDto['replyPreview'] = null;
  if (!deleted && replyPreview) {
    const parentAuthor = replyPreview.deletedAt
      ? null
      : await authorLookup(replyPreview.senderId);
    reply = {
      id: replyPreview.id,
      body: replyPreview.deletedAt ? '' : replyPreview.body,
      senderName: replyPreview.deletedAt
        ? 'Message removed'
        : (parentAuthor?.displayName ?? 'Someone'),
    };
  }

  return {
    id: message.id,
    chatId: message.chatId,
    senderId: message.senderId,
    type: message.type,
    body: deleted ? '' : message.body,
    metadata: deleted ? null : (message.metadata ?? null),
    replyToId: message.replyToId,
    replyPreview: reply,
    isPinned: message.isPinned,
    reactions,
    editedAt: toIso(message.editedAt),
    deletedAt: toIso(message.deletedAt),
    createdAt: toIso(message.createdAt)!,
    author: author
      ? { ...author, online: presence.isOnline(author.id) }
      : null,
  };
}

export function toChatListItem(
  chat: ChatEntity,
  participant: ChatParticipantEntity,
  unread: number,
  memberCount: number,
  lastMessage: MessageEntity | null,
  other: AuthorSummary | null,
): ChatListItemDto {
  const title = chat.type === 'direct' ? (other?.displayName ?? 'Chat') : chat.title;
  return {
    id: chat.id,
    type: chat.type,
    title,
    avatarUrl: chat.type === 'direct' ? (other?.avatarUrl ?? null) : chat.avatarUrl,
    themeKey: chat.themeKey,
    isPublic: chat.isPublic,
    isMuted: participant.isMuted,
    role: participant.role,
    unread,
    memberCount,
    lastMessageAt: toIso(chat.lastMessageAt),
    lastMessage: lastMessage
      ? {
          id: lastMessage.id,
          body: lastMessage.deletedAt ? '' : lastMessage.body,
          senderId: lastMessage.senderId,
          type: lastMessage.type,
          createdAt: toIso(lastMessage.createdAt)!,
        }
      : null,
    other,
  };
}
