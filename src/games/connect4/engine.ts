import type { GameConfig, GameEngine, RNG } from '../../core/types';

/* ------------------------------------------------------------------ */

export const C4_COLS = 7;
export const C4_ROWS = 6;

export interface C4State {
  /** grid[col][row]; 0 = empty, otherwise player id + 1 */
  grid: number[][];
  turn: number;
  winner: number | null;
  /** winning [col, row] cells */
  winning: [number, number][];
  moves: number;
  lastEvent: { player: number; col: number; row: number } | null;
}

export type C4Action = { type: 'drop'; col: number };

/* ------------------------------------------------------------------ */

const DIRS: [number, number][] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

function checkWin(grid: number[][], col: number, row: number, player: number): [number, number][] {
  for (const [dc, dr] of DIRS) {
    const cells: [number, number][] = [[col, row]];
    for (const sign of [1, -1]) {
      let c = col + dc * sign;
      let r = row + dr * sign;
      while (c >= 0 && c < C4_COLS && r >= 0 && r < C4_ROWS && grid[c]?.[r] === player) {
        cells.push([c, r]);
        c += dc * sign;
        r += dr * sign;
      }
    }
    if (cells.length >= 4) return cells;
  }
  return [];
}

function drop(grid: number[][], col: number, player: number): number | null {
  const column = grid[col];
  if (!column) return null;
  for (let row = 0; row < C4_ROWS; row++) {
    if (column[row] === 0) {
      column[row] = player;
      return row;
    }
  }
  return null;
}

function undo(grid: number[][], col: number, row: number) {
  grid[col]![row] = 0;
}

/** Simple evaluation: center control + windows of four. */
function evaluate(grid: number[][], me: number, foe: number): number {
  let score = 0;
  // center column bonus
  for (let r = 0; r < C4_ROWS; r++) if (grid[3]?.[r] === me) score += 4;
  // all windows
  for (let c = 0; c < C4_COLS; c++) {
    for (let r = 0; r < C4_ROWS; r++) {
      for (const [dc, dr] of DIRS) {
        let mine = 0;
        let theirs = 0;
        for (let k = 0; k < 4; k++) {
          const cc = c + dc * k;
          const rr = r + dr * k;
          if (cc < 0 || cc >= C4_COLS || rr < 0 || rr >= C4_ROWS) {
            mine = -99;
            break;
          }
          const v = grid[cc]?.[rr];
          if (v === me) mine++;
          else if (v === foe) theirs++;
        }
        if (mine === 4) score += 10000;
        else if (theirs === 4) score -= 10000;
        else if (mine === 3 && theirs === 0) score += 8;
        else if (mine === 2 && theirs === 0) score += 2;
        else if (theirs === 3 && mine === 0) score -= 10;
      }
    }
  }
  return score;
}

function minimax(
  grid: number[][],
  depth: number,
  player: number,
  me: number,
  foe: number,
  alpha: number,
  beta: number,
): number {
  const cols = validCols(grid);
  if (cols.length === 0) return 0;
  if (depth === 0) return evaluate(grid, me, foe);
  const maximizing = player === me;
  let best = maximizing ? -Infinity : Infinity;
  for (const col of cols) {
    const row = drop(grid, col, player);
    if (row === null) continue;
    let val: number;
    if (checkWin(grid, col, row, player).length > 0) {
      val = player === me ? 100000 + depth : -100000 - depth;
    } else {
      val = minimax(grid, depth - 1, player === me ? foe : me, me, foe, alpha, beta);
    }
    undo(grid, col, row);
    if (maximizing) {
      if (val > best) best = val;
      if (best > alpha) alpha = best;
    } else {
      if (val < best) best = val;
      if (best < beta) beta = best;
    }
    if (beta <= alpha) break;
  }
  return best;
}

