import { QuestGoalType } from '../database/enums';

/** Seeded catalogue of active daily quests (mirrors database/seed.sql). */
export interface QuestCatalogueItem {
  id: string;
  code: string;
  name: string;
  description: string;
  goalType: QuestGoalType;
  goalTarget: number;
  rewardCoins: number;
  rewardPips: number;
  rewardXp: number;
  sortOrder: number;
}

export const QUEST_CATALOGUE: QuestCatalogueItem[] = [
  {
    id: '55555555-0000-4000-0000-000000000001',
    code: 'daily_login',
    name: 'Daily Check-in',
    description: 'Log in today.',
    goalType: 'login',
    goalTarget: 1,
    rewardCoins: 100,
    rewardPips: 0,
    rewardXp: 10,
    sortOrder: 1,
  },
  {
    id: '55555555-0000-4000-0000-000000000002',
    code: 'play_match',
    name: 'Get Rolling',
    description: 'Play 3 matches.',
    goalType: 'play_match',
    goalTarget: 3,
    rewardCoins: 200,
    rewardPips: 0,
    rewardXp: 20,
    sortOrder: 2,
  },
  {
    id: '55555555-0000-4000-0000-000000000003',
    code: 'win_match',
    name: 'Winner Winner',
    description: 'Win 1 match.',
    goalType: 'win_match',
    goalTarget: 1,
    rewardCoins: 300,
    rewardPips: 0,
    rewardXp: 30,
    sortOrder: 3,
  },
  {
    id: '55555555-0000-4000-0000-000000000004',
    code: 'play_with_friends',
    name: 'Social Roller',
    description: 'Play 2 matches with friends.',
    goalType: 'play_with_friends',
    goalTarget: 2,
    rewardCoins: 250,
    rewardPips: 0,
    rewardXp: 25,
    sortOrder: 4,
  },
  {
    id: '55555555-0000-4000-0000-000000000005',
    code: 'send_gift',
    name: 'Generous Spirit',
    description: 'Send 1 gift to a friend.',
    goalType: 'send_gift',
    goalTarget: 1,
    rewardCoins: 150,
    rewardPips: 5,
    rewardXp: 20,
    sortOrder: 5,
  },
];
