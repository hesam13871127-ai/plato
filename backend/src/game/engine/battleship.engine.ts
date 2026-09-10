import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface Ship {
  name: string;
  size: number;
  x: number;
  y: number;
  horizontal: boolean;
  hits: boolean[];
}

interface BattleshipBoard extends Record<string, unknown> {
  /** 'place' (deploy your fleet) or 'battle' (trade salvos). */
  phase: 'place' | 'battle';
  /** One fleet per seat — only your own survives redaction. */
  fleets: Ship[][];
  /** Cells each seat has fired at. */
  shots: Array<Array<[number, number]>>;
  /** Each seat's salvos with their results — public, feeds the HUDs. */
  salvos: Array<Array<{ x: number; y: number; hit: boolean }>>;
  lastShot: { seat: number; x: number; y: number; hit: boolean; sunk: string | null } | null;
  /** Ship names each seat has lost (public knowledge). */
  sunk: string[][];
  /** How many intact enemy cells remain (per seat, for the HUD). */
  enemyRemaining: number[];
  log: string[];
}

const GRID = 10;

/** The classic roster: five ships, seventeen cells. */
export const BATTLESHIP_FLEET: Array<{ name: string; size: number }> = [
  { name: 'Carrier', size: 5 },
  { name: 'Battleship', size: 4 },
  { name: 'Cruiser', size: 3 },
  { name: 'Submarine', size: 3 },
  { name: 'Destroyer', size: 2 },
];

function shipCells(ship: Ship): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  for (let i = 0; i < ship.size; i++) {
    cells.push(ship.horizontal ? [ship.x + i, ship.y] : [ship.x, ship.y + i]);
  }
  return cells;
}

function fleetCells(fleet: Ship[]): Array<[number, number]> {
  return fleet.flatMap(shipCells);
}

function fleetIsLegal(fleet: Ship[]): boolean {
  if (fleet.length !== BATTLESHIP_FLEET.length) return false;
  const byName = new Map(fleet.map((s) => [s.name, s]));
  for (const spec of BATTLESHIP_FLEET) {
    const ship = byName.get(spec.name);
    if (!ship || ship.size !== spec.size || ship.hits.length !== spec.size) return false;
  }
  return placementOk(fleet);
}

/** Bounds + overlap check for partial fleets (used while placing). */
function placementOk(fleet: Ship[]): boolean {
  for (const ship of fleet) {
    if (!Number.isInteger(ship.x) || !Number.isInteger(ship.y)) return false;
    if (ship.horizontal) {
      if (ship.x < 0 || ship.x + ship.size > GRID || ship.y < 0 || ship.y >= GRID) return false;
    } else {
      if (ship.y < 0 || ship.y + ship.size > GRID || ship.x < 0 || ship.x >= GRID) return false;
    }
  }
  const cells = fleetCells(fleet);
  const keys = new Set(cells.map(([x, y]) => `${x},${y}`));
  return keys.size === cells.length;
}

/** Random legal fleet — used by 'deploy' {random} and the bots. */
export function randomFleet(): Ship[] {
  for (let attempt = 0; attempt < 200; attempt++) {
    const fleet: Ship[] = [];
    for (const spec of BATTLESHIP_FLEET) {
      let placed = false;
      for (let tries = 0; tries < 60 && !placed; tries++) {
        const horizontal = Math.random() < 0.5;
        const x = Math.floor(Math.random() * (horizontal ? GRID - spec.size + 1 : GRID));
        const y = Math.floor(Math.random() * (horizontal ? GRID : GRID - spec.size + 1));
        const ship: Ship = { name: spec.name, size: spec.size, x, y, horizontal, hits: new Array<boolean>(spec.size).fill(false) };
        const candidate = [...fleet, ship];
        if (placementOk(candidate)) {
          fleet.push(ship);
          placed = true;
        }
      }
      if (!placed) break;
    }
    if (fleet.length === BATTLESHIP_FLEET.length && fleetIsLegal(fleet)) return fleet;
  }
  // Deterministic fallback: five ships in tidy rows.
  return BATTLESHIP_FLEET.map((spec, i) => ({
    name: spec.name,
    size: spec.size,
    x: 0,
    y: i * 2,
    horizontal: true,
    hits: new Array<boolean>(spec.size).fill(false),
  }));
}

/**
 * Battleship for two players, wave-6 build.
 *
 * The classic duel. Deploy five ships — carrier down to destroyer — on your
 * ten-by-ten grid, then trade salvos in turns: call a cell, hear hit or
 * miss, and learn a ship's name only when she goes down. First admiral to
 * sink all seventeen enemy cells wins. Your own fleet is private (the
 * opponent's view is redacted); everything else is open water.
 *
 * Bots deploy randomly and fire smarter with difficulty — easy sprays
 * blind, hard hunts in parity lanes and finishes off wounded ships.
 */
