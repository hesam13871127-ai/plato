import type { GameConfig, GameEngine, RNG } from '../../core/types';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/**
 * Competitive Minesweeper: everyone races on the SAME board. On your turn
 * you reveal one cell: a safe cell (and its flood) earns +1 per cell, a
 * mine costs 5 points and passes the turn. Most points when the board is
 * cleared wins. The very first reveal of the game is always safe.
 */

export const MW_W = 12;
export const MW_H = 12;
export const MW_MINES = 22;
export const MINE_PENALTY = 5;

export interface MineState {
  playerCount: number;
  w: number;
  h: number;
  mines: boolean[];
  numbers: number[];
  revealed: boolean[];
  exploded: boolean[];
  /** who revealed each cell (-1 = none) */
  owner: number[];
  scores: number[];
  turn: number;
  firstClickDone: boolean;
  phase: 'play' | 'over';
  lastEvent: { player: number; idx: number; kind: 'safe' | 'mine'; cells: number[] } | null;
}

export type MineAction = { type: 'reveal'; idx: number };

/* ------------------------------------------------------------------ */
/* Board plumbing                                                      */
/* ------------------------------------------------------------------ */

export function neighborsOf(idx: number, w = MW_W, h = MW_H): number[] {
  const x = idx % w;
  const y = Math.floor(idx / w);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      out.push(ny * w + nx);
    }
  }
  return out;
}

