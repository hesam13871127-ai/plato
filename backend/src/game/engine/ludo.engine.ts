import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

// Simplified but complete Ludo: each seat owns 4 tokens on a linear 56-cell
// shared track, entering at the seat's coloured start offset. A token moves
// forward on a die roll; landing on an opponent sends it home; reaching the
// final square (home column) after exactly 56 + entry progress finishes it.
// To keep the engine fully self-contained and deterministic we use a compact
// per-seat progress model.

interface LudoToken {
  // -1 = home base (not on board); 0..51 = on shared track (relative progress
  // measured from the seat's own start); 57 = finished.
  progress: number;
}

interface LudoBoard extends Record<string, unknown> {
  tokens: LudoToken[][]; // [seat][token]
  die: number | null;
  hasRolled: boolean;
  // Extra rolls granted on a 6; counts consecutive sixes (3 sixes = forfeit).
  sixStreak: number;
  startOffset: number[]; // absolute start cell per seat on the shared track
  captures: number[];
}

const TRACK = 52;
const HOME_ENTRY = 51; // relative progress at which token turns into home stretch
const FINISH = 57;
const TOKENS_PER_SEAT = 4;

/**
 * Ludo for 2–4 players (turn-based). Roll a 6 to bring a token out of base,
  * move tokens around the track, capture opponents to send them home, and race
 * all four tokens to the centre. Bots choose moves by a capture/safety/
 * progress heuristic with difficulty-tuned mistakes. Full, playable rules.
 */
