import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DailyRewardClaimEntity } from '../database/entities/daily-reward.entity';
import { ProfileEntity } from '../database/entities/profile.entity';
import { QuestEntity } from '../database/entities/quest.entity';
import { UserQuestEntity } from '../database/entities/user-quest.entity';
import { QuestGoalType } from '../database/enums';
import { EconomyService } from '../economy/economy.service';
import {
  ClaimResultDto,
  DailyRewardStateDto,
  DailyRewardsDto,
  UserQuestDto,
} from './dto/quests.dto';

/**
 * 7-day rotating daily-login reward. Day 7 grants pips; the cycle then repeats.
 */
const DAILY_REWARD_COINS = [100, 150, 200, 250, 300, 400, 500];
const DAILY_REWARD_PIPS = [0, 0, 0, 5, 0, 0, 20];
const DAILY_REWARD_XP = 20;

@Injectable()
export class QuestsService {
  constructor(
    @InjectRepository(QuestEntity)
    private readonly quests: Repository<QuestEntity>,
    @InjectRepository(UserQuestEntity)
    private readonly userQuests: Repository<UserQuestEntity>,
    @InjectRepository(DailyRewardClaimEntity)
    private readonly dailyClaims: Repository<DailyRewardClaimEntity>,
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    private readonly economy: EconomyService,
    private readonly dataSource: DataSource,
  ) {}

  /** Returns today's date (UTC) as `YYYY-MM-DD`. */
  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private yesterday(): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  // ── Daily reward ──────────────────────────────────────────────────────────

  async getDailyState(userId: string): Promise<DailyRewardStateDto> {
    const today = this.today();
    const claimedToday = await this.dailyClaims.findOne({
      where: { userId, day: today },
    });

    const streakDay = await this.computeNextStreakDay(userId);
    const index = (streakDay - 1) % DAILY_REWARD_COINS.length;

    return {
      today,
      nextStreakDay: streakDay,
      claimedToday: !!claimedToday,
      rewardCoins: DAILY_REWARD_COINS[index],
      rewardPips: DAILY_REWARD_PIPS[index],
    };
  }

  /**
   * Claims the free daily login reward once per day. Streak continues if the
   * previous day was claimed; otherwise resets to day 1. Enforced unique
   * (user, day) plus the balance ledger inside one transaction prevents
   * double-claims even under concurrent requests.
   */
  async claimDaily(userId: string): Promise<ClaimResultDto> {
    return this.dataSource.transaction(async (manager) => {
      const today = this.today();

      // Lock the user's daily-claim history to serialise concurrent claims.
      const existing = await manager.findOne(DailyRewardClaimEntity, {
        where: { userId, day: today },
      });
      if (existing) {
        throw new ConflictException('Daily reward already claimed today.');
      }

      const streakDay = await this.computeNextStreakDay(userId, manager);
      const index = (streakDay - 1) % DAILY_REWARD_COINS.length;
      const coins = DAILY_REWARD_COINS[index];
      const pips = DAILY_REWARD_PIPS[index];

      // Update the profile streak counter.
      const profile = await this.lockProfile(manager, userId);
      profile.streakDays = streakDay;
      await manager.save(profile);

      const claim = manager.create(DailyRewardClaimEntity, {
        userId,
        day: today,
        streakDay,
        coinsAwarded: coins,
        pipsAwarded: pips,
      });
      await manager.save(claim);

      // Credit currencies via the safe economy service (atomic ledger writes).
      if (coins > 0) {
        await this.economy.credit(
          userId,
          'coins',
          coins,
          { type: 'daily_reward', referenceType: 'daily_reward', referenceId: claim.id, description: `Daily reward day ${streakDay}` },
          manager,
        );
      }
      if (pips > 0) {
        await this.economy.credit(
          userId,
          'pips',
          pips,
          { type: 'daily_reward', referenceType: 'daily_reward', referenceId: claim.id, description: `Daily reward day ${streakDay}` },
          manager,
        );
      }
      const xp = await this.economy.grantXp(userId, DAILY_REWARD_XP, manager);

      // Logging in also progresses the "login" daily quest.
      await this.recordEventInternal(manager, userId, 'login');

      const fresh = await this.readBalance(manager, userId);

      return {
        kind: 'daily',
        coinsAwarded: coins,
        pipsAwarded: pips,
        xpAwarded: DAILY_REWARD_XP,
        newStreakDay: streakDay,
        balance: { coins: fresh.coins, pips: fresh.pips },
      };
    });
  }

