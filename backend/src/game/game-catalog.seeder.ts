import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameEntity } from '../database/entities/game.entity';
import { EngineRegistry } from './engine/engine.registry';

interface GameSeed {
  slug: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  avgDurationMinutes: number;
  supportsBots: boolean;
  rankedEnabled: boolean;
  status: 'active' | 'coming_soon';
}

const CATALOG: GameSeed[] = [
  {
    slug: 'dominoes',
    name: 'Dominoes',
    description: 'Classic Draw Dominoes for 2–4 players. Empty your hand or block the table!',
    minPlayers: 2,
    maxPlayers: 4,
    avgDurationMinutes: 10,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },
  {
    slug: 'connect4',
    name: '4 in a Row',
    description: 'Drop discs and connect four before your rival. Fast, sharp and tactical.',
    minPlayers: 2,
    maxPlayers: 2,
    avgDurationMinutes: 5,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },
  {
    slug: 'ocho',
    name: 'Ocho',
    description: 'Match colours and numbers, slam skips and wilds. The classic crazy-eights party game.',
    minPlayers: 2,
    maxPlayers: 4,
    avgDurationMinutes: 10,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },
  {
    slug: 'ludo',
    name: 'Ludo',
    description: 'Roll the dice and race all four tokens home. Capture rivals and chase that six!',
    minPlayers: 2,
    maxPlayers: 4,
    avgDurationMinutes: 20,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },
  {
    slug: 'chess',
    name: 'Chess',
    description: 'The royal duel. Full legal moves, check and checkmate. Outthink the board.',
    minPlayers: 2,
    maxPlayers: 2,
    avgDurationMinutes: 20,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },
  {
    slug: 'bingo',
    name: 'Bingo',
    description: 'Mark your card and shout BINGO. A live, fast-drawing party thrill for up to 8.',
    minPlayers: 2,
    maxPlayers: 8,
    avgDurationMinutes: 6,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },
  {
    slug: 'dice_party',
    name: 'Dice Party',
    description: 'Five rounds of rolling chaos. Highest dice sum banks the point!',
    minPlayers: 2,
    maxPlayers: 6,
    avgDurationMinutes: 5,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },
  {
    slug: 'werewolf',
    name: 'Werewolf',
    description: 'Night falls: wolves hunt, the seer investigates, the village votes. Find the liars!',
    minPlayers: 5,
    maxPlayers: 8,
    avgDurationMinutes: 12,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },
  {
    slug: 'sketch_guess',
    name: 'Sketch & Guess',
    description: 'Draw the secret word, guess the scribbles. Fastest guess wins the points!',
    minPlayers: 3,
    maxPlayers: 6,
    avgDurationMinutes: 10,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },
  {
    slug: 'pool_8ball',
    name: 'Pool 8-Ball',
    description: 'Sink your stripes or solids, then drop the eight. Real physics, one clean break.',
    minPlayers: 2,
    maxPlayers: 2,
    avgDurationMinutes: 10,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },
  {
    slug: 'carrom',
    name: 'Carrom',
    description: 'Flick the striker, pocket your coins and cover the queen. A board-flicking classic.',
    minPlayers: 2,
    maxPlayers: 2,
    avgDurationMinutes: 10,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },
  {
    slug: 'trivia',
    name: 'Trivia Battle',
    description: 'Fast multiple-choice trivia! Answer correctly and quickly to score speed bonuses.',
    minPlayers: 2,
    maxPlayers: 6,
    avgDurationMinutes: 5,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },
  {
    slug: 'emoji_charades',
    name: 'Emoji Charades',
    description: 'Emojis reveal the secret word — be the first to guess and win the round!',
    minPlayers: 3,
    maxPlayers: 6,
    avgDurationMinutes: 6,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },
  {
    slug: 'word_chain',
    name: 'Word Chain',
    description: 'Keep the chain going: each word must start with the last letter of the previous one.',
    minPlayers: 2,
    maxPlayers: 6,
    avgDurationMinutes: 6,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },
  {
    slug: 'memory_race',
    name: 'Memory Race',
    description: 'Flip and match pairs before everyone else in this fast, shared-grid memory race!',
    minPlayers: 2,
    maxPlayers: 4,
    avgDurationMinutes: 4,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },
  {
    slug: 'impostor_light',
    name: 'Impostor Light',
    description: 'One of you knows nothing. Bluff, discuss and vote to catch the impostor!',
    minPlayers: 4,
    maxPlayers: 8,
    avgDurationMinutes: 5,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },
  {
    slug: 'quick_challenges',
    name: 'Quick Challenges',
    description: 'Six frantic 10-second minigames in a row — tapping, reactions and reflexes!',
    minPlayers: 2,
    maxPlayers: 6,
    avgDurationMinutes: 5,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },
];

/** Ensures the game catalogue matches the registered engines. */
@Injectable()
export class GameCatalogSeeder {
  private readonly logger = new Logger(GameCatalogSeeder.name);

  constructor(
    @InjectRepository(GameEntity) private readonly games: Repository<GameEntity>,
    private readonly engines: EngineRegistry,
  ) {}

  async seed(): Promise<void> {
    for (const seed of CATALOG) {
      const existing = await this.games.findOne({ where: { slug: seed.slug } });
      const playable = this.engines.has(seed.slug);
      const status = playable && seed.status === 'active' ? 'active' : seed.status;
      if (existing) {
        existing.name = seed.name;
        existing.description = seed.description;
        existing.minPlayers = seed.minPlayers;
        existing.maxPlayers = seed.maxPlayers;
        existing.avgDurationMinutes = seed.avgDurationMinutes;
        existing.supportsBots = seed.supportsBots;
        existing.rankedEnabled = seed.rankedEnabled;
        existing.status = status as GameEntity['status'];
        await this.games.save(existing);
      } else {
        await this.games.save(
          this.games.create({
            slug: seed.slug,
            name: seed.name,
            description: seed.description,
            iconUrl: null,
            minPlayers: seed.minPlayers,
            maxPlayers: seed.maxPlayers,
            avgDurationMinutes: seed.avgDurationMinutes,
            supportsBots: seed.supportsBots,
            rankedEnabled: seed.rankedEnabled,
            status: status as GameEntity['status'],
          }),
        );
      }
    }
    this.logger.log('Game catalogue ensured.');
  }
}
