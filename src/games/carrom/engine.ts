import type { GameConfig, GameEngine, RNG } from '../../core/types';
import { runToRest, type PhysBody, type PhysConf, type Pocket } from '../_physics/physics';

/* ------------------------------------------------------------------ */
/* Board geometry                                                      */
/* ------------------------------------------------------------------ */

export const CARROM_W = 6;
export const CARROM_H = 6;
export const COIN_R = 0.22;
export const STRIKER_R = 0.3;
export const POCKET_R = 0.46;
export const MAX_STRIKE_SPEED = 18;

export const CARROM_POCKETS: Pocket[] = [
  { x: 0, y: 0, r: POCKET_R },
  { x: CARROM_W, y: 0, r: POCKET_R },
  { x: 0, y: CARROM_H, r: POCKET_R },
  { x: CARROM_W, y: CARROM_H, r: POCKET_R },
];

/** baseline y per seat (striker must be placed here) */
export const BASELINE_Y = [0.95, CARROM_H - 0.95] as const;
export const BASELINE_X_MIN = 1.15;
export const BASELINE_X_MAX = CARROM_W - 1.15;

export function carromConf(): PhysConf {
  return {
    w: CARROM_W,
    h: CARROM_H,
    friction: 0.9975, // ≈ e^(-1.2/480): coins glide ~2.5 board lengths
    restitution: 0.93,
    wallRestitution: 0.8,
    stop: 0.05,
    maxSpeed: MAX_STRIKE_SPEED,
    pockets: CARROM_POCKETS,
  };
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type CoinKind = 'white' | 'black' | 'queen';

export interface Coin {
  id: string;
  kind: CoinKind;
  x: number;
  y: number;
  pocketed: boolean;
}

export interface CarromShot {
  strikerX: number;
  strikerY: number;
  angle: number;
  power: number;
}

export type CarromAction = { type: 'strike'; strikerX: number; angle: number; power: number };

export interface CarromState {
  coins: Coin[];
  turn: number; // seat 0 = white, seat 1 = black
  phase: 'aim' | 'over';
  winner: number | null;
  queenPendingBy: number | null;
  /** queen has left the board (properly covered) */
  queenOff: boolean;
  shotId: number;
  lastShot: (CarromShot & { snapshot: Coin[] }) | null;
  lastEvent: {
    player: number;
    pocketed: CoinKind[];
    foul: boolean;
    reason?: 'striker' | 'own-last-before-queen';
    queenReturned?: boolean;
    queenCovered?: boolean;
    extraTurn: boolean;
  } | null;
}

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

function setupCoins(): Coin[] {
  const coins: Coin[] = [];
  const cx = CARROM_W / 2;
  const cy = CARROM_H / 2;
  coins.push({ id: 'queen', kind: 'queen', x: cx, y: cy, pocketed: false });
  // first ring of 6 alternating, second ring of 12 alternating
  const ring = (radius: number, count: number, offset: number, startWhite: boolean) => {
    for (let i = 0; i < count; i++) {
      const a = offset + (i / count) * Math.PI * 2;
      const white = (i % 2 === 0) === startWhite;
      coins.push({
        id: `${white ? 'w' : 'b'}-${radius.toFixed(2)}-${i}`,
        kind: white ? 'white' : 'black',
        x: cx + Math.cos(a) * radius,
        y: cy + Math.sin(a) * radius,
        pocketed: false,
      });
    }
  };
  ring(COIN_R * 2 + 0.002, 6, 0, true);
  ring(COIN_R * 4 + 0.006, 12, Math.PI / 12, false);
  return coins;
}

function bodiesOf(coins: Coin[], striker: CarromShot): PhysBody[] {
  const bodies: PhysBody[] = [
    { id: 'striker', x: striker.strikerX, y: striker.strikerY, vx: 0, vy: 0, r: STRIKER_R, m: 1, pocketed: false },
  ];
  for (const c of coins) {
    if (c.pocketed) continue;
    bodies.push({ id: c.id, x: c.x, y: c.y, vx: 0, vy: 0, r: COIN_R, m: 0.75, pocketed: false });
  }
  return bodies;
}

function isFree(coins: Coin[], striker: { x: number; y: number }, x: number, y: number, r: number): boolean {
  if (Math.hypot(striker.x - x, striker.y - y) < r + COIN_R + 0.02) return false;
  return coins.every((c) => c.pocketed || Math.hypot(c.x - x, c.y - y) >= r + COIN_R + 0.02);
}

function respawnCenter(coins: Coin[], kind: CoinKind): Coin[] {
  const next = coins.map((c) => ({ ...c }));
  const cx = CARROM_W / 2;
  const cy = CARROM_H / 2;
  let placed = false;
  for (let ring = 0; ring < 20 && !placed; ring++) {
    for (let a = 0; a < 12 && !placed; a++) {
      const ang = (a / 12) * Math.PI * 2;
      const x = cx + Math.cos(ang) * ring * 0.12;
      const y = cy + Math.sin(ang) * ring * 0.12;
      if (next.every((c) => c.pocketed || c.kind === kind || Math.hypot(c.x - x, c.y - y) >= COIN_R * 2.05)) {
        const coin = next.find((c) => c.kind === kind);
        if (coin) {
          coin.x = x;
          coin.y = y;
          coin.pocketed = false;
          placed = true;
        }
      }
    }
  }
  return next;
}

function myKind(seat: number): CoinKind {
  return seat === 0 ? 'white' : 'black';
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

export const carromEngine: GameEngine<CarromState, CarromAction> = {
  createInitialState(): CarromState {
    return {
      coins: setupCoins(),
      turn: 0,
      phase: 'aim',
      winner: null,
      queenPendingBy: null,
      queenOff: false,
      shotId: 0,
      lastShot: null,
      lastEvent: null,
    };
  },

  legalActions(state, playerId) {
    if (state.phase !== 'aim' || state.turn !== playerId) return [];
    return [{ type: 'strike', strikerX: CARROM_W / 2, angle: 0, power: 0.5 }];
  },

  validate(state, action, playerId) {
    return (
      action.type === 'strike' &&
      state.phase === 'aim' &&
      state.turn === playerId &&
      Number.isFinite(action.angle) &&
      action.power > 0 &&
      action.power <= 1 &&
      action.strikerX >= BASELINE_X_MIN - 0.001 &&
      action.strikerX <= BASELINE_X_MAX + 0.001
    );
  },

  applyAction(state, action, playerId, _rng) {
    if (!carromEngine.validate(state, action, playerId)) return state;

    const strikerY = BASELINE_Y[playerId]!;
    const snapshot = state.coins.map((c) => ({ ...c }));
    const bodies = bodiesOf(state.coins, { strikerX: action.strikerX, strikerY, angle: action.angle, power: action.power });
    const strikerBody = bodies[0]!;
    const speed = Math.max(2, action.power * MAX_STRIKE_SPEED);
    strikerBody.vx = Math.cos(action.angle) * speed;
    strikerBody.vy = Math.sin(action.angle) * speed;

    const result = runToRest(bodies, carromConf(), 'striker');

    let coins = state.coins.map((c) => {
      const body = bodies.find((b) => b.id === c.id);
      return body ? { ...c, x: body.x, y: body.y, pocketed: body.pocketed } : c;
    });

    const pottedIds = result.pocketed.filter((id) => id !== 'striker');
    const pottedKinds = pottedIds
      .map((id) => coins.find((c) => c.id === id))
      .filter((c): c is Coin => Boolean(c))
      .map((c) => c.kind);
    const strikerPotted = result.pocketed.includes('striker');
    const queenPotted = pottedKinds.includes('queen');

    const me = playerId;
    const opp = 1 - playerId;
    const mine = myKind(me);
    let queenPendingBy = state.queenPendingBy;
    let queenOff = state.queenOff;
    let foul = strikerPotted;
    let reason: 'striker' | 'own-last-before-queen' | undefined = strikerPotted ? 'striker' : undefined;
    let queenReturned = false;
    let queenCovered = false;

    // queen logic
    if (queenPotted && !strikerPotted) {
      queenPendingBy = me; // must cover on the next stroke
    } else if (queenPendingBy === me) {
      const pottedMine = pottedKinds.includes(mine);
      if (pottedMine && !strikerPotted) {
        queenPendingBy = null;
        queenOff = true;
        queenCovered = true;
      } else {
        // failed to cover → queen returns to the center
        coins = respawnCenter(coins, 'queen');
        queenPendingBy = null;
        queenReturned = true;
      }
    } else if (queenPendingBy === opp) {
      // opponent's pending continues (they cover on their own next stroke)
      queenPendingBy = opp;
    }

    // potting your last coin while the queen is still on the board returns it
    const myCoinsOnBoard = coins.filter((c) => c.kind === mine && !c.pocketed).length;
    const pottedMyCoins = pottedKinds.filter((k) => k === mine).length;
    const wasCoveringWin = queenCovered; // covering with the last coin is legal
    if (
      !strikerPotted &&
      !wasCoveringWin &&
      myCoinsOnBoard === 0 &&
      pottedMyCoins > 0 &&
      coins.some((c) => c.kind === 'queen' && !c.pocketed)
    ) {
      coins = respawnCenter(coins, mine);
      foul = true;
      reason = 'own-last-before-queen';
    }

    // win check: all of my coins potted AND the queen is off (or covered by me now)
    const myLeft = coins.filter((c) => c.kind === mine && !c.pocketed).length;
    const queenGone = coins.every((c) => c.kind !== 'queen' || c.pocketed);
    if (myLeft === 0 && (queenOff || queenGone)) {
      return {
        coins,
        turn: me,
        phase: 'over',
        winner: me,
        queenPendingBy,
        queenOff: true,
        shotId: state.shotId + 1,
        lastShot: { strikerX: action.strikerX, strikerY, angle: action.angle, power: action.power, snapshot },
        lastEvent: { player: me, pocketed: pottedKinds, foul, reason, queenReturned, queenCovered, extraTurn: false },
      };
    }

    // extra turn: potted at least one of my coins (or the queen, to attempt the cover)
    const extraTurn = !foul && (pottedMyCoins > 0 || (queenPotted && queenPendingBy === me));

    return {
      coins,
      turn: extraTurn ? me : opp,
      phase: 'aim',
      winner: null,
      queenPendingBy,
      queenOff,
      shotId: state.shotId + 1,
      lastShot: { strikerX: action.strikerX, strikerY, angle: action.angle, power: action.power, snapshot },
      lastEvent: { player: me, pocketed: pottedKinds, foul, reason, queenReturned, queenCovered, extraTurn },
    };
  },

  chooseBotMove(state, playerId, rng, difficulty) {
    if (state.phase !== 'aim' || state.turn !== playerId) return null;
    const mine = myKind(playerId);
    const targets = state.coins.filter((c) => !c.pocketed && (c.kind === mine || (state.queenPendingBy === playerId && c.kind === 'queen')));
    const queenOnBoard = state.coins.some((c) => c.kind === 'queen' && !c.pocketed);
    const myCoins = state.coins.filter((c) => c.kind === mine && !c.pocketed);
    // if only the queen is left for me to care about, aim at her
    const aimList = targets.length > 0 ? targets : queenOnBoard && myCoins.length === 0 ? state.coins.filter((c) => c.kind === 'queen' && !c.pocketed) : myCoins;

    const noise = difficulty === 'easy' ? 0.22 : difficulty === 'medium' ? 0.08 : 0.03;
    const baselineY = BASELINE_Y[playerId]!;
    const strikerX = CARROM_W / 2 + (rng.next() * 2 - 1) * (difficulty === 'hard' ? 0.8 : 1.6);

    if (aimList.length > 0) {
      let best: { angle: number; dist: number } | null = null;
      for (const coin of aimList) {
        for (const p of CARROM_POCKETS) {
          const pdx = p.x - coin.x;
          const pdy = p.y - coin.y;
          const pd = Math.hypot(pdx, pdy);
          const ux = pdx / pd;
          const uy = pdy / pd;
          const ghostX = coin.x - ux * (STRIKER_R + COIN_R);
          const ghostY = coin.y - uy * (STRIKER_R + COIN_R);
          const sdx = ghostX - strikerX;
          const sdy = ghostY - baselineY;
          const sd = Math.hypot(sdx, sdy);
          if (sd < 1e-3) continue;
          const dot = (sdx / sd) * ux + (sdy / sd) * uy;
          if (dot < 0.2) continue;
          const score = sd + pd / Math.max(dot, 0.3);
          if (!best || score < best.dist) best = { angle: Math.atan2(sdy, sdx), dist: score };
        }
      }
      if (best) {
        return {
          type: 'strike',
          strikerX,
          angle: best.angle + (rng.next() * 2 - 1) * noise,
          power: Math.min(1, 0.5 + best.dist / 12 + rng.next() * 0.1),
        };
      }
    }
    // random shot toward the center mass
    const cx = CARROM_W / 2 + (rng.next() - 0.5) * 2;
    const angle = Math.atan2(CARROM_H / 2 - baselineY, cx - strikerX) + (rng.next() * 2 - 1) * 0.3;
    return { type: 'strike', strikerX, angle, power: 0.55 + rng.next() * 0.25 };
  },

  currentPlayers(state) {
    return state.phase === 'over' ? [] : [state.turn];
  },

  isGameOver(state) {
    return state.phase === 'over';
  },

  winners(state) {
    return state.winner !== null ? [state.winner] : [];
  },
};
