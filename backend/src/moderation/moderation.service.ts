import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThan, Repository } from 'typeorm';
import { BanEntity } from '../database/entities/ban.entity';
import { ChatParticipantEntity } from '../database/entities/chat-participant.entity';
import { MessageEntity } from '../database/entities/message.entity';
import { ModerationAuditEntity } from '../database/entities/moderation-audit.entity';
import { ReportEntity } from '../database/entities/report.entity';
import { UserEntity } from '../database/entities/user.entity';
import { UserStrikeEntity } from '../database/entities/user-strike.entity';
import { BanType, ReportStatus, ReportTargetType, ReportReason } from '../database/enums';

export interface ReportListQuery {
  status?: ReportStatus;
  limit?: number;
  offset?: number;
}

/**
 * Central moderation service: chat bans (with expiry), per-chat mutes, user
 * reports, the moderator report queue, bans/strikes management and the audit
 * trail. Lives in its own `ModerationModule` (Phase 9) so every feature module
 * can enforce bans; the chat module consumes the same instance.
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
    @InjectRepository(MessageEntity)
    private readonly messages: Repository<MessageEntity>,
    @InjectRepository(ModerationAuditEntity)
    private readonly auditLog: Repository<ModerationAuditEntity>,
    @InjectRepository(UserStrikeEntity)
    private readonly strikes: Repository<UserStrikeEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  // ── Ban enforcement ─────────────────────────────────────────────────────

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

  /** Throws if the account is suspended at login level (called by auth + gateways). */
  async assertNotSuspended(userId: string): Promise<void> {
    const now = new Date();
    const rows = await this.bans.find({ where: { userId }, order: { createdAt: 'DESC' }, take: 20 });
    const suspended = rows.some((b) => {
      if (b.liftedAt) return false;
      if (b.type !== 'login' && b.type !== 'permanent') return false;
      return !b.expiresAt || b.expiresAt > now;
    });
    if (suspended) throw new ForbiddenException('This account is suspended.');
  }

  /** Applies a ban. `durationMinutes` null + type permanent/ login = indefinite. */
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
    const saved = await this.bans.save(ban);
    await this.recordAudit({
      actorId: params.bannedBy ?? 'system',
      action: 'ban_created',
      targetType: 'user',
      targetId: params.userId,
      reason: params.reason ?? type,
      metadata: { type, durationMinutes: params.durationMinutes ?? null },
    });
    return saved;
  }

  /** Lifts all active (not already lifted) bans for a user. */
  async liftBan(userId: string, liftedBy = 'system'): Promise<number> {
    const now = new Date();
    const active = await this.bans.find({ where: { userId, liftedAt: IsNull() } });
    if (active.length === 0) return 0;
    const result = await this.bans.update({ id: In(active.map((b) => b.id)) }, { liftedAt: now });
    await this.recordAudit({
      actorId: liftedBy,
      action: 'ban_lifted',
      targetType: 'user',
      targetId: userId,
      reason: `lifted ${result.affected ?? active.length} ban(s)`,
    });
    return result.affected ?? 0;
  }

  /** Lists active bans for the admin dashboard. */
  listActiveBans(limit = 100): Promise<BanEntity[]> {
    return this.bans.find({
      where: { liftedAt: IsNull() },
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 500),
    });
  }

  // ── Per-chat mutes ──────────────────────────────────────────────────────

  async setChatMuted(chatId: string, userId: string, muted: boolean): Promise<void> {
    const participant = await this.participants.findOne({ where: { chatId, userId } });
    if (!participant) throw new NotFoundException('User is not in this chat.');
    participant.isMuted = muted;
    await this.participants.save(participant);
  }

  async assertNotMutedInChat(chatId: string, userId: string): Promise<void> {
    const participant = await this.participants.findOne({ where: { chatId, userId } });
    if (participant?.isMuted) {
      throw new ForbiddenException('You are muted in this chat.');
    }
  }

  // ── Reports ─────────────────────────────────────────────────────────────

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
    // De-duplicate: one open report per (reporter, target). Prevents report spam.
    const existing = await this.reports.findOne({
      where: { reporterId: params.reporterId, targetType: params.targetType, targetId: params.targetId, status: In(['open', 'reviewing']) },
    });
    if (existing) {
      throw new BadRequestException('You have already reported this. Our team is reviewing it.');
    }
    const report = this.reports.create({
      reporterId: params.reporterId,
      targetType: params.targetType,
      targetId: params.targetId,
      reason: params.reason,
      details: params.details ?? null,
      status: 'open' as ReportStatus,
    });
    const saved = await this.reports.save(report);
    await this.recordAudit({
      actorId: params.reporterId,
      action: 'report_filed',
      targetType: params.targetType,
      targetId: params.targetId,
      reason: params.reason,
    });
    return saved;
  }

  /** Moderator queue: reports with distinct-reporter counts. */
  async listReports(query: ReportListQuery = {}): Promise<{ items: ReportEntity[]; total: number }> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const offset = Math.max(query.offset ?? 0, 0);
    const where = query.status ? { status: query.status } : {};
    const [items, total] = await this.reports.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { items, total };
  }

  /** Count distinct reporters for a target (used for auto-escalation). */
  async distinctReporters(targetType: string, targetId: string): Promise<number> {
    const rows = await this.reports.find({ where: { targetType: targetType as ReportTargetType, targetId } });
    return new Set(rows.map((r) => r.reporterId)).size;
  }

  /** Moderator resolves a report: optionally ban the offender and/or delete content. */
  async resolveReport(params: {
    reportId: string;
    moderatorId: string;
    action: 'dismiss' | 'warn' | 'mute' | 'ban' | 'delete';
    note?: string;
    durationMinutes?: number;
  }): Promise<ReportEntity> {
    const report = await this.reports.findOne({ where: { id: params.reportId } });
    if (!report) throw new NotFoundException('Report not found.');
    if (report.status === 'resolved' || report.status === 'dismissed') {
      throw new BadRequestException('This report has already been handled.');
    }

    const offenderId = report.targetType === 'user' ? report.targetId : await this.authorOfTarget(report);

    if (params.action === 'dismiss') {
      report.status = 'dismissed';
    } else {
      report.status = 'resolved';
      if (params.action === 'delete' && report.targetType === 'message') {
        await this.messages.delete({ id: report.targetId });
        await this.recordAudit({ actorId: params.moderatorId, action: 'message_deleted', targetType: 'message', targetId: report.targetId, reason: params.note ?? report.reason });
      }
      if (offenderId && (params.action === 'warn' || params.action === 'mute' || params.action === 'ban')) {
        if (params.action === 'warn') {
          await this.strikes.save(this.strikes.create({ userId: offenderId, issuedBy: params.moderatorId, reason: report.reason, consequence: 'warning', relatedFlagId: null }));
        } else {
          const type: BanType = params.action === 'ban' ? 'login' : 'chat';
          const duration = params.action === 'ban' ? (params.durationMinutes ?? 7 * 24 * 60) : (params.durationMinutes ?? 60);
          await this.banUser({ userId: offenderId, bannedBy: params.moderatorId, reason: `Report ${report.reason}: ${params.note ?? ''}`.trim(), durationMinutes: duration, type });
          await this.strikes.save(this.strikes.create({ userId: offenderId, issuedBy: params.moderatorId, reason: report.reason, consequence: params.action, relatedFlagId: null }));
        }
      }
    }

    report.resolvedBy = params.moderatorId;
    report.resolutionNote = params.note ?? null;
    report.resolvedAt = new Date();
    const saved = await this.reports.save(report);
    await this.recordAudit({
      actorId: params.moderatorId,
      action: params.action === 'dismiss' ? 'report_dismissed' : 'report_resolved',
      targetType: report.targetType,
      targetId: report.targetId,
      reason: params.action,
      metadata: { reportId: report.id, note: params.note ?? null },
    });
    return saved;
  }

  /** Moderator deletes an offending message directly. */
  async deleteMessage(messageId: string, moderatorId: string, reason?: string): Promise<void> {
    const message = await this.messages.findOne({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found.');
    await this.messages.delete({ id: messageId });
    await this.recordAudit({ actorId: moderatorId, action: 'message_deleted', targetType: 'message', targetId: messageId, reason: reason ?? 'moderator deletion' });
  }

  /** Grants/revokes a platform role (admin only). */
  async setRole(userId: string, role: 'player' | 'moderator' | 'admin', actorId: string): Promise<void> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');
    user.role = role;
    await this.users.save(user);
    await this.recordAudit({ actorId, action: 'role_changed', targetType: 'user', targetId: userId, reason: `role → ${role}` });
  }

  async getRole(userId: string): Promise<'player' | 'moderator' | 'admin'> {
    const user = await this.users.findOne({ where: { id: userId }, select: ['id', 'role'] });
    return user?.role ?? 'player';
  }

  async recentAudit(limit = 100): Promise<ModerationAuditEntity[]> {
    return this.auditLog.find({ order: { createdAt: 'DESC' }, take: Math.min(limit, 500) });
  }

  /** Public audit entry point used by other modules (admin actions, etc.). */
  async writeAudit(entry: {
    actorId: string;
    action: ModerationAuditEntity['action'];
    targetType?: string | null;
    targetId?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<void> {
    await this.recordAudit(entry);
  }

  /** Opportunistic cleanup hook for expired bans (called on schedule). */
  async purgeExpired(): Promise<number> {
    const now = new Date();
    const res = await this.bans.delete({ expiresAt: LessThan(now), liftedAt: IsNull() });
    return res.affected ?? 0;
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private async authorOfTarget(report: ReportEntity): Promise<string | null> {
    if (report.targetType === 'message') {
      const message = await this.messages.findOne({ where: { id: report.targetId }, select: ['senderId'] });
      return message?.senderId ?? null;
    }
    return null;
  }

  private async recordAudit(entry: {
    actorId: string;
    action: ModerationAuditEntity['action'];
    targetType?: string | null;
    targetId?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<void> {
    try {
      await this.auditLog.save(
        this.auditLog.create({
          actorId: entry.actorId,
          action: entry.action,
          targetType: entry.targetType ?? null,
          targetId: entry.targetId ?? null,
          reason: entry.reason ?? null,
          metadata: entry.metadata ?? null,
        }),
      );
    } catch {
      // Auditing must never break the primary action.
    }
  }
}