function validCols(grid: number[][]): number[] {
  const out: number[] = [];
  for (let c = 0; c < C4_COLS; c++) if ((grid[c]?.[C4_ROWS - 1] ?? 1) === 0) out.push(c);
  return out;
}

/* ------------------------------------------------------------------ */

export const connect4Engine: GameEngine<C4State, C4Action> = {
  createInitialState() {
    return {
      grid: Array.from({ length: C4_COLS }, () => Array<number>(C4_ROWS).fill(0)),
      turn: 0,
      winner: null,
      winning: [],
      moves: 0,
      lastEvent: null,
    };
  },

  legalActions(state, playerId) {
    if (state.winner !== null || state.turn !== playerId) return [];
    return validCols(state.grid).map((col) => ({ type: 'drop' as const, col }));
  },

  validate(state, action, playerId) {
    return (
      action.type === 'drop' &&
      state.winner === null &&
      state.turn === playerId &&
      action.col >= 0 &&
      action.col < C4_COLS &&
      (state.grid[action.col]?.[C4_ROWS - 1] ?? 1) === 0
    );
  },

  applyAction(state, action, playerId, _rng: RNG) {
    if (!connect4Engine.validate(state, action, playerId)) return state;
    const grid = state.grid.map((col) => [...col]);
    const player = playerId + 1;
    const row = drop(grid, action.col, player);
    if (row === null) return state;
    const winning = checkWin(grid, action.col, row, player);
    const moves = state.moves + 1;
    const winner =
      winning.length > 0 ? playerId : moves >= C4_COLS * C4_ROWS ? null : null;
    return {
      ...state,
      grid,
      turn: (playerId + 1) % 2,
      winner: winning.length > 0 ? playerId : null,
      winning,
      moves,
      lastEvent: { player: playerId, col: action.col, row },
    };
  },

  chooseBotMove(state, playerId, rng, difficulty) {
    const legal = connect4Engine.legalActions(state, playerId);
    if (legal.length === 0) return null;
    if (difficulty === 'easy' && rng.next() > 0.35) return rng.pick(legal);

    const me = playerId + 1;
    const foe = (playerId === 0 ? 1 : 0) + 1;
    const depth = difficulty === 'hard' ? 6 : difficulty === 'medium' ? 4 : 2;
    const probe = state.grid.map((c) => [...c]);

    // immediate win?
    for (const { col } of legal) {
      const row = drop(probe, col, me);
      if (row !== null) {
        const win = checkWin(probe, col, row, me);
        undo(probe, col, row);
        if (win.length > 0) return { type: 'drop', col };
      }
    }
    // block immediate loss?
    for (const { col } of legal) {
      const row = drop(probe, col, foe);
      if (row !== null) {
        const win = checkWin(probe, col, row, foe);
        undo(probe, col, row);
        if (win.length > 0) return { type: 'drop', col };
      }
    }

    const grid = state.grid.map((c) => [...c]);
    let bestCol = (legal[0] as { col: number }).col;
    let bestScore = -Infinity;
    // slight center preference ordering
    const order = [3, 2, 4, 1, 5, 0, 6].filter((c) => legal.some((a) => a.col === c));
    for (const col of order) {
      const row = drop(grid, col, me);
      if (row === null) continue;
      const win = checkWin(grid, col, row, me);
      const score =
        win.length > 0
          ? 100000
          : minimax(grid, depth - 1, foe, me, foe, -Infinity, Infinity) + rng.next() * 0.1;
      undo(grid, col, row);
      if (score > bestScore) {
        bestScore = score;
        bestCol = col;
      }
    }
    return { type: 'drop', col: bestCol };
  },

  currentPlayers(state) {
    return state.winner !== null || state.moves >= C4_COLS * C4_ROWS ? [] : [state.turn];
  },

  isGameOver(state) {
    return state.winner !== null || state.moves >= C4_COLS * C4_ROWS;
  },

  winners(state) {
    return state.winner !== null ? [state.winner] : [];
  },
};
