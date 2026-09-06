import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { ErrorEventEntity } from '../../database/entities/error-event.entity';
import { ErrorLevel } from '../../database/enums';

export interface TrackableError {
  level?: ErrorLevel;
  source?: 'http' | 'ws' | 'system';
  message: string;
  stack?: string | null;
  method?: string | null;
  path?: string | null;
  statusCode?: number | null;
  userId?: string | null;
  context?: Record<string, unknown> | null;
}

/** Headers whose values must never be persisted (secrets). */
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'proxy-authorization',
]);

/** Body/query keys whose values must never be persisted. */
const SENSITIVE_KEYS = /(password|passwd|token|secret|otp|code|refresh|pin|cvv|card)/i;

/**
 * Centralised error/security-event tracking. Persists 5xx errors and security
 * events with a stable fingerprint (so identical failures aggregate into an
 * occurrence counter instead of flooding the table), redacts secrets, and
 * mirrors everything to the Nest logger for stdout/container capture.
 */
@Injectable()
export class ErrorTrackingService {
  private readonly logger = new Logger('ErrorTracker');
  /** Fingerprint → id cache so repeats update in place without a query. */
  private readonly idByFingerprint = new Map<string, string>();

  constructor(
    @InjectRepository(ErrorEventEntity)
    private readonly events: Repository<ErrorEventEntity>,
  ) {}

  async track(input: TrackableError): Promise<void> {
    const level: ErrorLevel = input.level ?? (input.statusCode && input.statusCode >= 500 ? 'error' : 'warning');
    const message = input.message.slice(0, 255);
    const fingerprint = this.fingerprint(input.source ?? 'http', message, input.path ?? null);
    const redactedContext = this.redactContext(input.context ?? null);

    try {
      const existingId = this.idByFingerprint.get(fingerprint);
      if (existingId) {
        await this.events.increment({ id: existingId }, 'occurrences', 1);
      } else {
        const existing = await this.events.findOne({
          where: { fingerprint },
          order: { createdAt: 'DESC' },
          select: ['id'],
        });
        if (existing) {
          this.idByFingerprint.set(fingerprint, existing.id);
          await this.events.increment({ id: existing.id }, 'occurrences', 1);
        } else {
          const entity = this.events.create({
            level,
            fingerprint,
            source: input.source ?? 'http',
            message,
            stack: input.stack ? input.stack.slice(0, 4000) : null,
            method: input.method ?? null,
            path: input.path ? input.path.slice(0, 512) : null,
            statusCode: input.statusCode ?? null,
            userId: input.userId ?? null,
            context: redactedContext,
            occurrences: 1,
            firstSeenAt: new Date(),
          });
          const saved = await this.events.save(entity);
          this.idByFingerprint.set(fingerprint, saved.id);
        }
      }
    } catch {
      // Persistence must never mask the original error; fall back to log only.
      this.logger.warn('Failed to persist error event.');
    }

    if (level === 'critical' || level === 'error') {
      this.logger.error(
        `[${level}] ${input.source ?? 'http'} ${input.method ?? ''} ${input.path ?? ''} — ${message}`,
        input.stack ?? undefined,
      );
    } else {
      this.logger.warn(`[${level}] ${message}`);
    }
  }

  /** Recent events for the moderation/admin dashboard. */
  async recent(limit = 50, level?: ErrorLevel): Promise<ErrorEventEntity[]> {
    return this.events.find({
      where: level ? { level } : {},
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }

  private fingerprint(source: string, message: string, path: string | null): string {
    // Normalise ephemeral bits (ids, timestamps, uuids) so the same logical
    // failure collapses to one fingerprint.
    const normalized = message
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':uuid')
      .replace(/\d+/g, ':n')
      .toLowerCase();
    return createHash('sha256').update(`${source}|${path ?? ''}|${normalized}`).digest('hex').slice(0, 32);
  }

  private redactContext(context: Record<string, unknown> | null): Record<string, unknown> | null {
    if (!context) return null;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(context)) {
      if (SENSITIVE_KEYS.test(key)) {
        out[key] = '[redacted]';
        continue;
      }
      if (key === 'headers' && value && typeof value === 'object') {
        const headers: Record<string, unknown> = {};
        for (const [h, v] of Object.entries(value as Record<string, unknown>)) {
          headers[h] = SENSITIVE_HEADERS.has(h.toLowerCase()) ? '[redacted]' : v;
        }
        out[key] = headers;
        continue;
      }
      out[key] = value;
    }
    return out;
  }
}
