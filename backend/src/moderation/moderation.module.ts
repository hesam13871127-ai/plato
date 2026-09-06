import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BanEntity } from '../database/entities/ban.entity';
import { ChatParticipantEntity } from '../database/entities/chat-participant.entity';
import { ErrorEventEntity } from '../database/entities/error-event.entity';
import { MessageEntity } from '../database/entities/message.entity';
import { ModerationAuditEntity } from '../database/entities/moderation-audit.entity';
import { ModerationFlagEntity } from '../database/entities/moderation-flag.entity';
import { ReportEntity } from '../database/entities/report.entity';
import { UserEntity } from '../database/entities/user.entity';
import { UserStrikeEntity } from '../database/entities/user-strike.entity';
import { RateLimitService } from '../common/security/rate-limit.service';
import { ErrorTrackingService } from '../common/observability/error-tracking.service';
import { AutoModerationService } from './auto-moderation.service';
import { ModerationAdminSeeder } from './moderation-admin.seeder';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';
import { TextFilterService } from './text-filter.service';

/**
 * Platform-wide moderation, security and observability (Phase 9). Exports the
 * shared services consumed by chat, auth and the websocket gateways.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      BanEntity,
      ReportEntity,
      ChatParticipantEntity,
      MessageEntity,
      ModerationAuditEntity,
      ModerationFlagEntity,
      UserStrikeEntity,
      UserEntity,
      ErrorEventEntity,
    ]),
  ],
  controllers: [ModerationController],
  providers: [
    ModerationService,
    TextFilterService,
    AutoModerationService,
    RateLimitService,
    ErrorTrackingService,
    ModerationAdminSeeder,
  ],
  exports: [
    ModerationService,
    AutoModerationService,
    TextFilterService,
    RateLimitService,
    ErrorTrackingService,
  ],
})
export class ModerationModule {}
