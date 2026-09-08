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
import { triviaMeta } from '../games/trivia/meta';
import { emojiMeta } from '../games/emoji/meta';
import { chainMeta } from '../games/chain/meta';
import { memoryMeta } from '../games/memory/meta';
import { sketchMeta } from '../games/sketch/meta';
import { werewolfMeta } from '../games/werewolf/meta';
import { impostorMeta } from '../games/impostor/meta';
import { bankrollMeta } from '../games/bankroll/meta';
import { minigolfMeta } from '../games/minigolf/meta';
import { dartsMeta } from '../games/darts/meta';

/**
 * The game catalog — rebuilt from scratch, wave by wave.
 * Wave 1: Dominoes, Ludo, Ocho, Connect 4, Checkers.
 * Wave 2: Chess, 8-Ball Pool, Carrom, Dots & Boxes, Snakes & Ladders.
 * Wave 3: Bingo, Dice Party, Backgammon, Mancala, Bowling.
 * Wave 4: Trivia, Emoji Charades, Word Chain, Memory, Sketch.
 * Wave 5: Werewolf, Impostor, Bankroll, Mini Golf, Darts.
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
  triviaMeta,
  emojiMeta,
  chainMeta,
  memoryMeta,
  sketchMeta,
  werewolfMeta,
  impostorMeta,
  bankrollMeta,
  minigolfMeta,
  dartsMeta,
];

export function getGame(id: string): GameMeta {
  const game = games.find((g) => g.id === id);
  if (!game) throw new Error(`unknown game: ${id}`);
  return game;
}
