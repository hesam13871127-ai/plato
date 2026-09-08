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

/**
 * The game catalog — rebuilt from scratch, wave by wave.
 * Wave 1: Dominoes, Ludo, Ocho, Connect 4, Checkers.
 * Wave 2: Chess, 8-Ball Pool, Carrom, Dots & Boxes, Snakes & Ladders.
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
];

export function getGame(id: string): GameMeta {
  const game = games.find((g) => g.id === id);
  if (!game) throw new Error(`unknown game: ${id}`);
  return game;
}