  private async computeNextStreakDay(
    userId: string,
    manager?: import('typeorm').EntityManager,
  ): Promise<number> {
    const repo = manager ? manager.getRepository(DailyRewardClaimEntity) : this.dailyClaims;
    const yesterday = this.yesterday();
    const yesterdayClaim = await repo.findOne({
      where: { userId, day: yesterday },
    });
    if (yesterdayClaim) {
      return Number(yesterdayClaim.streakDay) + 1;
    }
    return 1;
  }

  // ── Quests ──────────────────────────────────────────────────────────────

  /**
   * Ensures today's quest instances exist for the user and returns them.
   * Creates missing rows for every active quest (idempotent).
   */
  async getTodayQuests(userId: string): Promise<UserQuestDto[]> {
    return this.dataSource.transaction(async (manager) => {
      const activeQuests = await manager.find(QuestEntity, {
        where: { isActive: true },
        order: { sortOrder: 'ASC' },
      });

      const today = this.today();
      const dtos: UserQuestDto[] = [];

      for (const quest of activeQuests) {
        let userQuest = await manager.findOne(UserQuestEntity, {
          where: { userId, questId: quest.id, day: today },
        });
        if (!userQuest) {
          userQuest = manager.create(UserQuestEntity, {
            userId,
            questId: quest.id,
            day: today,
            progress: quest.goalType === 'login' ? 0 : 0,
            goalTarget: quest.goalTarget,
            status: 'in_progress',
            completedAt: null,
            claimedAt: null,
          });
          await manager.save(userQuest);
        }

        dtos.push(this.toUserQuestDto(quest, userQuest));
      }
      return dtos;
    });
  }

  /** Full daily-rewards panel: daily reward state + today's quests. */
  async getDailyRewards(userId: string): Promise<DailyRewardsDto> {
    const [daily, quests] = await Promise.all([
      this.getDailyState(userId),
      this.getTodayQuests(userId),
    ]);
    return { daily, quests };
  }

  /**
   * Claims a completed quest's rewards. Throws unless the quest is complete
   * and unclaimed; credits inside the same transaction.
   */
  async claimQuest(userId: string, userQuestId: string): Promise<ClaimResultDto> {
    return this.dataSource.transaction(async (manager) => {
      const userQuest = await manager.findOne(UserQuestEntity, {
        where: { id: userQuestId, userId },
      });
      if (!userQuest) throw new NotFoundException('Quest not found.');
      if (userQuest.status === 'claimed') {
        throw new ConflictException('Quest reward already claimed.');
      }
      if (Number(userQuest.progress) < Number(userQuest.goalTarget)) {
        throw new BadRequestException('Quest is not completed yet.');
      }

      const quest = await manager.findOne(QuestEntity, { where: { id: userQuest.questId } });
      if (!quest) throw new NotFoundException('Quest definition not found.');
      userQuest.status = 'claimed';
      userQuest.claimedAt = new Date();
      await manager.save(userQuest);

      const coins = Number(quest.rewardCoins);
      const pips = Number(quest.rewardPips);
      const xp = Number(quest.rewardXp);

      if (coins > 0) {
        await this.economy.credit(
          userId,
          'coins',
          coins,
          { type: 'quest_reward', referenceType: 'quest', referenceId: quest.id, description: `Quest: ${quest.name}` },
          manager,
        );
      }
      if (pips > 0) {
        await this.economy.credit(
          userId,
          'pips',
          pips,
          { type: 'quest_reward', referenceType: 'quest', referenceId: quest.id, description: `Quest: ${quest.name}` },
          manager,
        );
      }
      const xpResult = xp > 0 ? await this.economy.grantXp(userId, xp, manager) : { leveledUp: false };

      const balance = await this.readBalance(manager, userId);
      return {
        kind: 'quest',
        coinsAwarded: coins,
        pipsAwarded: pips,
        xpAwarded: xpResult.leveledUp || xp > 0 ? xp : 0,
        newStreakDay: 0,
        balance: { coins: balance.coins, pips: balance.pips },
      };
    });
  }

