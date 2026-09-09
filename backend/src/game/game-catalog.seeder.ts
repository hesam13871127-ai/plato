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

/**
 * The playable catalogue. The rebuild ships games wave by wave — each wave
 * appends its fully playable entries here (engine + 3D board + shop items +
 * bilingual tutorial + 3D logo) so the hub never shows a game that cannot be
 * played end to end.
 */
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
    slug: 'ludo',
    name: 'Ludo',
    description: 'Roll the dice and race all four tokens home. Capture rivals and chase that six!',
    minPlayers: 2,
    maxPlayers: 4,
    avgDurationMinutes: 20,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },  {
    slug: 'ocho',
    name: 'Ocho',
    description: 'Match colours and numbers, slam skips and wilds. The classic crazy-eights party game.',
    minPlayers: 2,
    maxPlayers: 4,
    avgDurationMinutes: 10,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },  {
    slug: 'connect4',
    name: '4 in a Row',
    description: 'Drop discs and connect four before your rival. Fast, sharp and tactical.',
    minPlayers: 2,
    maxPlayers: 2,
    avgDurationMinutes: 5,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },  {
    slug: 'checkers',
    name: 'Checkers',
    description: 'Classic draughts — jump, king and capture! Tactical, fast and perfect for duels.',
    minPlayers: 2,
    maxPlayers: 2,
    avgDurationMinutes: 10,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },  {
    slug: 'chess',
    name: 'Chess',
    description: 'The immortal duel — castle, fork and checkmate your rival on the 64 squares.',
    minPlayers: 2,
    maxPlayers: 2,
    avgDurationMinutes: 12,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },  {
    slug: 'pool',
    name: 'Pool',
    description: 'Arcade 8-ball — smash the break, sink your colours and crown the black.',
    minPlayers: 2,
    maxPlayers: 2,
    avgDurationMinutes: 8,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },  {
    slug: 'carrom',
    name: 'Carrom',
    description: 'Flick, clack, pocket — classic carrom duels with the red queen.',
    minPlayers: 2,
    maxPlayers: 2,
    avgDurationMinutes: 8,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },  {
    slug: 'dots_and_boxes',
    name: 'Dots & Boxes',
    description: 'Draw lines, steal squares, chain the board — tiny grid, huge mind games.',
    minPlayers: 2,
    maxPlayers: 2,
    avgDurationMinutes: 6,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },  {
    slug: 'snakes_ladders',
    name: 'Snakes & Ladders',
    description: 'Climb the ladders, dodge the fangs — pure dice drama for the whole table.',
    minPlayers: 2,
    maxPlayers: 4,
    avgDurationMinutes: 7,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },  {
    slug: 'bingo',
    name: 'Bingo',
    description: 'Balls roll, cards dab, five in a row shouts BINGO! Luck at its loudest.',
    minPlayers: 2,
    maxPlayers: 4,
    avgDurationMinutes: 5,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },  {
    slug: 'dice_party',
    name: 'Dice Party',
    description: 'Roll, hold and bank the perfect Yatzy — fifteen ways to score big.',
    minPlayers: 2,
    maxPlayers: 4,
    avgDurationMinutes: 10,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },  {
    slug: 'backgammon',
    name: 'Backgammon',
    description: 'The ancient race — break contact, anchor up and bear off before your rival.',
    minPlayers: 2,
    maxPlayers: 2,
    avgDurationMinutes: 10,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },  {
    slug: 'mancala',
    name: 'Mancala',
    description: 'Sow, capture and hoard — the classic seed-counting duel of Kalah.',
    minPlayers: 2,
    maxPlayers: 2,
    avgDurationMinutes: 10,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },  {
    slug: 'bowling',
    name: 'Bowling',
    description: 'Line up the pocket, hurl it down the boards and chase that perfect 300.',
    minPlayers: 2,
    maxPlayers: 2,
    avgDurationMinutes: 10,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },  {
    slug: 'trivia',
    name: 'Trivia',
    description: 'Quiz night at the Plato lounge — seven rounds a player, ten points a truth.',
    minPlayers: 2,
    maxPlayers: 4,
    avgDurationMinutes: 8,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },  {
    slug: 'word_chain',
    name: 'Word Chain',
    description: 'Each word starts where the last one ended — ten turns to spell your way to the top.',
    minPlayers: 2,
    maxPlayers: 4,
    avgDurationMinutes: 8,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },  {
    slug: 'emoji_charades',
    name: 'Emoji Charades',
    description: 'Read the emoji riddle, out-guess the table — wrong picks vanish for everyone.',
    minPlayers: 2,
    maxPlayers: 4,
    avgDurationMinutes: 8,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },  {
    slug: 'memory',
    name: 'Memory',
    description: 'Sixteen cards, eight pairs — flip two, remember everything, sweep the deck.',
    minPlayers: 2,
    maxPlayers: 4,
    avgDurationMinutes: 8,
    supportsBots: true,
    rankedEnabled: true,
    status: 'active',
  },  {
    slug: 'sketch',
    name: 'Sketch',
    description: 'Grab the brush, paint the secret word and let the table race to read your mind.',
    minPlayers: 2,
    maxPlayers: 4,
    avgDurationMinutes: 10,
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
    this.logger.log(`Game catalogue ensured (${CATALOG.length} games).`);
  }
}
