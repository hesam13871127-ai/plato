import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModerationFlagEntity } from '../database/entities/moderation-flag.entity';
import { ModerationAuditEntity } from '../database/entities/moderation-audit.entity';
import { UserStrikeEntity } from '../database/entities/user-strike.entity';
import { ModerationService } from './moderation.service';
import { TextFilterService, TextFilterResult } from './text-filter.service';
import { sanitizeText } from '../common/utils/sanitize.util';

export interface ScreenMessageResult {
  /** False when the message must be rejected outright. */
  allowed: boolean;
  /** The body to persist (censored/sanitised when allowed). */
  body: string;
  /** Why it was blocked/censored, for the caller to surface/log. */
  reason?: string;
}

/** Escalation ladder applied within a rolling 24h window. */
const STRIKE_WINDOW_MS = 24 * 60 * 60_000;

/**
 * Drives automated moderation: runs chat content through the text filter,
 * records flags/strikes, and escalates repeat offenders automatically
 * (warning → temporary mute → long suspension). Also screens incoming
 * reports and auto-flags content that crosses a report threshold.
 */
@Injectable()
export class AutoModerationService {
  private readonly logger = new Logger(AutoModerationService.name);

  constructor(
    private readonly filter: TextFilterService,
    private readonly moderation: ModerationService,
    @InjectRepository(ModerationFlagEntity)
    private readonly flags: Repository<ModerationFlagEntity>,
    @InjectRepository(ModerationAuditEntity)
    private readonly audit: Repository<ModerationAuditEntity>,
    @InjectRepository(UserStrikeEntity)
    private readonly strikes: Repository<UserStrikeEntity>,
  ) {}

  /**
   * Screens an outgoing chat message. Blocks severe toxicity, censors mild
   * profanity, records strikes and escalates. Always returns sanitised text.
   */
  screenMessage(authorId: string, rawBody: string): ScreenMessageResult {
    const sanitized = sanitizeText(rawBody, 2000);
    if (sanitized.length === 0) {
      return { allowed: false, body: '', reason: 'Message is empty after filtering.' };
    }

    const result: TextFilterResult = this.filter.filter(sanitized);

    if (result.verdict === 'blocked') {
      void this.recordViolation(authorId, result, 'blocked');
      void this.escalate(authorId, 'content_blocked');
      return {
        allowed: false,
        body: '',
        reason: 'Your message was blocked by the content filter. Repeated violations lead to mutes and bans.',
      };
    }

    if (result.verdict === 'spam') {
      void this.recordViolation(authorId, result, 'spam');
      void this.escalate(authorId, 'content_blocked');
      return { allowed: false, body: '', reason: 'This message looks like spam and was blocked.' };
    }

    if (result.verdict === 'filtered') {
      // Soft: persist the censored version, log a flag (no strike for first offence).
      void this.recordViolation(authorId, result, 'censored');
      return { allowed: true, body: result.text };
    }

    return { allowed: true, body: sanitized };
  }

  /** Appends a moderation flag row. Fire-and-forget from callers is fine. */
  private async recordViolation(authorId: string, result: TextFilterResult, outcome: 'blocked' | 'censored' | 'spam'): Promise<void> {
    try {
      const reason =
        result.hits[0]?.startsWith('blocked:') ? 'hate_slur'
        : result.hits[0]?.startsWith('spam') ? 'spam'
        : 'toxic_language';
      const flag = this.flags.create({
        targetType: 'message',
        targetId: 'realtime',
        authorId,
        reason: reason as ModerationFlagEntity['reason'],
        verdict: outcome === 'censored' ? 'filtered' : outcome === 'spam' ? 'spam' : 'blocked',
        excerpt: result.text.slice(0, 200),
        details: { hits: result.hits },
        status: outcome === 'censored' ? 'dismissed' : 'open',
      });
      await this.flags.save(flag);
      await this.audit.save(
        this.audit.create({
          actorId: 'system',
          action: outcome === 'censored' ? 'content_censored' : 'content_blocked',
          targetType: 'message',
          targetId: authorId,
          reason,
          metadata: { hits: result.hits.slice(0, 5) },
        }),
      );
    } catch (err) {
      this.logger.warn(`Failed to record moderation flag: ${(err as Error).message}`);
    }
  }

