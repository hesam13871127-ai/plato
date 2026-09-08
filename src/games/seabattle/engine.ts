import type { GameConfig, GameEngine, RNG } from '../../core/types';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export const GRID = 10;
export const FLEET_SIZES = [5, 4, 3, 3, 2] as const;

export interface ShipSpec {
  size: number;
  x: number;
  y: number;
  horizontal: boolean;
}

export interface SeaShip extends ShipSpec {
  cells: number[];
  hits: number;
}

export interface SeaShot {
  x: number;
  y: number;
  hit: boolean;
}

export interface SeaState {
  playerCount: number; // always 2
  fleets: SeaShip[][];
  /** shots fired AT player p (public info) */
  shots: SeaShot[][];
  /** cells of sunk ships, announced publicly per player */
  sunkCells: number[][];
  placed: boolean[];
  turn: number;
  phase: 'place' | 'battle' | 'over';
  winner: number | null;
  lastEvent: { player: number; x: number; y: number; hit: boolean; sunkSize: number | null } | null;
}

export type SeaAction =
  | { type: 'fleet'; ships: ShipSpec[] }
  | { type: 'fire'; x: number; y: number };

/* ------------------------------------------------------------------ */
/* Fleet plumbing                                                      */
/* ------------------------------------------------------------------ */

export function shipCells(spec: ShipSpec): number[] {
  const cells: number[] = [];
  for (let i = 0; i < spec.size; i++) {
    const x = spec.x + (spec.horizontal ? i : 0);
    const y = spec.y + (spec.horizontal ? 0 : i);
    cells.push(y * GRID + x);
  }
  return cells;
}

export function validateFleet(specs: ShipSpec[]): boolean {
  const sizes: number[] = [...FLEET_SIZES];
  const used = new Set<number>();
  for (const s of specs) {
    if (!Number.isInteger(s.x) || !Number.isInteger(s.y)) return false;
    if (s.x < 0 || s.y < 0) return false;
    const endX = s.horizontal ? s.x + s.size - 1 : s.x;
    const endY = s.horizontal ? s.y : s.y + s.size - 1;
    if (endX >= GRID || endY >= GRID) return false;
    const si = sizes.indexOf(s.size);
    if (si < 0) return false;
    sizes.splice(si, 1);
    for (const c of shipCells(s)) {
      if (used.has(c)) return false;
      used.add(c);
    }
  }
  return sizes.length === 0;
}

export function randomFleet(rng: RNG): ShipSpec[] {
  for (let attempt = 0; attempt < 500; attempt++) {
    const specs: ShipSpec[] = [];
    let ok = true;
    const used = new Set<number>();
    for (const size of FLEET_SIZES) {
      let placed = false;
      for (let t = 0; t < 200; t++) {
        const horizontal = rng.next() < 0.5;
        const x = rng.int(horizontal ? GRID - size + 1 : GRID);
        const y = rng.int(horizontal ? GRID : GRID - size + 1);
        const spec: ShipSpec = { size, x, y, horizontal };
        const cells = shipCells(spec);
        if (cells.some((c) => used.has(c))) continue;
        cells.forEach((c) => used.add(c));
        specs.push(spec);
        placed = true;
        break;
      }
      if (!placed) {
        ok = false;
        break;
      }
    }
    if (ok && validateFleet(specs)) return specs;
  }
  throw new Error('randomFleet: failed to place a fleet');
}

