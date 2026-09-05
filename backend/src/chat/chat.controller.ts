import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ModerationService } from './moderation.service';
import { VoiceService } from './voice.service';
import { ChatService } from './chat.service';
import { PresenceService } from './presence.service';
import { toChatListItem, toMessageDto } from './chat.serializer';
import {
  AddMembersDto,
  CreateDirectChatDto,
  CreateGroupChatDto,
  JoinChatDto,
  JoinRoomChatDto,
  ModerationActionDto,
  MessageQueryDto,
  ReactDto,
  ReportMessageDto,
  ReportUserDto,
  SendMessageDto,
  UpdateChatSettingsDto,
  UpdateMemberDto,
  VoiceTokenDto,
} from './dto/chat.dto';

@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chats: ChatService,
    private readonly moderation: ModerationService,
    private readonly voice: VoiceService,
    private readonly presence: PresenceService,
  ) {}

  // ── Conversations ───────────────────────────────────────────────────────

  @Get('conversations')
  @ApiOperation({ summary: 'List the current user’s conversations.' })
  async listConversations(@CurrentUser('id') userId: string) {
    const rows = await this.chats.listChats(userId);
    const items = await Promise.all(
      rows.map(async (row) => {
        const count = await this.chats.memberCount(row.chat.id);
        return toChatListItem(row.chat, row.participant, row.unread, count, row.lastMessage, row.other ?? null);
      }),
    );
    return { items };
  }

  @Post('direct')
  @ApiOperation({ summary: 'Open (or create) a 1:1 direct chat with a user.' })
  async createDirect(@CurrentUser('id') userId: string, @Body() dto: CreateDirectChatDto) {
    const chat = await this.chats.getOrCreateDirectChat(userId, dto.userId);
    await this.chats.ensureParticipant(chat.id, userId, 'member');
    return { chatId: chat.id, type: chat.type };
  }

  @Post('group')
  @ApiOperation({ summary: 'Create a group chat (up to 100 members).' })
  async createGroup(@CurrentUser('id') userId: string, @Body() dto: CreateGroupChatDto) {
    const chat = await this.chats.createGroupChat(userId, {
      title: dto.title,
      description: dto.description,
      memberIds: dto.memberIds,
      accessPass: dto.accessPass,
      themeKey: dto.themeKey,
    });
    return { chatId: chat.id, type: chat.type };
  }

  @Get('lounge')
  @ApiOperation({ summary: 'Join the public Lounge chat.' })
  async joinLounge(@CurrentUser('id') userId: string) {
    const lounge = await this.chats.getOrCreateLounge(userId);
    return { chatId: lounge.id, type: lounge.type, title: lounge.title };
  }

  @Post('room')
  @ApiOperation({ summary: 'Get/create the in-game chat for a table room.' })
  async joinRoomChat(@CurrentUser('id') userId: string, @Body() dto: JoinRoomChatDto) {
    const chat = await this.chats.getOrCreateRoomChat(userId, dto.roomId);
    return { chatId: chat.id, type: chat.type, title: chat.title };
  }

  @Post(':chatId/join')
  @ApiOperation({ summary: 'Join a group/lounge chat (with optional Chat Pass).' })
  async joinChat(
    @CurrentUser('id') userId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Body() dto: JoinChatDto,
  ) {
    const chat = await this.chats.joinChat(userId, chatId, dto.accessPass);
    return { chatId: chat.id, type: chat.type };
  }

  @Post(':chatId/leave')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Leave a group chat.' })
  async leaveChat(@CurrentUser('id') userId: string, @Param('chatId', ParseUUIDPipe) chatId: string) {
    await this.chats.leaveChat(userId, chatId);
    return { left: true };
  }

  @Post(':chatId/members')
  @ApiOperation({ summary: 'Add members to a group chat (owner/admin).' })
  async addMembers(
    @CurrentUser('id') userId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Body() dto: AddMembersDto,
  ) {
    await this.chats.addMembers(userId, chatId, dto.memberIds);
    return { added: dto.memberIds.length };
  }

  @Post(':chatId/members/role')
  @ApiOperation({ summary: 'Promote/demote a group member (owner/admin).' })
  async setMemberRole(
    @CurrentUser('id') userId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    await this.chats.setMemberRole(userId, chatId, dto.userId, dto.role);
    return { updated: true };
  }

  @Post(':chatId/settings')
  @ApiOperation({ summary: 'Update group settings: title, Chat Pass, theme (owner/admin).' })
  async updateSettings(
    @CurrentUser('id') userId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Body() dto: UpdateChatSettingsDto,
  ) {
    const chat = await this.chats.updateChatSettings(userId, chatId, {
      title: dto.title,
      accessPass: dto.accessPass,
      themeKey: dto.themeKey,
    });
    return { chatId: chat.id, title: chat.title, themeKey: chat.themeKey };
  }

  @Get(':chatId/members')
  @ApiOperation({ summary: 'List members with roles and online presence.' })
  async members(
    @CurrentUser('id') userId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
  ) {
    await this.chats.assertMember(chatId, userId);
    const members = await this.chats.memberSummaries(chatId);
    return { members };
  }

  // ── Messages (REST for history) ─────────────────────────────────────────

  @Get(':chatId/messages')
  @ApiOperation({ summary: 'Paginated message history (newest last).' })
  async messages(
    @CurrentUser('id') userId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Query() query: MessageQueryDto,
  ) {
    const entities = await this.chats.getMessages(userId, chatId, {
      before: query.before,
      limit: query.limit,
    });
    const items = await Promise.all(
      entities.map(async (message) => {
        const reply = message.replyToId
          ? (await this.chats.findMessage(message.replyToId)) ?? null
          : null;
        return toMessageDto(
          message,
          this.presence,
          (uid) => this.chats.authorSummary(uid),
          (mid) => this.chats.reactionsForMessage(mid),
          reply,
        );
      }),
    );
    return { items };
  }

  @Get(':chatId/pinned')
  @ApiOperation({ summary: 'The currently pinned message for a chat.' })
  async pinned(
    @CurrentUser('id') userId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
  ) {
    await this.chats.assertMember(chatId, userId);
    const pinned = await this.chats.getPinnedMessage(chatId);
    if (!pinned) return { message: null };
    const dto = await toMessageDto(
      pinned,
      this.presence,
      (uid) => this.chats.authorSummary(uid),
      async (mid) => this.chats.reactionsForMessage(mid),
      null,
    );
    return { message: dto };
  }

  @Post(':chatId/messages')
  @ApiOperation({ summary: 'Send a message over REST (also broadcast in real time).' })
  async sendMessage(
    @CurrentUser('id') userId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Body() dto: SendMessageDto,
  ) {
    await this.moderation.assertCanChat(userId);
    await this.chats.assertMember(chatId, userId);
    await this.moderation.assertNotMutedInChat(chatId, userId);
    const entity = await this.chats.createMessage({
      chatId,
      senderId: userId,
      body: dto.body,
      type: dto.type,
      replyToId: dto.replyToId,
      metadata: dto.metadata,
    });
    const replyPreview = entity.replyToId ? await this.chats.findMessage(entity.replyToId) : null;
    const message = await toMessageDto(
      entity,
      this.presence,
      (uid) => this.chats.authorSummary(uid),
      async (mid) => this.chats.reactionsForMessage(mid),
      replyPreview,
    );
    return { message };
  }

  @Post(':chatId/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a chat as read up to now.' })
  async markRead(
    @CurrentUser('id') userId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
  ) {
    await this.chats.markRead(userId, chatId);
    return { read: true };
  }

  // ── Reactions / pin (REST convenience) ──────────────────────────────────

  @Post('messages/:messageId/react')
  async react(
    @CurrentUser('id') userId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: ReactDto,
  ) {
    const { added, reactions } = await this.chats.toggleReaction(userId, messageId, dto.emoji);
    return { added, reactionCount: reactions.length };
  }

  @Post('messages/:messageId/reply')
  async reply(
    @CurrentUser('id') userId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: SendMessageDto,
  ) {
    const parent = await this.chats.findMessage(messageId);
    if (!parent) return { error: 'Message not found.' };
    await this.moderation.assertCanChat(userId);
    await this.chats.assertMember(parent.chatId, userId);
    await this.moderation.assertNotMutedInChat(parent.chatId, userId);
    const entity = await this.chats.createMessage({
      chatId: parent.chatId,
      senderId: userId,
      body: dto.body,
      replyToId: messageId,
      metadata: dto.metadata,
    });
    const message = await toMessageDto(
      entity,
      this.presence,
      (uid) => this.chats.authorSummary(uid),
      async (mid) => this.chats.reactionsForMessage(mid),
      parent,
    );
    return { message };
  }

  // ── Moderation: report / mute / ban ─────────────────────────────────────

  @Post('report/message/:messageId')
  @ApiOperation({ summary: 'Report a message for moderation.' })
  async reportMessage(
    @CurrentUser('id') userId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: ReportMessageDto,
  ) {
    const message = await this.chats.findMessage(messageId);
    if (!message) return { filed: false };
    await this.moderation.fileReport({
      reporterId: userId,
      targetType: 'message',
      targetId: messageId,
      reason: dto.reason,
      details: dto.details,
    });
    return { filed: true };
  }

  @Post('report/user')
  @ApiOperation({ summary: 'Report a user for moderation.' })
  async reportUser(@CurrentUser('id') userId: string, @Body() dto: ReportUserDto) {
    await this.moderation.fileReport({
      reporterId: userId,
      targetType: 'user',
      targetId: dto.userId,
      reason: dto.reason,
      details: dto.details,
    });
    return { filed: true };
  }

  @Post('moderation/mute')
  @ApiOperation({ summary: 'Mute a user in a group chat (owner/admin).' })
  async mute(
    @CurrentUser('id') userId: string,
    @Body() dto: ModerationActionDto,
  ) {
    await this.chats.assertManager(dto.chatId, userId);
    await this.moderation.setChatMuted(dto.chatId, dto.userId, true);
    return { muted: true };
  }

  @Post('moderation/unmute')
  @ApiOperation({ summary: 'Unmute a user in a group chat (owner/admin).' })
  async unmute(
    @CurrentUser('id') userId: string,
    @Body() dto: ModerationActionDto,
  ) {
    await this.chats.assertManager(dto.chatId, userId);
    await this.moderation.setChatMuted(dto.chatId, dto.userId, false);
    return { muted: false };
  }

  @Post('moderation/ban')
  @ApiOperation({ summary: 'Ban a user from chat (owner/admin). The user is also removed.' })
  async ban(
    @CurrentUser('id') userId: string,
    @Body() dto: ModerationActionDto,
  ) {
    await this.chats.assertManager(dto.chatId, userId);
    await this.moderation.banUser({
      userId: dto.userId,
      bannedBy: userId,
      reason: dto.reason,
      durationMinutes: dto.durationMinutes,
      type: 'chat',
    });
    // Remove from the group if they are still a member (non-fatal if not).
    if (await this.chats.isMember(dto.chatId, dto.userId)) {
      await this.chats.removeMember(userId, dto.chatId, dto.userId);
    }
    return { banned: true };
  }

  @Post('moderation/kick')
  @ApiOperation({ summary: 'Remove a user from a group chat (owner/admin).' })
  async kick(
    @CurrentUser('id') userId: string,
    @Body() dto: ModerationActionDto,
  ) {
    await this.chats.removeMember(userId, dto.chatId, dto.userId);
    return { kicked: true };
  }

  // ── Voice ───────────────────────────────────────────────────────────────

  @Post('voice/token')
  @ApiOperation({ summary: 'Mint a LiveKit voice token for a chat’s voice channel.' })
  async voiceToken(@CurrentUser('id') userId: string, @Body() dto: VoiceTokenDto) {
    await this.chats.assertMember(dto.chatId, userId);
    const author = await this.chats.authorSummary(userId);
    const result = await this.voice.mintToken({
      chatId: dto.chatId,
      userId,
      displayName: author.displayName,
      canPublish: !(await this.moderation.isChatBanned(userId)),
    });
    return result;
  }

  @Get(':chatId/voice/participants')
  @ApiOperation({ summary: 'List current voice-channel participants.' })
  async voiceParticipants(
    @CurrentUser('id') userId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
  ) {
    await this.chats.assertMember(chatId, userId);
    const sessions = await this.chats.listVoiceSessions(chatId);
    const participants = await Promise.all(
      sessions.map(async (s) => {
        const author = await this.chats.authorSummary(s.userId);
        return {
          userId: s.userId,
          displayName: author.displayName,
          avatarUrl: author.avatarUrl,
          isMuted: s.isMuted,
          isSpeaking: s.isSpeaking,
          isBroadcasting: s.isBroadcasting,
          joinedAt: s.joinedAt.toISOString(),
        };
      }),
    );
    return { participants };
  }
}
