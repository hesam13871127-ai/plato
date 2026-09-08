import type { GameMeta } from './types';
import { dominoesMeta } from '../games/dominoes/meta';
import { ludoMeta } from '../games/ludo/meta';
import { ochoMeta } from '../games/ocho/meta';
import { connect4Meta } from '../games/connect4/meta';
import { checkersMeta } from '../games/checkers/meta';
import { chessMeta } from '../games/chess/meta';
import { poolMeta } from '../games/pool/meta';
import { carromMeta } from '../games/carrom/meta';
import { dotsMeta } from '../games/dots/meta';
import { snakesMeta } from '../games/snakes/meta';
import { bingoMeta } from '../games/bingo/meta';
import { diceMeta } from '../games/dice/meta';
import { backgammonMeta } from '../games/backgammon/meta';
import { mancalaMeta } from '../games/mancala/meta';
import { bowlingMeta } from '../games/bowling/meta';

/**
 * The game catalog — rebuilt from scratch, wave by wave.
 * Wave 1: Dominoes, Ludo, Ocho, Connect 4, Checkers.
 * Wave 2: Chess, 8-Ball Pool, Carrom, Dots & Boxes, Snakes & Ladders.
 * Wave 3: Bingo, Dice Party, Backgammon, Mancala, Bowling.
 */
export const games: GameMeta[] = [
  dominoesMeta,
  ludoMeta,
  ochoMeta,
  connect4Meta,
  checkersMeta,
  chessMeta,
  poolMeta,
  carromMeta,
  dotsMeta,
  snakesMeta,
  bingoMeta,
  diceMeta,
  backgammonMeta,
  mancalaMeta,
  bowlingMeta,
];

export function getGame(id: string): GameMeta {
  const game = games.find((g) => g.id === id);
  if (!game) throw new Error(`unknown game: ${id}`);
  return game;
}
