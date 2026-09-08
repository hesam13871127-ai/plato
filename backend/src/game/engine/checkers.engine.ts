import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig } from './types';

type Piece = '' | 'r' | 'R' | 'b' | 'B'; // r/R = red (seat0), b/B = black (seat1); uppercase = king

interface CheckersBoard extends Record<string, unknown> {
  board: Piece[][];
  turnColor: 'r' | 'b';
  mustCaptureFrom: [number, number] | null;
}

@Injectable()
export class CheckersEngine extends BaseGameEngine {
  readonly slug = 'checkers';
  readonly minPlayers = 2;
  readonly maxPlayers = 2;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const board: Piece[][] = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => '' as Piece));
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 8; c++) if ((r + c) % 2 === 1) board[r][c] = 'b';
    }
    for (let r = 5; r < 8; r++) {
      for (let c = 0; c < 8; c++) if ((r + c) % 2 === 1) board[r][c] = 'r';
    }
    const b: CheckersBoard = { board, turnColor: 'r', mustCaptureFrom: null };
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
      board: b as unknown as Record<string, unknown>,
      winnerSeat: null,
      scores: [0, 0],
      version: 1,
    };
  }

  private isRed(p: Piece) { return p === 'r' || p === 'R'; }
  private isBlack(p: Piece) { return p === 'b' || p === 'B'; }
  private isKing(p: Piece) { return p === 'R' || p === 'B'; }
  private belongsTo(p: Piece, seat: number) { return seat === 0 ? this.isRed(p) : this.isBlack(p); }

  private capturesFrom(board: Piece[][], r: number, c: number): Array<{ to: [number, number]; cap: [number, number] }> {
    const p = board[r][c];
    if (!p) return [];
    const dirs: [number, number][] = [];
    if (p === 'r') dirs.push([-1, -1], [-1, 1]);
    else if (p === 'b') dirs.push([1, -1], [1, 1]);
    else dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]); // king
    const out: Array<{ to: [number, number]; cap: [number, number] }> = [];
    for (const [dr, dc] of dirs) {
      const mr = r + dr, mc = c + dc, tr = r + dr * 2, tc = c + dc * 2;
      if (tr < 0 || tr >= 8 || tc < 0 || tc >= 8) continue;
      const mid = board[mr][mc];
      if (!mid) continue;
      if (this.isRed(p) && this.isRed(mid)) continue;
      if (this.isBlack(p) && this.isBlack(mid)) continue;
      if (board[tr][tc] !== '') continue;
      out.push({ to: [tr, tc], cap: [mr, mc] });
    }
    return out;
  }

  private movesFrom(board: Piece[][], r: number, c: number): Array<[number, number]> {
    const p = board[r][c];
    if (!p) return [];
    const caps = this.capturesFrom(board, r, c);
    if (caps.length > 0) return caps.map((x) => x.to);
    const dirs: [number, number][] = [];
    if (p === 'r') dirs.push([-1, -1], [-1, 1]);
    else if (p === 'b') dirs.push([1, -1], [1, 1]);
    else dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
    const out: Array<[number, number]> = [];
    for (const [dr, dc] of dirs) {
      const tr = r + dr, tc = c + dc;
      if (tr < 0 || tr >= 8 || tc < 0 || tc >= 8) continue;
      if (board[tr][tc] === '') out.push([tr, tc]);
    }
    return out;
  }

  private anyCapture(board: Piece[][], seat: number): boolean {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (this.belongsTo(board[r][c], seat) && this.capturesFrom(board, r, c).length > 0) return true;
    return false;
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'Game is over.' };
    if (state.currentSeat !== action.seat) return { ok: false, error: 'Not your turn.' };
    if (action.type !== 'move') return { ok: false, error: 'Unknown action.' };
    const b = state.board as unknown as CheckersBoard;
    const from = action.payload['from'] as number[] | undefined;
    const to = action.payload['to'] as number[] | undefined;
    if (!from || !to || from.length !== 2 || to.length !== 2) return { ok: false, error: 'Pick a piece and a destination.' };
    const [fr, fc] = from, [tr, tc] = to;
    if (fr < 0 || fr >= 8 || fc < 0 || fc >= 8 || tr < 0 || tr >= 8 || tc < 0 || tc >= 8) return { ok: false, error: 'Out of board.' };
    const p = b.board[fr][fc];
    if (!p || !this.belongsTo(p, action.seat)) return { ok: false, error: 'That is not your piece.' };
    if (b.board[tr][tc] !== '') return { ok: false, error: 'Destination occupied.' };
    if (b.mustCaptureFrom) {
      if (b.mustCaptureFrom[0] !== fr || b.mustCaptureFrom[1] !== fc) return { ok: false, error: 'You must continue capturing with the same piece.' };
    }
    const mustCapture = this.anyCapture(b.board, action.seat);
    const caps = this.capturesFrom(b.board, fr, fc);
    const isCapture = caps.some((x) => x.to[0] === tr && x.to[1] === tc);
    if (mustCapture && !isCapture) return { ok: false, error: 'You must capture when possible.' };
    const moves = this.movesFrom(b.board, fr, fc);
    if (!moves.some(([r, c]) => r === tr && c === tc)) return { ok: false, error: 'Illegal move.' };
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    const b = state.board as unknown as CheckersBoard;
    const [fr, fc] = action.payload['from'] as number[];
    const [tr, tc] = action.payload['to'] as number[];
    const p = b.board[fr][fc];
    const caps = this.capturesFrom(b.board, fr, fc);
    const cap = caps.find((x) => x.to[0] === tr && x.to[1] === tc);
    b.board[tr][tc] = p;
    b.board[fr][fc] = '';
    if (cap) b.board[cap.cap[0]][cap.cap[1]] = '';
    // promotion
    if (p === 'r' && tr === 0) b.board[tr][tc] = 'R';
    if (p === 'b' && tr === 7) b.board[tr][tc] = 'B';
    // if capture and further captures available from landing square, must continue
    if (cap) {
      const further = this.capturesFrom(b.board, tr, tc);
      if (further.length > 0) {
        b.mustCaptureFrom = [tr, tc];
        state.version += 1;
        return state; // same player's turn continues
      }
    }
    b.mustCaptureFrom = null;
    // win check: opponent has no pieces or no moves
    const opp = state.currentSeat === 0 ? 1 : 0;
    let oppPieces = 0, oppMoves = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (this.belongsTo(b.board[r][c], opp)) { oppPieces++; oppMoves += this.movesFrom(b.board, r, c).length; }
    if (oppPieces === 0 || oppMoves === 0) {
      state.phase = 'completed';
      state.winnerSeat = state.currentSeat;
      state.winnerSeats = [state.currentSeat];
      state.scores = state.seats.map((_, i) => (i === state.currentSeat ? 1 : 0));
      state.currentSeat = -1;
      state.version += 1;
      return state;
    }
    b.turnColor = b.turnColor === 'r' ? 'b' : 'r';
    state.currentSeat = opp;
    state.turn += 1;
    state.turnStartedAt = new Date().toISOString();
    state.version += 1;
    return state;
  }

  chooseBotMove(state: GameState, seat: number): BotMove {
    if (state.phase !== 'in_progress' || state.currentSeat !== seat) return { action: { seat, type: '__noop__', payload: {} }, delayMs: 0 };
    const b = state.board as unknown as CheckersBoard;
    // collect all legal moves, prefer captures
    const moves: Array<{ from: [number, number]; to: [number, number] }> = [];
    const capMoves: typeof moves = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (this.belongsTo(b.board[r][c], seat)) {
      if (b.mustCaptureFrom && (b.mustCaptureFrom[0] !== r || b.mustCaptureFrom[1] !== c)) continue;
      for (const to of this.movesFrom(b.board, r, c)) {
        const isCap = this.capturesFrom(b.board, r, c).some((x) => x.to[0] === to[0] && x.to[1] === to[1]);
        const m = { from: [r, c] as [number, number], to: to as [number, number] };
        if (isCap) capMoves.push(m); else moves.push(m);
      }
    }
    const pool = capMoves.length > 0 ? capMoves : moves;
    if (pool.length === 0) return { action: { seat, type: '__noop__', payload: {} }, delayMs: 0 };
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return { action: { seat, type: 'move', payload: { from: pick.from, to: pick.to } }, delayMs: 700 + Math.floor(Math.random() * 600) };
  }
}
