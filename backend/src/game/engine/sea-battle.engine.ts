import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface Ship {
  id: number;
  size: number;
  cells: Array<[number, number]>;
  hits: number;
}

/** Per-seat private fleet + the public shot map the opponent has fired at it. */
interface Fleet {
  ships: Ship[];
  /** 10×10 shot results on THIS seat's ocean: 0 unknown, 1 miss, 2 hit, 3 sunk. */
  shots: number[][];
  ready: boolean;
}

interface SeaBoard extends Record<string, unknown> {
  size: number;
  fleets: Fleet[]; // SERVER-ONLY ship positions
  lastShot: { seat: number; r: number; c: number; result: 'miss' | 'hit' | 'sunk' } | null;
  /** Bot AI memory (server-only): hunt targets after a hit. */
  botTargets: Array<Array<[number, number]>>;
  phase: 'placing' | 'battle';
}

const SIZE = 10;
const FLEET = [5, 4, 3, 3, 2];

/**
 * Sea Battle (Battleship) for two players. Both players place five ships
 * (auto-placed by default, re-shuffle allowed), then alternate salvos; a hit
 * grants another shot. Sink the whole enemy fleet to win. Opponent fleets are
 * never sent to the client — only the shot map. Bots hunt in a parity
 * checkerboard and target around hits; difficulty tunes accuracy.
 */
@Injectable()
export class SeaBattleEngine extends BaseGameEngine {
  readonly slug = 'sea_battle';
  readonly minPlayers = 2;
  readonly maxPlayers = 2;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const board: SeaBoard = {
      size: SIZE,
      fleets: config.seats.map((s) => ({
        ships: this.randomFleet(),
        shots: Array.from({ length: SIZE }, () => Array<number>(SIZE).fill(0)),
        // Bots are always ready; humans confirm (or shuffle) their auto-layout.
        ready: s.isBot,
      })),
      lastShot: null,
      botTargets: config.seats.map(() => []),
      phase: 'placing',
    };
    const allReady = board.fleets.every((f) => f.ready);
    if (allReady) board.phase = 'battle';
    // During placement `currentSeat` points at the first seat still arranging
    // its fleet (so auto-play can take over a vanished player); both seats may
    // still act — see canSeatAct().
    return {
      phase: 'in_progress',
      turn: 0,
      currentSeat: allReady ? 0 : board.fleets.findIndex((f) => !f.ready),
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

  /** During placement both seats act; in battle only the shooter does. */
  canSeatAct(state: GameState, action: GameAction): boolean {
    const board = state.board as unknown as SeaBoard;
    if (board.phase === 'placing') return action.type === 'shuffle' || action.type === 'ready';
    return state.currentSeat === action.seat;
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'Game is not in progress.' };
    const board = state.board as unknown as SeaBoard;
    const fleet = board.fleets[action.seat];
    if (!fleet) return { ok: false, error: 'Not a seat.' };
    if (board.phase === 'placing') {
      if (action.type === 'shuffle') {
        if (fleet.ready) return { ok: false, error: 'Your fleet is already locked in.' };
        return { ok: true };
      }
      if (action.type === 'ready') {
        if (fleet.ready) return { ok: false, error: 'You are already ready.' };
        return { ok: true };
      }
      return { ok: false, error: 'Place your fleet first.' };
    }
    if (action.seat !== state.currentSeat) return { ok: false, error: 'It is not your turn.' };
    if (action.type !== 'fire') return { ok: false, error: 'Unknown action.' };
    const r = Number(action.payload.r);
    const c = Number(action.payload.c);
    if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r >= SIZE || c < 0 || c >= SIZE) {
      return { ok: false, error: 'Pick a square on the enemy ocean.' };
    }
    const target = board.fleets[(action.seat + 1) % 2];
    if (target.shots[r][c] !== 0) return { ok: false, error: 'You already fired there.' };
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    const next = this.clone(state);
    const board = next.board as unknown as SeaBoard;
    const seat = action.seat;

    if (action.type === 'shuffle') {
      board.fleets[seat].ships = this.randomFleet();
      next.version += 1;
      return next;
    }
    if (action.type === 'ready') {
      board.fleets[seat].ready = true;
      next.version += 1;
      if (board.fleets.every((f) => f.ready)) {
        board.phase = 'battle';
        next.currentSeat = Math.floor(Math.random() * 2);
      } else {
        next.currentSeat = board.fleets.findIndex((f) => !f.ready);
      }
      next.turnStartedAt = new Date().toISOString();
      return next;
    }

    // fire
    const r = Number(action.payload.r);
    const c = Number(action.payload.c);
    const opp = (seat + 1) % 2;
    const target = board.fleets[opp];
    const ship = target.ships.find((s) => s.cells.some(([sr, sc]) => sr === r && sc === c));
    let result: 'miss' | 'hit' | 'sunk' = 'miss';
    if (ship) {
      ship.hits += 1;
      result = ship.hits >= ship.size ? 'sunk' : 'hit';
      target.shots[r][c] = 2;
      if (result === 'sunk') for (const [sr, sc] of ship.cells) target.shots[sr][sc] = 3;
      next.scores[seat] += result === 'sunk' ? 10 : 3;
      next.seats[seat].score = next.scores[seat];
    } else {
      target.shots[r][c] = 1;
    }
    board.lastShot = { seat, r, c, result };
    next.version += 1;

