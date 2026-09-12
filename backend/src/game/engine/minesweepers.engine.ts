import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface MinesCell {
  mine: boolean;
  revealed: boolean;
  adj: number; // -1 for mine, else 0..8
}

interface MinesBoard extends Record<string, unknown> {
  width: number;
  height: number;
  mineCount: number;
  cells: MinesCell[];
  revealedSafe: number;
  hits: number[]; // per seat mine hits
  lastReveal: { seat: number; x: number; y: number; hitMine: boolean; adj: number } | null;
  log: string[];
}

const W = 9;
const H = 9;
const MINES = 10;

/**
 * Minesweepers — Plato multiplayer sweeper for 2–4 players, wave-8 rebuild.
 *
 * A shared 9×9 board hides ten mines. On your turn tap a hidden cell to
 * reveal it. A numbered cell shows how many of its eight neighbours hide mines
 * and scores you one point. A zero cell auto-expands its empty basin (flood
 * fill) and banks every safe cell inside it. Hit a mine and you lose five
 * points — the mine stays revealed and the turn passes. The first sweep that
 * reveals every safe cell ends the game; the highest score takes the flag.
 *
 * No hidden info after reveal — the client hides only unrevealed mine
 * positions until the game ends or a mine is hit.
 */
@Injectable()
export class MinesweepersEngine extends BaseGameEngine {
  readonly slug = 'minesweepers';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const cells: MinesCell[] = Array.from({ length: W * H }, () => ({ mine: false, revealed: false, adj: 0 }));
    // place mines
    const indices = Array.from({ length: W * H }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = indices[i];
      indices[i] = indices[j];
      indices[j] = t;
    }
    for (let k = 0; k < MINES; k++) cells[indices[k]].mine = true;
    // compute adj
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        if (cells[idx].mine) {
          cells[idx].adj = -1;
          continue;
        }
        let c = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
            if (cells[ny * W + nx].mine) c++;
          }
        }
        cells[idx].adj = c;
      }
    }
    const board: MinesBoard = {
      width: W,
      height: H,
      mineCount: MINES,
      cells,
      revealedSafe: 0,
      hits: config.seats.map(() => 0),
      lastReveal: null,
      log: [],
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
    if (action.type !== 'reveal') return { ok: false, error: 'Unknown action.' };
    const x = Number(action.payload.x);
    const y = Number(action.payload.y);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= W || y < 0 || y >= H) {
      return { ok: false, error: 'Pick a cell on the board.' };
    }
    const board = state.board as unknown as MinesBoard;
    const idx = y * W + x;
    if (board.cells[idx].revealed) return { ok: false, error: 'That cell is already revealed.' };
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid reveal.');
    const next = this.clone(state);
    const board = next.board as unknown as MinesBoard;
    const seat = action.seat;
    const x = Number(action.payload.x);
    const y = Number(action.payload.y);
    const idx = y * W + x;
    const cell = board.cells[idx];

    if (cell.mine) {
      cell.revealed = true;
      board.hits[seat] += 1;
      next.scores[seat] = Math.max(0, next.scores[seat] - 5);
      board.lastReveal = { seat, x, y, hitMine: true, adj: -1 };
      board.log.push(`${next.seats[seat].displayName} hit a mine at ${String.fromCharCode(65 + x)}${y + 1} — ouch!`);
      next.version += 1;
      // turn passes
      next.currentSeat = (seat + 1) % next.seats.length;
      next.turn += 1;
      next.turnStartedAt = new Date().toISOString();
      // If all safe cells revealed? Not after mine but check.
      if (board.revealedSafe >= W * H - MINES) this.finish(next);
      return next;
    }

    // safe reveal with flood fill for zeros
    const toReveal: number[] = [];
    const visited = new Set<number>();
    const queue: number[] = [idx];
    visited.add(idx);
    while (queue.length) {
      const cur = queue.shift()!;
      if (board.cells[cur].revealed) continue;
      toReveal.push(cur);
      if (board.cells[cur].adj === 0) {
        const cx = cur % W;
        const cy = Math.floor(cur / W);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
            const nidx = ny * W + nx;
            if (visited.has(nidx) || board.cells[nidx].mine || board.cells[nidx].revealed) continue;
            visited.add(nidx);
            queue.push(nidx);
          }
        }
      }
    }
    let gained = 0;
    for (const i of toReveal) {
      if (!board.cells[i].revealed && !board.cells[i].mine) {
        board.cells[i].revealed = true;
        gained++;
      }
    }
    board.revealedSafe += gained;
    next.scores[seat] += gained;
    board.lastReveal = { seat, x, y, hitMine: false, adj: cell.adj };
    board.log.push(`${next.seats[seat].displayName} cleared ${gained} cell${gained === 1 ? '' : 's'} from ${String.fromCharCode(65 + x)}${y + 1}`);
    next.version += 1;

    if (board.revealedSafe >= W * H - MINES) {
      this.finish(next);
      return next;
    }
    next.currentSeat = (seat + 1) % next.seats.length;
    next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as MinesBoard;
    const hidden = board.cells.map((c, i) => ({ c, i })).filter(({ c }) => !c.revealed);
    // Hard bots avoid obvious mines: if a revealed number's hidden neighbours count equals its adj, others are safe.
    const safeHints = new Set<number>();
    const mineHints = new Set<number>();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        const cell = board.cells[idx];
        if (!cell.revealed || cell.adj <= 0) continue;
        const neighbours: number[] = [];
        let hiddenNeigh = 0;
        let flaggedMines = 0; // we treat revealed mines as flagged
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
            const nidx = ny * W + nx;
            const nc = board.cells[nidx];
            if (!nc.revealed) {
              hiddenNeigh++;
              neighbours.push(nidx);
            } else if (nc.mine) flaggedMines++;
          }
        }
        if (hiddenNeigh === 0) continue;
        // If adj equals known mines, all hidden are safe? Actually if adj == flagged, remaining hidden are safe.
        // We don't track flags separate from revealed mines, so flagged is revealed mines only.
        // So if cell.adj === flaggedMines -> remaining hidden are safe.
        if (cell.adj === flaggedMines) {
          for (const n of neighbours) if (!board.cells[n].revealed) safeHints.add(n);
        }
        // If hidden count equals remaining mines, all hidden are mines
        if (cell.adj - flaggedMines === hiddenNeigh) {
          for (const n of neighbours) mineHints.add(n);
        }
      }
    }
    const safePool = hidden.filter(({ i }) => safeHints.has(i) && !mineHints.has(i));
    const riskyPool = hidden.filter(({ i }) => !mineHints.has(i));

    let pool: typeof hidden;
    if (difficulty === 'hard' || difficulty === 'expert') {
      pool = safePool.length > 0 ? safePool : riskyPool.length > 0 ? riskyPool : hidden;
    } else if (difficulty === 'medium') {
      pool = Math.random() < 0.6 && safePool.length > 0 ? safePool : riskyPool.length > 0 ? riskyPool : hidden;
    } else {
      pool = hidden;
    }
    const pick = pool[Math.floor(Math.random() * pool.length)] ?? hidden[Math.floor(Math.random() * hidden.length)];
    const idx = pick.i;
    const x = idx % W;
    const y = Math.floor(idx / W);
    return {
      action: { seat, type: 'reveal', payload: { x, y } },
      delayMs: this.think(difficulty),
    };
  }

  protected redactHidden(state: GameState, _seat: number): GameState {
    const board = state.board as unknown as MinesBoard;
    // During play hide mine positions for unrevealed cells; at completion reveal all.
    if (state.phase === 'completed') return state;
    const view = this.clone(state);
    const vb = view.board as unknown as MinesBoard;
    vb.cells = vb.cells.map((c) => {
      if (c.revealed) return { ...c };
      // hide mine flag
      return { mine: false, revealed: false, adj: 0 };
    });
    return view;
  }

  private finish(state: GameState): void {
    // reveal all at end for client
    const board = state.board as unknown as MinesBoard;
    for (const c of board.cells) c.revealed = true;
    const scores = state.scores;
    const max = Math.max(...scores);
    const leaders = scores.map((s, i) => ({ s, i })).filter((x) => x.s === max).map((x) => x.i);
    const winner = leaders.length === 1 ? leaders[0] : null;
    state.phase = 'completed';
    state.winnerSeat = winner;
    state.currentSeat = -1;
    state.seats = state.seats.map((s, i) => ({ ...s, score: state.scores[i] }));
  }

  private think(difficulty: SeatInfo['botDifficulty'], extra = 0): number {
    const base = difficulty === 'easy' ? 1300 : difficulty === 'medium' ? 1000 : difficulty === 'hard' ? 800 : 600;
    return base + extra + Math.floor(Math.random() * 600);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as MinesBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...(board as Record<string, unknown>),
        cells: board.cells.map((c) => ({ ...c })),
        hits: [...board.hits],
        lastReveal: board.lastReveal ? { ...board.lastReveal } : null,
        log: [...board.log],
      } as unknown as Record<string, unknown>,
    };
  }
}
