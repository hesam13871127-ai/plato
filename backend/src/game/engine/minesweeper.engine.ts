import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

/** Side length of the shared minefield. */
const SIZE = 12;
/** Number of mines buried in the field. */
const MINE_COUNT = 22;

interface MinesweeperBoard extends Record<string, unknown> {
  /**
   * Server-only mine map, index = y * SIZE + x. Stripped from every
   * client view — clients must never learn where the mines are.
   */
  mines: boolean[];
  /**
   * Server-only adjacent-mine counts. Clients receive `visible`, which
   * carries the count only for revealed cells.
   */
  adjacent: number[];
  /** Public: revealed[i] is true once cell i has been cleared. */
  revealed: boolean[];
  /** Public: flags[i] = seat number or null. Cosmetic markers, shared. */
  flags: Array<number | null>;
  /**
   * Public client-safe mirror of `adjacent`: the count for revealed cells,
   * -1 for covered ones.
   */
  visible: number[];
  /** Summary of the most recent reveal, for the board animation. */
  lastReveal: {
    seat: number;
    index: number;
    hitMine: boolean;
    /** Indices cleared by this reveal (flood fill included). */
    cleared: number[];
  } | null;
  /** Elimination order — a blown-up seat keeps its score but stops acting. */
  eliminated: boolean[];
  revealCount: number;
}

/**
 * Competitive Minesweepers (Plato rules flavour) for 2–4 players.
 *
 * Everyone digs into ONE shared minefield, one reveal per turn. Safe cells
 * score +1 point each — zero cells flood open, so a well-placed dig can rake
 * in a whole pocket at once. Dig up a mine and you are blown out of the
 * round: your score is locked and you watch the rest play on. The field
 * belongs to the last player standing, or — if everyone digs safely to the
 * end — to the highest score when the last safe cell is cleared.
 *
 * Mine positions are hidden information: every client view strips `mines`
 * and `adjacent`. Bots read only the visible numbers and pick the covered
 * cell that touches the most informative revealed numbers.
 */
@Injectable()
export class MinesweeperEngine extends BaseGameEngine {
  readonly slug = 'minesweepers';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const cells = SIZE * SIZE;
    const mines = Array<boolean>(cells).fill(false);
    const adjacent = Array<number>(cells).fill(0);

    // Bury the mines uniformly at random.
    let placed = 0;
    while (placed < MINE_COUNT) {
      const idx = Math.floor(Math.random() * cells);
      if (!mines[idx]) {
        mines[idx] = true;
        placed++;
      }
    }
    for (let i = 0; i < cells; i++) adjacent[i] = this.countAdjacent(mines, i);