    if (target.ships.every((s) => s.hits >= s.size)) {
      this.finish(next, seat);
      return next;
    }
    // A hit earns another shot; a miss passes the turn.
    if (result === 'miss') {
      next.currentSeat = opp;
      next.turn += 1;
    }
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as SeaBoard;
    if (board.phase === 'placing') {
      return { action: { seat, type: 'ready', payload: {} }, delayMs: 800 };
    }
    const opp = (seat + 1) % 2;
    const shots = board.fleets[opp].shots;
    const memory = board.botTargets[seat];
    const smart = difficulty === 'easy' ? 0.45 : difficulty === 'medium' ? 0.75 : difficulty === 'hard' ? 0.92 : 1.0;

    let pick: [number, number] | null = null;
    // Target mode: shoot around known hits (cells with value 2 not yet sunk).
    if (Math.random() < smart) {
      const candidates: Array<[number, number]> = [];
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          if (shots[r][c] !== 2) continue;
          // Prefer continuing a line of hits.
          const lines: Array<[number, number]> = [
            [0, 1], [1, 0],
          ];
          for (const [dr, dc] of lines) {
            const aligned = (shots[r + dr]?.[c + dc] === 2) || (shots[r - dr]?.[c - dc] === 2);
            const weight = aligned ? 3 : 1;
            for (const [er, ec] of [[r + dr, c + dc], [r - dr, c - dc]] as Array<[number, number]>) {
              if (er >= 0 && er < SIZE && ec >= 0 && ec < SIZE && shots[er][ec] === 0) {
                for (let w = 0; w < weight; w++) candidates.push([er, ec]);
              }
            }
          }
        }
      }
      if (candidates.length > 0) pick = candidates[Math.floor(Math.random() * candidates.length)];
    }
    if (!pick) {
      // Hunt mode: parity checkerboard (every ship ≥ 2 long touches it).
      const parity: Array<[number, number]> = [];
      const any: Array<[number, number]> = [];
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          if (shots[r][c] !== 0) continue;
          any.push([r, c]);
          if ((r + c) % 2 === 0) parity.push([r, c]);
        }
      }
      const pool = Math.random() < smart && parity.length > 0 ? parity : any;
      pick = pool[Math.floor(Math.random() * pool.length)];
    }
    memory.length = 0;
    return { action: { seat, type: 'fire', payload: { r: pick[0], c: pick[1] } }, delayMs: this.think(difficulty) };
  }

  // ── Placement ─────────────────────────────────────────────────────────────

  private randomFleet(): Ship[] {
    const grid = Array.from({ length: SIZE }, () => Array<boolean>(SIZE).fill(false));
    const ships: Ship[] = [];
    FLEET.forEach((size, id) => {
      for (let attempt = 0; attempt < 500; attempt++) {
        const horizontal = Math.random() < 0.5;
        const r = Math.floor(Math.random() * (horizontal ? SIZE : SIZE - size + 1));
        const c = Math.floor(Math.random() * (horizontal ? SIZE - size + 1 : SIZE));
        const cells: Array<[number, number]> = [];
        let ok = true;
        for (let k = 0; k < size; k++) {
          const cr = horizontal ? r : r + k;
          const cc = horizontal ? c + k : c;
          // Keep a one-cell gap around ships (classic rule; also reads better).
          for (let dr = -1; dr <= 1 && ok; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const nr = cr + dr;
              const nc = cc + dc;
              if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && grid[nr][nc]) {
                ok = false;
                break;
              }
            }
          }
          if (!ok) break;
          cells.push([cr, cc]);
        }
        if (!ok) continue;
        for (const [cr, cc] of cells) grid[cr][cc] = true;
        ships.push({ id, size, cells, hits: 0 });
        break;
      }
    });
    return ships;
  }

  // ── Views / lifecycle ─────────────────────────────────────────────────────

  protected redactHidden(state: GameState, seat: number): GameState {
    const board = state.board as unknown as SeaBoard;
    const safe: Record<string, unknown> = {
      size: board.size,
      phase: board.phase,
      lastShot: board.lastShot,
      ready: board.fleets.map((f) => f.ready),
      // Public per-seat info: shots taken on each ocean and how many ships remain.
      oceans: board.fleets.map((f, i) => ({
        seat: i,
        shots: f.shots,
        shipsLeft: f.ships.filter((s) => s.hits < s.size).length,
        sunk: f.ships.filter((s) => s.hits >= s.size).map((s) => ({ id: s.id, size: s.size, cells: s.cells })),
      })),
      // Private: only my own ship positions.
      myShips:
        seat >= 0 && board.fleets[seat]
          ? board.fleets[seat].ships.map((s) => ({ id: s.id, size: s.size, cells: s.cells, hits: s.hits }))
          : null,
      fleetSizes: FLEET,
    };
    return { ...state, board: safe };
  }

  private finish(state: GameState, winnerSeat: number): void {
    state.phase = 'completed';
    state.winnerSeat = winnerSeat;
    state.currentSeat = -1;
    state.scores = state.scores.map((s, i) => s + (i === winnerSeat ? 50 : 0));
  }

  private think(difficulty: SeatInfo['botDifficulty']): number {
    const base = difficulty === 'easy' ? 1500 : difficulty === 'medium' ? 1200 : difficulty === 'hard' ? 900 : 700;
    return base + Math.floor(Math.random() * 900);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as SeaBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...board,
        fleets: board.fleets.map((f) => ({
          ready: f.ready,
          shots: f.shots.map((row) => [...row]),
          ships: f.ships.map((s) => ({ ...s, cells: s.cells.map(([r, c]) => [r, c] as [number, number]) })),
        })),
        botTargets: board.botTargets.map((t) => [...t]),
      } as unknown as Record<string, unknown>,
    };
  }
}
