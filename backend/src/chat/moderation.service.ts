import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThan, Repository } from 'typeorm';
import { BanEntity } from '../database/entities/ban.entity';
import { ChatParticipantEntity } from '../database/entities/chat-participant.entity';
import { ReportEntity } from '../database/entities/report.entity';
import { BanType, ReportStatus, ReportTargetType, ReportReason } from '../database/enums';

/**
 * Handles moderation: chat bans (with expiry), per-chat mutes, and user
 * reports. Bans are enforced before a message is persisted/broadcast.
 */
@Injectable()
export class ModerationService {
  constructor(
    @InjectRepository(BanEntity)
    private readonly bans: Repository<BanEntity>,
    @InjectRepository(ReportEntity)
    private readonly reports: Repository<ReportEntity>,
    @InjectRepository(ChatParticipantEntity)
    private readonly participants: Repository<ChatParticipantEntity>,
  ) {}

  /** Throws ForbiddenException if the user has an active chat/login ban. */
  async assertCanChat(userId: string): Promise<void> {
    const ban = await this.activeBan(userId);
    if (!ban) return;
    if (ban.type === 'chat') {
      const until = ban.expiresAt ? ` until ${ban.expiresAt.toISOString()}` : '';
      throw new ForbiddenException(`You are muted from chat${until}. ${ban.reason ?? ''}`.trim());
    }
    if (ban.type === 'login' || ban.type === 'permanent') {
      throw new ForbiddenException('This account is suspended.');
    }
    // matchmaking bans do not block chat.
  }

  /** Returns the active chat/login ban for a user, if any (expired ones are ignored). */
  async activeBan(userId: string): Promise<BanEntity | null> {
    const now = new Date();
    const rows = await this.bans.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 20,
    });
    const active = rows.find((b) => {
      if (b.liftedAt) return false;
      if (b.type !== 'chat' && b.type !== 'login' && b.type !== 'permanent') return false;
      return !b.expiresAt || b.expiresAt > now;
    });
    return active ?? null;
  }

  /** True when the user has an active chat ban (used to gate UI actions). */
  async isChatBanned(userId: string): Promise<boolean> {
    return (await this.activeBan(userId))?.type === 'chat';
  }

  /** Applies a chat ban. `durationMinutes` null = permanent. */
  async banUser(params: {
    userId: string;
    bannedBy: string | null;
    reason?: string;
    durationMinutes?: number;
    type?: BanType;
  }): Promise<BanEntity> {
    const type = params.type ?? 'chat';
    const ban = this.bans.create({
      userId: params.userId,
      bannedBy: params.bannedBy,
      type,
      reason: params.reason ?? null,
      expiresAt: params.durationMinutes
        ? new Date(Date.now() + params.durationMinutes * 60_000)
        : null,
      liftedAt: null,
    });
    return this.bans.save(ban);
  }

  /** Lifts all active (not already lifted) bans for a user. */
  async liftBan(userId: string): Promise<number> {
    const now = new Date();
    const active = await this.bans.find({ where: { userId, liftedAt: IsNull() } });
    if (active.length === 0) return 0;
    const result = await this.bans.update(
      { id: In(active.map((b) => b.id)) },
      { liftedAt: now },
    );
    return result.affected ?? 0;
  }

  /** Mutes a user within a single chat (per-chat notification/posting block). */
  async setChatMuted(chatId: string, userId: string, muted: boolean): Promise<void> {
    const participant = await this.participants.findOne({ where: { chatId, userId } });
    if (!participant) throw new NotFoundException('User is not in this chat.');
    participant.isMuted = muted;
    await this.participants.save(participant);
  }

  /** Throws if the user is muted specifically in this chat. */
  async assertNotMutedInChat(chatId: string, userId: string): Promise<void> {
    const participant = await this.participants.findOne({ where: { chatId, userId } });
    if (participant?.isMuted) {
      throw new ForbiddenException('You are muted in this chat.');
    }
  }

  async fileReport(params: {
    reporterId: string;
    targetType: ReportTargetType;
    targetId: string;
    reason: ReportReason;
    details?: string;
  }): Promise<ReportEntity> {
    if (params.reporterId === params.targetId && params.targetType === 'user') {
      throw new BadRequestException('You cannot report yourself.');
    }
    const report = this.reports.create({
      reporterId: params.reporterId,
      targetType: params.targetType,
      targetId: params.targetId,
      reason: params.reason,
      details: params.details ?? null,
      status: 'open' as ReportStatus,
    });
    return this.reports.save(report);
  }

  /** Opportunistic cleanup hook for expired bans (called on schedule). */
  async purgeExpired(): Promise<number> {
    const now = new Date();
    const res = await this.bans.delete({ expiresAt: LessThan(now) });
    return res.affected ?? 0;
  }
}
