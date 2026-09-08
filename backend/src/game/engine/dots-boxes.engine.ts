import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig } from './types';

interface DotsBoard extends Record<string, unknown> {
  size: number; // boxes per side (5 => 5x5 boxes, 6x6 dots)
  h: boolean[][]; // (size+1) x size  horizontal edges
  v: boolean[][]; // size x (size+1) vertical edges
  owners: (number | null)[][]; // size x size, box owner seat or null
  scores: number[];
}

@Injectable()
export class DotsBoxesEngine extends BaseGameEngine {
  readonly slug = 'dots_boxes';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const n = config.seats.length;
    const size = 5;
    const board: DotsBoard = {
      size,
      h: Array.from({ length: size + 1 }, () => Array.from({ length: size }, () => false)),
      v: Array.from({ length: size }, () => Array.from({ length: size + 1 }, () => false)),
      owners: Array.from({ length: size }, () => Array.from({ length: size }, () => null)),
      scores: Array.from({ length: n }, () => 0),
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
      scores: Array.from({ length: n }, () => 0),
      version: 1,
    };
  }

  private isBoxComplete(b: DotsBoard, r: number, c: number): boolean {
    return b.h[r][c] && b.h[r + 1][c] && b.v[r][c] && b.v[r][c + 1];
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'Game over.' };
    if (state.currentSeat !== action.seat) return { ok: false, error: 'Not your turn.' };
    if (action.type !== 'draw') return { ok: false, error: 'Unknown action.' };
    const b = state.board as unknown as DotsBoard;
    const kind = action.payload['kind'] as string | undefined; // 'h' or 'v'
    const r = action.payload['r'] as number | undefined;
    const c = action.payload['c'] as number | undefined;
    if (kind !== 'h' && kind !== 'v') return { ok: false, error: 'Pick an edge.' };
    if (r == null || c == null || !Number.isInteger(r) || !Number.isInteger(c)) return { ok: false, error: 'Invalid edge.' };
    if (kind === 'h') {
      if (r < 0 || r > b.size || c < 0 || c >= b.size) return { ok: false, error: 'Out of board.' };
      if (b.h[r][c]) return { ok: false, error: 'Edge already drawn.' };
    } else {
      if (r < 0 || r >= b.size || c < 0 || c > b.size) return { ok: false, error: 'Out of board.' };
      if (b.v[r][c]) return { ok: false, error: 'Edge already drawn.' };
    }
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid.');
    const b = state.board as unknown as DotsBoard;
    const kind = action.payload['kind'] as string;
    const r = action.payload['r'] as number;
    const c = action.payload['c'] as number;
    if (kind === 'h') b.h[r][c] = true;
    else b.v[r][c] = true;

    // check newly completed boxes (1 or 2 adjacent)
    let completed = 0;
    const candidates: Array<[number, number]> = [];
    if (kind === 'h') {
      if (r > 0) candidates.push([r - 1, c]);
      if (r < b.size) candidates.push([r, c]);
    } else {
      if (c > 0) candidates.push([r, c - 1]);
      if (c < b.size) candidates.push([r, c]);
    }
    for (const [br, bc] of candidates) {
      if (b.owners[br][bc] == null && this.isBoxComplete(b, br, bc)) {
        b.owners[br][bc] = action.seat;
        b.scores[action.seat] += 1;
        completed++;
      }
    }
    state.scores = [...b.scores];
    // check game over
    const totalBoxes = b.size * b.size;
    const claimed = b.owners.flat().filter((x) => x != null).length;
    if (claimed === totalBoxes) {
      state.phase = 'completed';
      const max = Math.max(...b.scores);
      const leaders = b.scores.map((s, i) => (s === max ? i : -1)).filter((i) => i >= 0);
      state.winnerSeat = leaders[0] ?? null;
      state.winnerSeats = leaders;
      state.currentSeat = -1;
      state.version += 1;
      return state;
    }
    // extra turn if completed at least one box
    if (completed === 0) {
      state.currentSeat = (state.currentSeat + 1) % state.seats.length;
      state.turn += 1;
      state.turnStartedAt = new Date().toISOString();
    }
    state.version += 1;
    return state;
  }

  chooseBotMove(state: GameState, seat: number): BotMove {
    if (state.phase !== 'in_progress' || state.currentSeat !== seat) return { action: { seat, type: '__noop__', payload: {} }, delayMs: 0 };
    const b = state.board as unknown as DotsBoard;
    const moves: Array<{ kind: string; r: number; c: number }> = [];
    for (let r = 0; r <= b.size; r++) for (let c = 0; c < b.size; c++) if (!b.h[r][c]) moves.push({ kind: 'h', r, c });
    for (let r = 0; r < b.size; r++) for (let c = 0; c <= b.size; c++) if (!b.v[r][c]) moves.push({ kind: 'v', r, c });
    // prefer moves that complete a box
    const completing: typeof moves = [];
    for (const m of moves) {
      // simulate
      const copy: DotsBoard = { size: b.size, h: b.h.map((row) => [...row]), v: b.v.map((row) => [...row]), owners: b.owners.map((row) => [...row]), scores: [...b.scores] };
      if (m.kind === 'h') copy.h[m.r][m.c] = true; else copy.v[m.r][m.c] = true;
      const cands: Array<[number, number]> = [];
      if (m.kind === 'h') { if (m.r > 0) cands.push([m.r - 1, m.c]); if (m.r < b.size) cands.push([m.r, m.c]); } else { if (m.c > 0) cands.push([m.r, m.c - 1]); if (m.c < b.size) cands.push([m.r, m.c]); }
      for (const [br, bc] of cands) if (copy.owners[br][bc] == null && this.isBoxComplete(copy, br, bc)) { completing.push(m); break; }
    }
    const pool = completing.length > 0 ? completing : moves;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return { action: { seat, type: 'draw', payload: pick }, delayMs: 700 + Math.floor(Math.random() * 600) };
  }
}