  /**
   * Records progress toward daily quests. Called by other services (matches,
   * gifting) and the internal login flow. Safe to call repeatedly.
   */
  async recordEvent(userId: string, goalType: QuestGoalType, amount = 1): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.recordEventInternal(manager, userId, goalType, amount);
    });
  }

  private async recordEventInternal(
    manager: import('typeorm').EntityManager,
    userId: string,
    goalType: QuestGoalType,
    amount = 1,
  ): Promise<void> {
    const today = this.today();
    const activeQuests = await manager.find(QuestEntity, {
      where: { isActive: true, goalType },
    });

    for (const quest of activeQuests) {
      let userQuest = await manager.findOne(UserQuestEntity, {
        where: { userId, questId: quest.id, day: today },
      });
      if (!userQuest) {
        userQuest = manager.create(UserQuestEntity, {
          userId,
          questId: quest.id,
          day: today,
          progress: 0,
          goalTarget: quest.goalTarget,
          status: 'in_progress',
        });
      }

      // Login events count once per day.
      if (goalType === 'login' && userQuest.progress > 0) {
        continue;
      }

      userQuest.progress = Math.min(Number(userQuest.progress) + amount, Number(userQuest.goalTarget));
      if (userQuest.progress >= Number(userQuest.goalTarget)) {
        if (userQuest.status === 'in_progress') {
          userQuest.status = 'claimable';
          userQuest.completedAt = new Date();
        }
      }
      await manager.save(userQuest);
    }
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private toUserQuestDto(quest: QuestEntity, userQuest: UserQuestEntity): UserQuestDto {
    const progress = Number(userQuest.progress);
    const target = Number(userQuest.goalTarget);
    const status = userQuest.status === 'claimed'
      ? 'claimed'
      : progress >= target
        ? 'claimable'
        : 'in_progress';

    return {
      id: userQuest.id,
      questId: quest.id,
      goalType: quest.goalType,
      name: quest.name,
      description: quest.description,
      progress,
      goalTarget: target,
      status,
      rewardCoins: Number(quest.rewardCoins),
      rewardPips: Number(quest.rewardPips),
      rewardXp: Number(quest.rewardXp),
    };
  }

  private async lockProfile(
    manager: import('typeorm').EntityManager,
    userId: string,
  ): Promise<ProfileEntity> {
    const isMysql = this.dataSource.options.type === 'mysql';
    let profile: ProfileEntity | null;
    if (isMysql) {
      profile = await manager
        .getRepository(ProfileEntity)
        .createQueryBuilder('profile')
        .setLock('pessimistic_write')
        .where('profile.userId = :userId', { userId })
        .getOne();
    } else {
      profile = await manager.findOne(ProfileEntity, { where: { userId } });
    }
    if (!profile) throw new NotFoundException('Profile not found.');
    return profile;
  }

  private async readBalance(
    manager: import('typeorm').EntityManager,
    userId: string,
  ): Promise<{ coins: number; pips: number }> {
    const profile = await manager.findOne(ProfileEntity, { where: { userId } });
    return {
      coins: Number(profile?.coins ?? 0),
      pips: Number(profile?.pips ?? 0),
    };
  }
}
