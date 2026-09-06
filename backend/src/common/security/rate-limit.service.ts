import { Injectable, Logger } from '@nestjs/common';

/**
 * Process-local sliding-window rate limiter.
 *
 * NestJS's `@nestjs/throttler` guards the HTTP surface; realtime Socket.io
 * traffic and a few internal hot paths (OTP requests, token refreshes) need
 * the same protection but never pass through an HTTP guard, so they call this
 * service directly. The store is a Map of monotonic timestamps pruned on every
 * check — O(window) per key, bounded by the window size — which is cheap for
 * the request volumes here. State is per instance (the app runs a single
 * Node process; horizontal scaling would swap this for Redis without changing
 * call sites).
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly hits = new Map<string, number[]>();
  private lastSweep = 0;

  /**
   * Registers one hit for `key` and returns whether it is allowed.
   * @param limit     maximum hits allowed within the window
   * @param windowMs  sliding window length in milliseconds
   */
  consume(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    this.sweepIfNeeded(now);

    const cutoff = now - windowMs;
    const timestamps = this.hits.get(key) ?? [];
    // Drop timestamps outside the window (in-place to avoid churn).
    let start = 0;
    while (start < timestamps.length && timestamps[start] <= cutoff) start++;
    const recent = start === 0 ? timestamps : timestamps.slice(start);

    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  /** Remaining hits for a key in the current window (for headers/UI hints). */
  remaining(key: string, limit: number, windowMs: number): number {
    const now = Date.now();
    const cutoff = now - windowMs;
    const timestamps = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    return Math.max(0, limit - timestamps.length);
  }

  /** Milliseconds until the oldest hit ages out (0 when not limited). */
  retryAfterMs(key: string, windowMs: number): number {
    const timestamps = this.hits.get(key);
    if (!timestamps || timestamps.length === 0) return 0;
    const oldest = timestamps[0];
    return Math.max(0, oldest + windowMs - Date.now());
  }

  /** Clears all state for a key (e.g. after a successful login). */
  reset(key: string): void {
    this.hits.delete(key);
  }

  /** Periodically evict empty/expired keys so the Map cannot grow unbounded. */
  private sweepIfNeeded(now: number): void {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    let evicted = 0;
    for (const [key, timestamps] of this.hits) {
      const cutoff = now - 15 * 60_000;
      const live = timestamps.filter((t) => t > cutoff);
      if (live.length === 0) {
        this.hits.delete(key);
        evicted++;
      } else if (live.length !== timestamps.length) {
        this.hits.set(key, live);
      }
    }
    if (evicted > 0) {
      this.logger.debug(`Rate-limit sweep evicted ${evicted} keys.`);
    }
  }
}