@Injectable()
export class BattleshipEngine extends BaseGameEngine {
  readonly slug = 'battleship';
  readonly minPlayers = 2;
  readonly maxPlayers = 2;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const board: BattleshipBoard = {
      phase: 'place',
      fleets: config.seats.map(() => []),
      shots: config.seats.map(() => []),
      salvos: config.seats.map(() => []),
      lastShot: null,
      sunk: config.seats.map(() => []),
      enemyRemaining: config.seats.map(() => BATTLESHIP_FLEET.reduce((a, s) => a + s.size, 0)),
      log: ['Deploy your fleets, admirals.'],
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
    if (state.phase !== 'in_progress') return { ok: false, error: 'The war is already over.' };
    if (action.seat !== state.currentSeat) return { ok: false, error: 'It is not your turn.' };
    const board = state.board as unknown as BattleshipBoard;
    if (board.phase === 'place') {
      if (action.type !== 'deploy') return { ok: false, error: 'Deploy your fleet.' };
      if (action.payload.random === true) return { ok: true };
      const fleet = action.payload.fleet;
      if (!Array.isArray(fleet)) return { ok: false, error: 'Fleet payload missing.' };
      const ships: Ship[] = fleet.map((s: { name?: unknown; size?: unknown; x?: unknown; y?: unknown; horizontal?: unknown }) => ({
        name: String(s.name),
        size: Number(s.size),
        x: Number(s.x),
        y: Number(s.y),
        horizontal: Boolean(s.horizontal),
        hits: new Array<boolean>(Number(s.size)).fill(false),
      }));
      if (!fleetIsLegal(ships)) return { ok: false, error: 'Ships must stay in bounds and not overlap.' };
      return { ok: true };
    }
    if (action.type !== 'fire') return { ok: false, error: 'Fire at a cell.' };
    const x = Number(action.payload.x);
    const y = Number(action.payload.y);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= GRID || y < 0 || y >= GRID) {
      return { ok: false, error: 'Aim inside the grid.' };
    }
    if (board.shots[action.seat].some(([sx, sy]) => sx === x && sy === y)) {
      return { ok: false, error: 'You already fired there.' };
    }
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid action.');
    const next = this.clone(state);
    const board = next.board as unknown as BattleshipBoard;
    const seat = action.seat;
    next.version += 1;

    if (action.type === 'deploy') {
      const fleet =
        action.payload.random === true ? randomFleet() : this.parseFleet(action.payload.fleet);
      board.fleets[seat] = fleet;
      board.log.push(`Seat ${seat + 1} deploys a fleet of ${fleet.length} ships.`);
      if (seat < next.seats.length - 1) {
        next.currentSeat = seat + 1;
      } else {
        board.phase = 'battle';
        next.currentSeat = 0; // the first admiral opens fire
        board.log.push('Fleets are in the water — open fire!');
      }
      next.turnStartedAt = new Date().toISOString();
      return next;
    }

    // Fire.
    const x = Number(action.payload.x);
    const y = Number(action.payload.y);
    const enemy = board.fleets[1 - seat];
    board.shots[seat].push([x, y]);
    board.salvos[seat].push({ x, y, hit: false }); // patched below with the result
    let hit = false;
    let sunkName: string | null = null;
    for (const ship of enemy) {
      const cells = shipCells(ship);
      const idx = cells.findIndex(([cx, cy]) => cx === x && cy === y);
      if (idx >= 0) {
        hit = true;
        ship.hits[idx] = true;
        if (ship.hits.every(Boolean)) {
          sunkName = ship.name;
          board.sunk[1 - seat].push(ship.name);
        }
        break;
      }
    }
    board.salvos[seat][board.salvos[seat].length - 1].hit = hit;
    board.lastShot = { seat, x, y, hit, sunk: sunkName };
    board.enemyRemaining[seat] = fleetCells(enemy).length - board.shots[seat].filter(([sx, sy]) => enemy.some((s) => shipCells(s).some(([cx, cy]) => cx === sx && cy === sy))).length;
    board.log.push(
      `Seat ${seat + 1} fires at ${String.fromCharCode(65 + x)}${y + 1} — ${hit ? (sunkName ? `sunk the ${sunkName}!` : 'hit!') : 'splash.'}`,
    );