  /**
   * Applies the escalation ladder based on strikes in the trailing window:
   *  - 1st strike: warning only
   *  - 2nd strike: 15-minute chat mute
   *  - 3rd strike: 24-hour chat ban
   *  - 4+ strikes: 7-day account suspension (login ban)
   */
  async escalate(userId: string, trigger: string): Promise<void> {
    try {
      const since = new Date(Date.now() - STRIKE_WINDOW_MS);
      // Count strikes created in the window (driver-agnostic: fetch + filter).
      const rows = await this.strikes.find({ where: { userId }, order: { createdAt: 'DESC' }, take: 20 });
      const windowStrikes = rows.filter((r) => r.createdAt >= since);
      const count = windowStrikes.length;

      let consequence: UserStrikeEntity['consequence'] = 'note';
      if (count >= 4) {
        await this.moderation.banUser({ userId, bannedBy: 'system', reason: `Auto-suspension: ${trigger}`, durationMinutes: 7 * 24 * 60, type: 'login' });
        consequence = 'ban';
      } else if (count === 3) {
        await this.moderation.banUser({ userId, bannedBy: 'system', reason: `Auto chat ban: ${trigger}`, durationMinutes: 24 * 60, type: 'chat' });
        consequence = 'ban';
      } else if (count === 2) {
        await this.moderation.banUser({ userId, bannedBy: 'system', reason: `Auto mute: ${trigger}`, durationMinutes: 15, type: 'chat' });
        consequence = 'mute';
      } else {
        consequence = 'warning';
      }

      const strike = this.strikes.create({
        userId,
        issuedBy: 'system',
        reason: trigger,
        weight: 1,
        consequence,
      });
      await this.strikes.save(strike);

      await this.audit.save(
        this.audit.create({
          actorId: 'system',
          action: 'user_warned',
          targetType: 'user',
          targetId: userId,
          reason: `escalation:${consequence}`,
          metadata: { strikesInWindow: windowStrikes.length + 1 },
        }),
      );
    } catch (err) {
      this.logger.warn(`Escalation failed for ${userId}: ${(err as Error).message}`);
    }
  }

  /** Records a strike directly (used by manual moderation / report resolution). */
  async addStrike(userId: string, issuedBy: string, reason: string, consequence: UserStrikeEntity['consequence'] = 'note', flagId?: string): Promise<UserStrikeEntity> {
    const strike = this.strikes.create({ userId, issuedBy, reason, consequence, relatedFlagId: flagId ?? null });
    return this.strikes.save(strike);
  }

  /** Auto-flag content when it accumulates enough distinct reports. */
  async noteReport(targetType: string, targetId: string, distinctReporters: number, threshold = 3): Promise<boolean> {
    if (distinctReporters < threshold) return false;
    const existing = await this.flags.findOne({ where: { targetType, targetId, status: 'open' } });
    if (existing) return false;
    const flag = this.flags.create({
      targetType,
      targetId,
      reason: targetType === 'message' ? 'toxic_language' : 'manual',
      verdict: 'filtered',
      excerpt: null,
      details: { autoFromReports: distinctReporters },
      status: 'open',
    });
    await this.flags.save(flag);
    await this.audit.save(
      this.audit.create({ actorId: 'system', action: 'report_auto_flagged', targetType, targetId, reason: `${distinctReporters} reports` }),
    );
    return true;
  }

  async recentFlags(limit = 50): Promise<ModerationFlagEntity[]> {
    return this.flags.find({ order: { createdAt: 'DESC' }, take: Math.min(limit, 200) });
  }

  async recentStrikes(userId: string, limit = 20): Promise<UserStrikeEntity[]> {
    return this.strikes.find({ where: { userId }, order: { createdAt: 'DESC' }, take: limit });
  }
}