    const board: MinesweeperBoard = {
      mines,
      adjacent,
      revealed: Array<boolean>(cells).fill(false),
      flags: Array<number | null>(cells).fill(null),
      visible: Array<number>(cells).fill(-1),
      lastReveal: null,
      eliminated: config.seats.map(() => false),
      revealCount: 0,
    };
    return {
      phase: 'in_progress',
      turn: 0,
      currentSeat: 0,
      turnStartedAt: new Date().toISOString(),
      seats: config.seats.map((s, i) => ({
        seatNumber: i,
        playerId: s.playerId,
        displayName: s.displayName,
        avatarUrl: s.avatarUrl,
        connected: true,
        score: 0,
      })),
      board: board as unknown as Record<string, unknown>,
      winnerSeat: null,
      scores: config.seats.map(() => 0),
      version: 1,
    };
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'The game is already over.' };
    if (action.seat !== state.currentSeat) return { ok: false, error: 'It is not your turn.' };
    const board = state.board as unknown as MinesweeperBoard;
    if (board.eliminated[action.seat]) return { ok: false, error: 'You are out of this round.' };

    if (action.type === 'reveal') {
      const idx = Number(action.payload.index);
      if (!Number.isInteger(idx) || idx < 0 || idx >= SIZE * SIZE) {
        return { ok: false, error: 'Pick a cell on the minefield.' };
      }
      if (board.revealed[idx]) return { ok: false, error: 'That cell is already cleared.' };
      // A flagged cell may still be revealed — the flag comes off with it
      // (casual rule: flags are personal markers, not locks).
      return { ok: true };
    }
    if (action.type === 'flag') {
      const idx = Number(action.payload.index);
      if (!Number.isInteger(idx) || idx < 0 || idx >= SIZE * SIZE) {
        return { ok: false, error: 'Pick a cell on the minefield.' };
      }
      if (board.revealed[idx]) return { ok: false, error: 'You cannot flag a cleared cell.' };
      const mineHere = board.mines[idx];
      // Flags are only markers — a wrong flag is allowed (classic rules).
      void mineHere;
      return { ok: true };
    }
    return { ok: false, error: 'Unknown action.' };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid action.');
    const next = this.clone(state);
    const board = next.board as unknown as MinesweeperBoard;
    const seat = action.seat;

    if (action.type === 'flag') {
      const idx = Number(action.payload.index);
      board.flags[idx] = board.flags[idx] === seat ? null : seat;
      next.version += 1;
      next.turnStartedAt = new Date().toISOString(); // flagging is free — same turn
      return next;
    }

    const idx = Number(action.payload.index);
    board.lastReveal = { seat, index: idx, hitMine: board.mines[idx], cleared: [] };

    if (board.mines[idx]) {
      // Boom. The seat is eliminated with its score locked.
      board.eliminated[seat] = true;
      board.lastReveal.cleared = [idx];
      board.revealed[idx] = true; // the mine shows itself
      board.flags[idx] = null; // the flag comes off with the reveal
      board.visible[idx] = -2; // -2 = exploded mine marker
      next.seats[seat].score = next.scores[seat];
    } else {
      const cleared = this.floodReveal(board, idx);
      board.lastReveal.cleared = cleared;
      next.scores[seat] += cleared.length;
      next.seats[seat].score = next.scores[seat];
    }
    board.revealCount += 1;
    next.version += 1;

    // End of field? Highest score takes it.
    const safeLeft = board.revealed.filter((r, i) => !r && !board.mines[i]).length;
    if (safeLeft === 0) {
      this.finish(next, null);
      return next;
    }

    // Only one player still breathing? They inherit the field and win.
    const alive = board.eliminated.map((e, i) => ({ e, i })).filter((x) => !x.e);
    if (alive.length === 1 && board.eliminated.some((e) => e)) {
      this.finish(next, alive[0].i);
      return next;
    }
    if (alive.length === 0) {
      // Everyone blew up — best locked score wins, later survivors win ties.
      this.finish(next, null);
      return next;
    }

    // Advance to the next living seat.
    let nextSeat = (seat + 1) % board.eliminated.length;
    while (board.eliminated[nextSeat]) nextSeat = (nextSeat + 1) % board.eliminated.length;
    next.currentSeat = nextSeat;
    next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as MinesweeperBoard;
    const mistakeChance =
      difficulty === 'easy' ? 0.5 : difficulty === 'medium' ? 0.3 : difficulty === 'hard' ? 0.12 : 0.02;

    let index: number;
    if (Math.random() < mistakeChance) {
      index = this.randomCovered(board, true);
    } else {
      index = this.bestCell(board, difficulty);
    }
    return {
      action: { seat, type: 'reveal', payload: { index } },
      delayMs: this.think(difficulty),
    };
  }

  // ── rules helpers ─────────────────────────────────────────────────────────

  private countAdjacent(mines: boolean[], idx: number): number {
    const x = idx % SIZE;
    const y = Math.floor(idx / SIZE);
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
        if (mines[ny * SIZE + nx]) n++;
      }
    }
    return n;
  }

  /** Reveals `idx` (safe) plus its zero-flood pocket. Returns cleared indices. */
  private floodReveal(board: MinesweeperBoard, idx: number): number[] {
    const cleared: number[] = [];
    const stack = [idx];
    while (stack.length) {
      const i = stack.pop() as number;
      if (board.revealed[i]) continue;
      board.revealed[i] = true;
      board.visible[i] = board.adjacent[i];
      board.flags[i] = null;
      cleared.push(i);
      if (board.adjacent[i] === 0) {
        const x = i % SIZE;
        const y = Math.floor(i / SIZE);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
            const nIdx = ny * SIZE + nx;
            if (!board.revealed[nIdx] && !board.mines[nIdx]) stack.push(nIdx);
          }
        }
      }
    }
    return cleared;
  }

  private finish(state: GameState, forcedWinner: number | null): void {
    const board = state.board as unknown as MinesweeperBoard;
    let winner: number | null = forcedWinner;
    if (winner === null) {
      // Highest score wins; on a tie the seat that kept digging longest wins.
      const alive = board.eliminated.map((e, i) => ({ e, i })).filter((x) => !x.e);
      const pool = alive.length > 0 ? alive : board.eliminated.map((e, i) => ({ e, i }));
      let best = pool[0];
      for (const cand of pool) {
        if (
          state.scores[cand.i] > state.scores[best.i] ||
          (state.scores[cand.i] === state.scores[best.i] && !cand.e && best.e)
        ) {
          best = cand;
        }
      }
      winner = best.i;
    }
    state.phase = 'completed';
    state.winnerSeat = winner;
    state.currentSeat = -1;
    state.seats = state.seats.map((s, i) => ({ ...s, score: state.scores[i] }));
  }

  // ── bot brain ─────────────────────────────────────────────────────────────

  private randomCovered(board: MinesweeperBoard, avoidEdge: boolean): number {
    const candidates: number[] = [];
    for (let i = 0; i < SIZE * SIZE; i++) {
      if (board.revealed[i]) continue;
      if (avoidEdge && this.coveredNeighbours(board, i) === 8) continue; // fully dark cells are blind shots
      candidates.push(i);
    }
    if (candidates.length === 0) {
      for (let i = 0; i < SIZE * SIZE; i++) if (!board.revealed[i]) candidates.push(i);
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  private coveredNeighbours(board: MinesweeperBoard, idx: number): number {
    const x = idx % SIZE;
    const y = Math.floor(idx / SIZE);
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
        if (!board.revealed[ny * SIZE + nx]) n++;
      }
    }
    return n;
  }

  /**
   * Classic single-constraint solver: for every revealed number, if the count
   * of covered neighbours equals the remaining mine budget, all of them are
   * mines (avoid); if the budget is 0, all are safe (dig). Otherwise pick the
   * covered cell next to the most revealed digits — more information, fewer
   * nasty surprises. Difficulty tightens the fallback and the flag discipline.
   */
  private bestCell(board: MinesweeperBoard, difficulty: SeatInfo['botDifficulty']): number {
    const knownMines = new Set<number>();
    const knownSafe = new Set<number>();
    for (let i = 0; i < SIZE * SIZE; i++) {
      if (!board.revealed[i] || board.visible[i] <= 0) continue;
      const covered: number[] = [];
      let flagged = 0;
      const x = i % SIZE;
      const y = Math.floor(i / SIZE);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
          const nIdx = ny * SIZE + nx;
          if (board.revealed[nIdx]) continue;
          covered.push(nIdx);
          if (board.flags[nIdx] !== null) flagged++;
        }
      }
      const budget = board.visible[i] - flagged;
      if (budget === 0) covered.forEach((c) => knownSafe.add(c));
      else if (budget === covered.length) covered.forEach((c) => knownMines.add(c));
    }

    const safe = [...knownSafe].filter((i) => !board.revealed[i] && board.flags[i] === null);
    if (safe.length > 0) return safe[Math.floor(Math.random() * safe.length)];

    // Probe cells that touch revealed numbers (information first).
    const frontier: number[] = [];
    const dark: number[] = [];
    for (let i = 0; i < SIZE * SIZE; i++) {
      if (board.revealed[i] || knownMines.has(i)) continue;
      if (board.flags[i] !== null) continue;
      if (this.coveredNeighbours(board, i) === 8) dark.push(i);
      else frontier.push(i);
    }
    const pool = frontier.length > 0 ? frontier : dark;
    if (pool.length === 0) {
      // Only flagged cells remain covered — unflag and dig them.
      for (let i = 0; i < SIZE * SIZE; i++) {
        if (!board.revealed[i]) return i;
      }
      return 0;
    }
    if (difficulty === 'easy' || difficulty === 'medium') {
      return pool[Math.floor(Math.random() * pool.length)];
    }
    let best = pool[0];
    let bestInfo = -1;
    for (const i of pool) {
      const info = 8 - this.coveredNeighbours(board, i);
      if (info > bestInfo) {
        bestInfo = info;
        best = i;
      }
    }
    return best;
  }

  // ── shared helpers ────────────────────────────────────────────────────────

  /** Strips the mine map and hidden adjacency from every client view. */
  protected redactHidden(state: GameState, _seat: number): GameState {
    const board = state.board as unknown as MinesweeperBoard;
    return {
      ...state,
      board: {
        ...board,
        mines: [],
        adjacent: [],
      } as unknown as Record<string, unknown>,
    };
  }

  private think(difficulty: SeatInfo['botDifficulty']): number {
    const base = difficulty === 'easy' ? 1300 : difficulty === 'medium' ? 950 : difficulty === 'hard' ? 700 : 500;
    return base + Math.floor(Math.random() * 700);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as MinesweeperBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...(board as Record<string, unknown>),
        mines: [...board.mines],
        adjacent: [...board.adjacent],
        revealed: [...board.revealed],
        flags: [...board.flags],
        visible: [...board.visible],
        eliminated: [...board.eliminated],
        lastReveal: board.lastReveal ? { ...board.lastReveal, cleared: [...board.lastReveal.cleared] } : null,
      } as unknown as Record<string, unknown>,
    };
  }
}