    if (enemy.every((s) => s.hits.every(Boolean))) {
      next.phase = 'completed';
      next.winnerSeat = seat;
      next.currentSeat = -1;
      next.scores = seat === 0 ? [1, 0] : [0, 1];
      next.seats = next.seats.map((s, i) => ({ ...s, score: next.scores[i] }));
      board.log.push(`Seat ${seat + 1} rules the waves — fleet destroyed!`);
      return next;
    }
    next.currentSeat = 1 - seat;
    next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as BattleshipBoard;
    if (board.phase === 'place') {
      const fleet = randomFleet().map((s) => ({ name: s.name, size: s.size, x: s.x, y: s.y, horizontal: s.horizontal }));
      return {
        action: { seat, type: 'deploy', payload: { fleet } },
        delayMs: this.think(difficulty),
      };
    }
    const target = this.pickTarget(board, seat, difficulty);
    return {
      action: { seat, type: 'fire', payload: { x: target[0], y: target[1] } },
      delayMs: this.think(difficulty, 200),
    };
  }

  protected redactHidden(state: GameState, seat: number): GameState {
    const view = this.clone(state);
    const board = view.board as unknown as BattleshipBoard;
    // Your own fleet stays; the enemy's — and everything for a spectator —
    // is replaced by its public shadow (shots, sinkings and the log).
    board.fleets = board.fleets.map((fleet, i) => (i === seat ? fleet : []));
    return view;
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private parseFleet(raw: unknown): Ship[] {
    const fleet = raw as Array<{ name: string; size: number; x: number; y: number; horizontal: boolean }>;
    return fleet.map((s) => ({
      name: String(s.name),
      size: Number(s.size),
      x: Number(s.x),
      y: Number(s.y),
      horizontal: Boolean(s.horizontal),
      hits: new Array<boolean>(Number(s.size)).fill(false),
    }));
  }

  /** Hunt/target fire selection with per-difficulty wits. */
  private pickTarget(
    board: BattleshipBoard,
    seat: number,
    difficulty: SeatInfo['botDifficulty'],
  ): [number, number] {
    const shots = new Set(board.shots[seat].map(([x, y]) => `${x},${y}`));
    const myHits = board.shots[seat].filter(([x, y]) => this.cellIsHit(board, 1 - seat, x, y));
    const inBounds = (x: number, y: number) => x >= 0 && x < GRID && y >= 0 && y < GRID;
    const open = (x: number, y: number) => inBounds(x, y) && !shots.has(`${x},${y}`);

    const smart = difficulty === 'hard' || difficulty === 'expert';
    // Target mode: fire around unresolved hits.
    if (smart && myHits.length > 0) {
      const candidates: Array<[number, number]> = [];
      for (const [hx, hy] of myHits) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          if (open(hx + dx, hy + dy)) candidates.push([hx + dx, hy + dy]);
        }
      }
      if (candidates.length > 0) {
        return candidates[Math.floor(Math.random() * candidates.length)];
      }
    }

    // Parity lanes: a ship of size ≥2 always crosses a checkerboard lane.
    const pool: Array<[number, number]> = [];
    for (let x = 0; x < GRID; x++) {
      for (let y = 0; y < GRID; y++) {
        if (!open(x, y)) continue;
        if (smart && (x + y) % 2 !== 0) continue;
        pool.push([x, y]);
      }
    }
    if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)];
    // Everything's shot (should not happen) — first open cell anyway.
    for (let x = 0; x < GRID; x++) {
      for (let y = 0; y < GRID; y++) {
        if (open(x, y)) return [x, y];
      }
    }
    return [0, 0];
  }

  private cellIsHit(board: BattleshipBoard, defenderSeat: number, x: number, y: number): boolean {
    for (const ship of board.fleets[defenderSeat]) {
      const cells = shipCells(ship);
      const idx = cells.findIndex(([cx, cy]) => cx === x && cy === y);
      if (idx >= 0) return ship.hits[idx];
    }
    return false;
  }

  private think(difficulty: SeatInfo['botDifficulty'], extra = 0): number {
    const base = difficulty === 'easy' ? 1200 : difficulty === 'medium' ? 900 : difficulty === 'hard' ? 700 : 550;
    return base + extra + Math.floor(Math.random() * 600);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as BattleshipBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...(board as Record<string, unknown>),
        fleets: board.fleets.map((fleet) => fleet.map((s) => ({ ...s, hits: [...s.hits] }))),
        shots: board.shots.map((shot) => shot.map(([x, y]) => [x, y] as [number, number])),
        salvos: board.salvos.map((list) => list.map((sv) => ({ ...sv }))),
        sunk: board.sunk.map((list) => [...list]),
        enemyRemaining: [...board.enemyRemaining],
        log: [...board.log],
        lastShot: board.lastShot ? { ...board.lastShot } : null,
      } as unknown as Record<string, unknown>,
    };
  }
}