@Injectable()
export class LudoEngine extends BaseGameEngine {
  readonly slug = 'ludo';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const seats = config.seats;
    const tokens: LudoToken[][] = seats.map(() =>
      Array.from({ length: TOKENS_PER_SEAT }, () => ({ progress: -1 })),
    );
    // Classic corner starts on the 52-cell track (13 cells apart). Two
    // players sit in opposite corners; three take the first three corners.
    // The client draws the cross board from the same corner table.
    const CORNERS = [0, 13, 26, 39];
    const startOffset = seats.length === 2 ? [0, 26] : seats.map((_, i) => CORNERS[i % 4]);
    const board: LudoBoard = {
      tokens,
      die: null,
      hasRolled: false,
      sixStreak: 0,
      startOffset,
      captures: seats.map(() => 0),
    };
    const first = 0;
    return {
      phase: 'in_progress',
      turn: 0,
      currentSeat: first,
      turnStartedAt: new Date().toISOString(),
      seats: seats.map((s, i) => ({
        seatNumber: i,
        playerId: s.playerId,
        displayName: s.displayName,
        avatarUrl: s.avatarUrl,
        connected: true,
        score: 0,
      })),
      board: board as unknown as Record<string, unknown>,
      winnerSeat: null,
      scores: seats.map(() => 0),
      version: 1,
    };
  }

  private rollDie(): number {
    return 1 + Math.floor(Math.random() * 6);
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'Game is not in progress.' };
    if (action.seat !== state.currentSeat) return { ok: false, error: 'It is not your turn.' };
    const board = state.board as unknown as LudoBoard;
    if (action.type === 'roll') {
      if (board.hasRolled) return { ok: false, error: 'You already rolled — move a token.' };
      return { ok: true };
    }
    if (action.type === 'move') {
      if (!board.hasRolled || board.die == null) return { ok: false, error: 'Roll the die first.' };
      const tokenIdx = Number((action.payload as { token?: unknown }).token);
      if (!Number.isInteger(tokenIdx) || tokenIdx < 0 || tokenIdx >= TOKENS_PER_SEAT) {
        return { ok: false, error: 'Choose a token.' };
      }
      if (!this.canMoveToken(board, action.seat, tokenIdx, board.die)) {
        return { ok: false, error: 'That token cannot move.' };
      }
      return { ok: true };
    }
    if (action.type === 'pass') {
      // Allowed only after a roll that leaves no legal move.
      if (!board.hasRolled) return { ok: false, error: 'Roll the die first.' };
      if (this.hasLegalMove(board, action.seat)) return { ok: false, error: 'You have a legal move.' };
      return { ok: true };
    }
    return { ok: false, error: 'Unknown action.' };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    const next = this.clone(state);
    const board = next.board as unknown as LudoBoard;

    if (action.type === 'roll') {
      const die = this.rollDie();
      board.die = die;
      board.hasRolled = true;
      board.sixStreak = die === 6 ? board.sixStreak + 1 : 0;
      next.version += 1;
      // Three sixes in a row forfeits the turn.
      if (board.sixStreak >= 3) {
        this.endTurn(next, action.seat, false);
        return next;
      }
      // Auto-pass when no token can use the roll.
      if (!this.hasLegalMove(board, action.seat)) {
        // Bots/clients issue pass; but if nothing movable, advance for smoothness.
        // (Human clients will tap pass; we leave state pending their pass.)
      }
      return next;
    }

    if (action.type === 'move') {
      const tokenIdx = Number((action.payload as { token: number }).token);
      this.moveToken(board, action.seat, tokenIdx, board.die!);
      next.version += 1;
      const extraTurn = board.die === 6;
      board.die = null;
      board.hasRolled = false;
      if (this.allFinished(board, action.seat)) {
        this.finish(next, action.seat);
        return next;
      }
      this.endTurn(next, action.seat, extraTurn);
      return next;
    }

    if (action.type === 'pass') {
      board.die = null;
      board.hasRolled = false;
      next.version += 1;
      this.endTurn(next, action.seat, false);
      return next;
    }
    return next;
  }

  private canMoveToken(board: LudoBoard, seat: number, token: number, die: number): boolean {
    const t = board.tokens[seat][token];
    if (t.progress === FINISH) return false;
    if (t.progress === -1) {
      return die === 6; // need a six to leave base
    }
    const target = t.progress + die;
    return target <= FINISH; // cannot overshoot the centre
  }

  private hasLegalMove(board: LudoBoard, seat: number): boolean {
    const die = board.die ?? 0;
    return board.tokens[seat].some((_, idx) => this.canMoveToken(board, seat, idx, die));
  }

  /** Absolute shared-track cell for a seat's relative progress (-1/FINISH → null). */
  private absoluteCell(board: LudoBoard, seat: number, progress: number): number | null {
    if (progress < 0 || progress > HOME_ENTRY) return null;
    return (board.startOffset[seat] + progress) % TRACK;
  }

  private moveToken(board: LudoBoard, seat: number, token: number, die: number): void {
    const t = board.tokens[seat][token];
    if (t.progress === -1) {
      t.progress = 0; // leave base on a six
      this.captureAt(board, seat, 0);
      return;
    }
    const target = t.progress + die;
    t.progress = Math.min(target, FINISH);
    if (t.progress <= HOME_ENTRY) {
      this.captureAt(board, seat, t.progress);
    }
  }

  private captureAt(board: LudoBoard, seat: number, progress: number): void {
    const cell = this.absoluteCell(board, seat, progress);
    if (cell == null) return;
    // Safe squares (stars) — skip captures on a simple set of safe cells.
    const safe = [0, 8, 13, 21, 26, 34, 39, 47];
    if (safe.includes(cell)) return;
    for (let other = 0; other < board.tokens.length; other++) {
      if (other === seat) continue;
      for (const tok of board.tokens[other]) {
        if (tok.progress < 0 || tok.progress > HOME_ENTRY) continue;
        const otherCell = this.absoluteCell(board, other, tok.progress);
        if (otherCell === cell) {
          tok.progress = -1; // sent home
          board.captures[seat] += 1;
        }
      }
    }
  }

  private allFinished(board: LudoBoard, seat: number): boolean {
    return board.tokens[seat].every((t) => t.progress === FINISH);
  }

  private endTurn(state: GameState, seat: number, extraTurn: boolean): void {
    const board = state.board as unknown as LudoBoard;
    if (extraTurn) {
      board.sixStreak = 0; // the extra turn is the bonus; reset streak counter
      // Same seat rolls again: reset roll state for the bonus turn.
      board.die = null;
      board.hasRolled = false;
      state.turnStartedAt = new Date().toISOString();
      return;
    }
    board.sixStreak = 0;
    board.die = null;
    board.hasRolled = false;
    state.currentSeat = (seat + 1) % state.seats.length;
    state.turn += 1;
    state.turnStartedAt = new Date().toISOString();
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as LudoBoard;
    const think = this.thinkMs(difficulty);
    if (!board.hasRolled) {
      return { action: { seat, type: 'roll', payload: {} }, delayMs: think };
    }
    const die = board.die ?? 0;
    const legal = board.tokens[seat]
      .map((_, idx) => idx)
      .filter((idx) => this.canMoveToken(board, seat, idx, die));
    if (legal.length === 0) {
      return { action: { seat, type: 'pass', payload: {} }, delayMs: think };
    }
    const mistakeChance = difficulty === 'easy' ? 0.4 : difficulty === 'medium' ? 0.2 : difficulty === 'hard' ? 0.08 : 0.03;
    let token: number;
    if (Math.random() < mistakeChance) {
      token = legal[Math.floor(Math.random() * legal.length)];
    } else {
      token = this.bestToken(board, seat, legal, die, difficulty);
    }
    return { action: { seat, type: 'move', payload: { token } }, delayMs: think };
  }

  private bestToken(
    board: LudoBoard,
    seat: number,
    legal: number[],
    die: number,
    difficulty: SeatInfo['botDifficulty'],
  ): number {
    let best = legal[0];
    let bestScore = -Infinity;
    for (const idx of legal) {
      const t = board.tokens[seat][idx];
      let score = 0;
      // Leaving base is valuable.
      if (t.progress === -1) score += 30;
      const target = t.progress === -1 ? 0 : Math.min(t.progress + die, FINISH);
      score += target; // forward progress
      if (target === FINISH) score += 100;
      // Captures.
      const cell = this.absoluteCell(board, seat, target);
      if (cell != null) {
        for (let other = 0; other < board.tokens.length; other++) {
          if (other === seat) continue;
          for (const ot of board.tokens[other]) {
            if (ot.progress >= 0 && ot.progress <= HOME_ENTRY) {
              if (this.absoluteCell(board, other, ot.progress) === cell) score += 60;
            }
          }
        }
      }
      // Hard/expert avoid landing on vulnerable squares when an alternative exists.
      if (difficulty === 'hard' || difficulty === 'expert') {
        const threatened = this.isThreatened(board, seat, target);
        if (threatened) score -= 40;
      }
      if (score > bestScore) {
        bestScore = score;
        best = idx;
      }
    }
    return best;
  }

  private isThreatened(board: LudoBoard, seat: number, progress: number): boolean {
    const cell = this.absoluteCell(board, seat, progress);
    if (cell == null) return false;
    for (let other = 0; other < board.tokens.length; other++) {
      if (other === seat) continue;
      for (const ot of board.tokens[other]) {
        if (ot.progress < 0 || ot.progress > HOME_ENTRY) continue;
        const oc = this.absoluteCell(board, other, ot.progress);
        if (oc == null) continue;
        const dist = (cell - oc + TRACK) % TRACK;
        if (dist >= 1 && dist <= 6) return true; // an opponent die roll could hit
      }
    }
    return false;
  }

  protected redactHidden(state: GameState, seat: number): GameState {
    const board = state.board as unknown as LudoBoard;
    // Ludo board state is public (all tokens are on a shared board); only the
    // internal markers are stripped by reconstructing a plain object.
    const safe: Record<string, unknown> = {
      tokens: board.tokens.map((arr) => arr.map((t) => ({ progress: t.progress }))),
      die: board.die,
      hasRolled: board.hasRolled,
      captures: board.captures,
      startOffset: board.startOffset,
      mySeat: seat,
    };
    return { ...state, board: safe };
  }

  private finish(state: GameState, winnerSeat: number): void {
    state.phase = 'completed';
    state.winnerSeat = winnerSeat;
    state.currentSeat = -1;
    const board = state.board as unknown as LudoBoard;
    state.scores = state.scores.map((_, i) => board.captures[i] * 5 + board.tokens[i].filter((t) => t.progress === FINISH).length * 25);
  }

  private thinkMs(difficulty: SeatInfo['botDifficulty']): number {
    const base = difficulty === 'easy' ? 2400 : difficulty === 'medium' ? 1800 : difficulty === 'hard' ? 1200 : 800;
    return base + Math.floor(Math.random() * 1500);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as LudoBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...board,
        tokens: board.tokens.map((arr) => arr.map((t) => ({ progress: t.progress }))),
        captures: [...board.captures],
        startOffset: [...board.startOffset],
      } as unknown as Record<string, unknown>,
    };
  }
}