function fleetOf(specs: ShipSpec[]): SeaShip[] {
  return specs.map((s) => ({ ...s, cells: shipCells(s), hits: 0 }));
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

export const seaEngine: GameEngine<SeaState, SeaAction> = {
  createInitialState(config) {
    void config;
    return {
      playerCount: 2,
      fleets: [[], []],
      shots: [[], []],
      sunkCells: [[], []],
      placed: [false, false],
      turn: 0,
      phase: 'place',
      winner: null,
      lastEvent: null,
    };
  },

  legalActions(state, playerId) {
    if (state.phase === 'place' && !state.placed[playerId]) {
      return [{ type: 'fleet' as const, ships: [] }]; // shape only; validate() checks the layout
    }
    if (state.phase === 'battle' && state.turn === playerId) {
      const shot = new Set(state.shots[1 - playerId]!.map((s) => s.y * GRID + s.x));
      const acts: SeaAction[] = [];
      for (let i = 0; i < GRID * GRID; i++) {
        if (!shot.has(i)) acts.push({ type: 'fire', x: i % GRID, y: Math.floor(i / GRID) });
      }
      return acts;
    }
    return [];
  },

  validate(state, action, playerId) {
    if (action.type === 'fleet') {
      return state.phase === 'place' && !state.placed[playerId] && validateFleet(action.ships);
    }
    if (action.type === 'fire') {
      if (state.phase !== 'battle' || state.turn !== playerId) return false;
      const { x, y } = action;
      if (x < 0 || y < 0 || x >= GRID || y >= GRID) return false;
      return !state.shots[1 - playerId]!.some((s) => s.x === x && s.y === y);
    }
    return false;
  },

  applyAction(state, action, playerId) {
    if (!seaEngine.validate(state, action, playerId)) return state;

    if (action.type === 'fleet') {
      const fleets = [...state.fleets];
      fleets[playerId] = fleetOf(action.ships);
      const placed = [...state.placed];
      placed[playerId] = true;
      const bothPlaced = placed[0]! && placed[1]!;
      return {
        ...state,
        fleets,
        placed,
        phase: bothPlaced ? 'battle' : 'place',
        turn: bothPlaced ? 0 : state.turn,
      };
    }

    // fire
    const target = 1 - playerId;
    const fleet = state.fleets[target]!;
    const cell = action.y * GRID + action.x;
    const ship = fleet.find((s) => s.cells.includes(cell));
    const hit = ship !== undefined;

    const fleets = [...state.fleets];
    fleets[target] = fleet.map((s) => (s === ship ? { ...s, hits: s.hits + 1 } : s));

    const shots = [...state.shots];
    shots[target] = [...shots[target]!, { x: action.x, y: action.y, hit }];

    let sunkSize: number | null = null;
    const sunkCells = [...state.sunkCells];
    if (ship && ship.hits + 1 >= ship.size) {
      sunkSize = ship.size;
      sunkCells[target] = [...sunkCells[target]!, ...ship.cells];
    }

    const allSunk = fleets[target]!.every((s) => s.hits >= s.size);
    return {
      ...state,
      fleets,
      shots,
      sunkCells,
      turn: allSunk ? state.turn : hit ? playerId : target,
      phase: allSunk ? 'over' : 'battle',
      winner: allSunk ? playerId : null,
      lastEvent: { player: playerId, x: action.x, y: action.y, hit, sunkSize },
    };
  },

  chooseBotMove(state, playerId, rng) {
    if (state.phase === 'place' && !state.placed[playerId]) {
      return { type: 'fleet', ships: randomFleet(rng) };
    }
    if (state.phase !== 'battle' || state.turn !== playerId) return null;

    const opp = 1 - playerId;
    const shotAt = new Set(state.shots[opp]!.map((s) => s.y * GRID + s.x));
    const hits = state.shots[opp]!.filter((s) => s.hit).map((s) => s.y * GRID + s.x);
    const sunk = new Set(state.sunkCells[opp]!);
    const liveHits = hits.filter((c) => !sunk.has(c));

    // target mode: continue around unresolved hits
    if (liveHits.length > 0) {
      const tried = new Set<number>();
      for (const c of liveHits) {
        // if two hits line up, extend the line first
        for (const d of [1, GRID, -1, -GRID]) {
          const partner = c + d;
          if (liveHits.includes(partner)) {
            for (const end of [c - d, partner + d]) {
              if (end < 0 || end >= GRID * GRID) continue;
              if (Math.abs((end % GRID) - (c % GRID)) > 1 && (d === 1 || d === -1)) continue;
              if (!shotAt.has(end) && !tried.has(end)) tried.add(end);
            }
          }
        }
        for (const d of [1, GRID, -1, -GRID]) {
          const n = c + d;
          if (n < 0 || n >= GRID * GRID) continue;
          if ((d === 1 || d === -1) && Math.abs((n % GRID) - (c % GRID)) !== 1) continue;
          if (!shotAt.has(n) && !tried.has(n)) tried.add(n);
        }
      }
      const candidates = [...tried];
      if (candidates.length > 0) return { type: 'fire', x: candidates[0]! % GRID, y: Math.floor(candidates[0]! / GRID) };
    }

    // hunt mode: random unshot cell, parity pattern preferred
    const open: number[] = [];
    const parity: number[] = [];
    for (let i = 0; i < GRID * GRID; i++) {
      if (shotAt.has(i)) continue;
      open.push(i);
      if (((i % GRID) + Math.floor(i / GRID)) % 2 === 0) parity.push(i);
    }
    if (open.length === 0) return null;
    const pool = parity.length > 0 ? parity : open;
    const pick = pool[rng.int(pool.length)]!;
    return { type: 'fire', x: pick % GRID, y: Math.floor(pick / GRID) };
  },

  currentPlayers(state) {
    if (state.phase === 'place') {
      const waiting = [0, 1].filter((p) => !state.placed[p]);
      return waiting;
    }
    if (state.phase === 'battle') return [state.turn];
    return [];
  },

  isGameOver(state) {
    return state.phase === 'over';
  },

  winners(state) {
    return state.phase === 'over' && state.winner !== null ? [state.winner] : [];
  },
};
