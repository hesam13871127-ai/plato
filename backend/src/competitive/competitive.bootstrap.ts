import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { SeasonsService } from './seasons/seasons.service';

/**
 * Bootstraps the competitive calendar (ensures an active season exists) and
 * runs a lightweight maintenance tick that rolls a finished season over. The
 * rollover itself is idempotent, so the tick is a safety net even if several
 * app instances tick concurrently — the status/claim guards prevent double
 * reward grants.
 */
@Injectable()
export class CompetitiveBootstrap implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CompetitiveBootstrap.name);
  private timer: NodeJS.Timeout | null = null;
  private static readonly TICK_MS = 60 * 1000; // once a minute

  constructor(private readonly seasons: SeasonsService) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const season = await this.seasons.ensureCalendar(new Date());
      this.logger.log(`Competitive season ready: ${season.name}.`);
    } catch (error) {
      this.logger.error('Failed to bootstrap the competitive season.', error as Error);
    }
    this.timer = setInterval(() => {
      this.seasons.ensureCalendar(new Date()).catch((e) => {
        this.logger.error('Season maintenance tick failed.', e as Error);
      });
    }, CompetitiveBootstrap.TICK_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
