import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BanEntity } from '../database/entities/ban.entity';
import { ChatParticipantEntity } from '../database/entities/chat-participant.entity';
import { ChatEntity } from '../database/entities/chat.entity';
import { MessageReactionEntity } from '../database/entities/message-reaction.entity';
import { MessageReadEntity } from '../database/entities/message-read.entity';
import { MessageEntity } from '../database/entities/message.entity';
import { ProfileEntity } from '../database/entities/profile.entity';
import { ReportEntity } from '../database/entities/report.entity';
import { UserEntity } from '../database/entities/user.entity';
import { VoiceSessionEntity } from '../database/entities/voice-session.entity';
import { ModerationModule } from '../moderation/moderation.module';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { LoungeSeeder } from './lounge-seeder';
import { PresenceService } from './presence.service';
import { VoiceService } from './voice.service';

@Module({
  imports: [
    JwtModule.register({}),
    ModerationModule,
    TypeOrmModule.forFeature([
      ChatEntity,
      ChatParticipantEntity,
      MessageEntity,
      MessageReadEntity,
      MessageReactionEntity,
      VoiceSessionEntity,
      ReportEntity,
      BanEntity,
      UserEntity,
      ProfileEntity,
    ]),
  ],
  controllers: [ChatController],
  providers: [ChatGateway, ChatService, PresenceService, VoiceService, LoungeSeeder],
  exports: [ChatService, PresenceService, VoiceService, ChatGateway],
})
export class ChatModule {}
