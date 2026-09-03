import { ApiProperty } from '@nestjs/swagger';

export class UserQuestDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  questId: string;

  @ApiProperty({ example: 'win_match' })
  goalType: string;

  @ApiProperty({ example: 'Win a match' })
  name: string;

  @ApiProperty({ nullable: true })
  description: string | null;

  @ApiProperty({ example: 1 })
  progress: number;

  @ApiProperty({ example: 1 })
  goalTarget: number;

  @ApiProperty({ example: 'claimable', enum: ['in_progress', 'claimable', 'claimed'] })
  status: string;

  @ApiProperty({ example: 100 })
  rewardCoins: number;

  @ApiProperty({ example: 0 })
  rewardPips: number;

  @ApiProperty({ example: 20 })
  rewardXp: number;
}

export class DailyRewardStateDto {
  @ApiProperty({ example: '2026-09-03' })
  today: string;

  @ApiProperty({ example: 3, description: 'Streak day that will be claimed next (1-based).' })
  nextStreakDay: number;

  @ApiProperty({ example: false })
  claimedToday: boolean;

  @ApiProperty({ example: 150 })
  rewardCoins: number;

  @ApiProperty({ example: 0 })
  rewardPips: number;
}

export class DailyRewardsDto {
  @ApiProperty({ type: [DailyRewardStateDto] })
  daily: DailyRewardStateDto;

  @ApiProperty({ type: [UserQuestDto] })
  quests: UserQuestDto[];
}

export class ClaimResultDto {
  @ApiProperty({ example: 'daily' })
  kind: 'daily' | 'quest';

  @ApiProperty({ example: 200 })
  coinsAwarded: number;

  @ApiProperty({ example: 0 })
  pipsAwarded: number;

  @ApiProperty({ example: 20 })
  xpAwarded: number;

  @ApiProperty({ example: 5 })
  newStreakDay: number;

  @ApiProperty()
  balance: { coins: number; pips: number };
}