function computeNumbers(mines: boolean[]): number[] {
  return mines.map((_, i) => neighborsOf(i).filter((n) => mines[n]).length);
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

export const minesEngine: GameEngine<MineState, MineAction> = {
  createInitialState(config, rng) {
    const size = MW_W * MW_H;
    const cells = Array.from({ length: size }, (_, i) => i);
    const mineCells = new Set(rng.shuffle(cells).slice(0, MW_MINES));
    const mines = Array.from({ length: size }, (_, i) => mineCells.has(i));
    return {
      playerCount: config.slots.length,
      w: MW_W,
      h: MW_H,
      mines,
      numbers: computeNumbers(mines),
      revealed: Array.from({ length: size }, () => false),
      exploded: Array.from({ length: size }, () => false),
      owner: Array.from({ length: size }, () => -1),
      scores: Array.from({ length: config.slots.length }, () => 0),
      turn: 0,
      firstClickDone: false,
      phase: 'play',
      lastEvent: null,
    };
  },

  legalActions(state, playerId) {
    if (state.phase !== 'play' || state.turn !== playerId) return [];
    const acts: MineAction[] = [];
    for (let i = 0; i < state.mines.length; i++) {
      if (!state.revealed[i] && !state.exploded[i]) acts.push({ type: 'reveal', idx: i });
    }
    return acts;
  },

  validate(state, action, playerId) {
    if (state.phase !== 'play' || state.turn !== playerId) return false;
    if (action.type !== 'reveal') return false;
    const i = action.idx;
    if (i < 0 || i >= state.mines.length) return false;
    return !state.revealed[i] && !state.exploded[i];
  },

  applyAction(state, action, playerId) {
    if (!minesEngine.validate(state, action, playerId)) return state;

    let mines = state.mines;
    let numbers = state.numbers;
    let firstClickDone = state.firstClickDone;

    // first reveal of the game is always safe: relocate the mine if needed
    if (!firstClickDone && state.mines[action.idx]) {
      mines = [...state.mines];
      const to = mines.findIndex((m, i) => !m && i !== action.idx);
      if (to >= 0) {
        mines[action.idx] = false;
        mines[to] = true;
        numbers = computeNumbers(mines);
      }
    }
    if (!firstClickDone) firstClickDone = true;

    if (mines[action.idx]) {
      const exploded = [...state.exploded];
      exploded[action.idx] = true;
      const scores = [...state.scores];
      scores[playerId]! -= MINE_PENALTY;
      const safeLeft =
        mines.filter((m, i) => !m).length - state.revealed.filter((r) => r).length;
      const over = safeLeft <= 0;
      return {
        ...state,
        mines,
        numbers,
        exploded,
        scores,
        firstClickDone,
        turn: over ? state.turn : (playerId + 1) % state.playerCount,
        phase: over ? 'over' : 'play',
        lastEvent: { player: playerId, idx: action.idx, kind: 'mine', cells: [] },
      };
    }

    // safe reveal + flood fill over zeros
    const revealed = [...state.revealed];
    const owner = [...state.owner];
    const stack = [action.idx];
    const opened: number[] = [];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (revealed[cur]) continue;
      revealed[cur] = true;
      owner[cur] = playerId;
      opened.push(cur);
      if (numbers[cur] === 0) {
        for (const n of neighborsOf(cur)) {
          if (!revealed[n] && !mines[n]) stack.push(n);
        }
      }
    }

    const scores = [...state.scores];
    scores[playerId]! += opened.length;
    const safeTotal = mines.filter((m) => !m).length;
    const revealedCount = revealed.filter(Boolean).length;
    const over = revealedCount >= safeTotal;

    return {
      ...state,
      mines,
      numbers,
      revealed,
      owner,
      scores,
      firstClickDone,
      turn: over ? state.turn : (playerId + 1) % state.playerCount,
      phase: over ? 'over' : 'play',
      lastEvent: { player: playerId, idx: action.idx, kind: 'safe', cells: opened },
    };
  },

  chooseBotMove(state, playerId, rng, difficulty) {
    if (state.phase !== 'play' || state.turn !== playerId) return null;
    const open: number[] = [];
    for (let i = 0; i < state.mines.length; i++) {
      if (!state.revealed[i] && !state.exploded[i]) open.push(i);
    }
    if (open.length === 0) return null;
    if (difficulty === 'easy') return { type: 'reveal', idx: rng.pick(open) };

    // constraint solve: certain-safe cells and certain mines
    const certainSafe: number[] = [];
    const certainMine = new Set<number>();
    const flagged = new Set<number>();
    for (let i = 0; i < state.mines.length; i++) {
      if (!state.revealed[i]) continue;
      const ns = neighborsOf(i);
      const unknown = ns.filter((n) => !state.revealed[n] && !state.exploded[n]);
      const boom = ns.filter((n) => state.exploded[n]).length;
      const left = state.numbers[i]! - boom;
      if (unknown.length > 0) {
        if (left === 0) certainSafe.push(...unknown);
        else if (left === unknown.length) unknown.forEach((u) => certainMine.add(u));
      }
    }
    const safe = certainSafe.filter((i) => !state.revealed[i] && !certainMine.has(i));
    if (safe.length > 0) return { type: 'reveal', idx: rng.pick(safe) };

    const nonMine = open.filter((i) => !certainMine.has(i));
    const pool = nonMine.length > 0 ? nonMine : open;
    if (difficulty === 'medium') return { type: 'reveal', idx: rng.pick(pool) };

    // hard: pick the frontier cell with the lowest local mine density
    let best = pool[0]!;
    let bestScore = Infinity;
    for (const i of rng.shuffle(pool)) {
      const ns = neighborsOf(i);
      const unknownN = ns.filter((n) => !state.revealed[n] && !state.exploded[n]).length;
      const boomN = ns.filter((n) => state.exploded[n]).length;
      const knownN = ns.filter((n) => state.revealed[n]).length;
      // prefer frontier cells (some info) with few surrounding booms
      const score = boomN * 10 - knownN * 2 + unknownN + rng.next() * 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return { type: 'reveal', idx: best };
  },

  currentPlayers(state) {
    return state.phase === 'play' ? [state.turn] : [];
  },

  isGameOver(state) {
    return state.phase === 'over';
  },

  winners(state) {
    if (state.phase !== 'over') return [];
    const best = Math.max(...state.scores);
    return state.scores.map((s, i) => (s === best ? i : -1)).filter((i) => i >= 0);
  },
};
