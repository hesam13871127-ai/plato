import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatEntity } from '../database/entities/chat.entity';

/**
 * Ensures the single public Lounge chat exists on application start so users
 * always have a global public room to join. Idempotent (no-op if present).
 */
@Injectable()
export class LoungeSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(LoungeSeeder.name);

  constructor(
    @InjectRepository(ChatEntity)
    private readonly chats: Repository<ChatEntity>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const existing = await this.chats.findOne({
        where: { type: 'lounge', isPublic: true },
      });
      if (existing) return;
      const lounge = this.chats.create({
        type: 'lounge',
        title: 'Lounge',
        isPublic: true,
        accessPass: null,
      });
      await this.chats.save(lounge);
      this.logger.log('Public Lounge chat ensured.');
    } catch (error) {
      // A boot-time seeding failure must never take the API down.
      this.logger.error(`Lounge seeding failed: ${(error as Error).message}`);
    }
  }
}
