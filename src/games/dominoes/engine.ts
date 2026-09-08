import type { GameConfig, GameEngine, RNG } from '../../core/types';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface DominoTile {
  id: number;
  a: number;
  b: number;
}

/** One tile on the chain, with oriented values (left = outer-left side). */
export interface ChainLink {
  tileId: number;
  left: number;
  right: number;
  double: boolean;
}

export type DominoAction =
  | { type: 'place'; tileId: number; end: 'left' | 'right' }
  | { type: 'draw' }
  | { type: 'pass' };

export interface DominoState {
  playerCount: number;
  hands: DominoTile[][];
  boneyard: DominoTile[];
  chain: ChainLink[];
  turn: number;
  /** consecutive passes (blocked-detection) */
  passes: number;
  /** opener must play the determined opening tile */
  firstMove: boolean;
  openerTileId: number;
  phase: 'play' | 'gameover';
  result: { winner: number | null; pips: number[]; points: number } | null;
  lastEvent: { kind: 'place' | 'draw' | 'pass'; player: number; tileId?: number } | null;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function tilePips(t: DominoTile): number {
  return t.a + t.b;
}

function dealCount(playerCount: number): number {
  return playerCount === 4 ? 6 : 7;
}

function nextPlayer(state: DominoState): number {
  return (state.turn + 1) % state.playerCount;
}

function pipsOfAll(state: DominoState): number[] {
  return state.hands.map((h) => h.reduce((sum, t) => sum + tilePips(t), 0));
}

function sameAction(x: DominoAction, y: DominoAction): boolean {
  return JSON.stringify(x) === JSON.stringify(y);
}

function endValues(chain: ChainLink[]): { left: number; right: number } {
  const first = chain[0] as ChainLink;
  const last = chain[chain.length - 1] as ChainLink;
  return { left: first.left, right: last.right };
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

export const dominoesEngine: GameEngine<DominoState, DominoAction> = {
  createInitialState(config, rng) {
    const playerCount = config.slots.length;
    const tiles: DominoTile[] = [];
    for (let a = 0; a <= 6; a++) {
      for (let b = a; b <= 6; b++) tiles.push({ id: a * 7 + b, a, b });
    }
    const shuffled = rng.shuffle(tiles);
    const per = dealCount(playerCount);
    const hands: DominoTile[][] = Array.from({ length: playerCount }, (_, i) => shuffled.slice(i * per, (i + 1) * per));
    const boneyard = shuffled.slice(playerCount * per);

    // Opener: holder of the highest double, else the heaviest tile.
    let opener = 0;
    let openerTile = hands[0]?.[0] as DominoTile;
    let bestRank = -1;
    hands.forEach((hand, pid) => {
      for (const t of hand) {
        const rank = t.a === t.b ? 1000 + t.a + t.b : t.a + t.b;
        if (rank > bestRank) {
          bestRank = rank;
          opener = pid;
          openerTile = t;
        }
      }
    });

    return {
      playerCount,
      hands,
      boneyard,
      chain: [],
      turn: opener,
      passes: 0,
      firstMove: true,
      openerTileId: openerTile.id,
      phase: 'play',
      result: null,
      lastEvent: null,
    };
  },

  legalActions(state, playerId) {
    if (state.phase !== 'play' || state.turn !== playerId) return [];
    const hand = state.hands[playerId] ?? [];
    if (state.firstMove) {
      return [{ type: 'place', tileId: state.openerTileId, end: 'right' }];
    }
    if (state.chain.length === 0) {
      return hand.map((t) => ({ type: 'place' as const, tileId: t.id, end: 'right' as const }));
    }
    const { left, right } = endValues(state.chain);
    const actions: DominoAction[] = [];
    for (const t of hand) {
      if (t.a === left || t.b === left) actions.push({ type: 'place', tileId: t.id, end: 'left' });
      if (t.a === right || t.b === right) actions.push({ type: 'place', tileId: t.id, end: 'right' });
    }
    if (actions.length > 0) return actions;
    if (state.boneyard.length > 0) return [{ type: 'draw' }];
    return [{ type: 'pass' }];
  },

  validate(state, action, playerId) {
    return dominoesEngine.legalActions(state, playerId).some((a) => sameAction(a, action));
  },

  applyAction(state, action, playerId, _rng: RNG) {
    if (!dominoesEngine.validate(state, action, playerId)) return state;
    const s: DominoState = {
      ...state,
      hands: state.hands.map((h) => [...h]),
      boneyard: [...state.boneyard],
      chain: [...state.chain],
    };

    if (action.type === 'draw') {
      const tile = s.boneyard.shift() as DominoTile;
      (s.hands[playerId] as DominoTile[]).push(tile);
      s.lastEvent = { kind: 'draw', player: playerId };
      return s;
    }

    if (action.type === 'pass') {
      s.passes += 1;
      s.lastEvent = { kind: 'pass', player: playerId };
      if (s.passes >= s.playerCount) {
        const pips = pipsOfAll(s);
        const min = Math.min(...pips);
        const lowest = pips.map((p, i) => (p === min ? i : -1)).filter((i) => i >= 0);
        const winner = lowest.length === 1 ? (lowest[0] as number) : null;
        s.phase = 'gameover';
        s.result = {
          winner,
          pips,
          points: winner !== null ? pips.reduce((sum, p, i) => (i === winner ? sum : sum + p), 0) : 0,
        };
        return s;
      }
      s.turn = nextPlayer(s);
      return s;
    }

    // place
    const hand = s.hands[playerId] as DominoTile[];
    const idx = hand.findIndex((t) => t.id === action.tileId);
    const tile = hand[idx] as DominoTile;
    hand.splice(idx, 1);
    const double = tile.a === tile.b;
    if (s.chain.length === 0) {
      s.chain.push({ tileId: tile.id, left: tile.a, right: tile.b, double });
    } else if (action.end === 'right') {
      const v = endValues(s.chain).right;
      const link: ChainLink =
        tile.a === v ? { tileId: tile.id, left: tile.a, right: tile.b, double } : { tileId: tile.id, left: tile.b, right: tile.a, double };
      s.chain.push(link);
    } else {
      const v = endValues(s.chain).left;
      const link: ChainLink =
        tile.b === v ? { tileId: tile.id, left: tile.a, right: tile.b, double } : { tileId: tile.id, left: tile.b, right: tile.a, double };
      s.chain.unshift(link);
    }
    s.firstMove = false;
    s.passes = 0;
    s.lastEvent = { kind: 'place', player: playerId, tileId: tile.id };

    if (hand.length === 0) {
      const pips = pipsOfAll(s);
      s.phase = 'gameover';
      s.result = { winner: playerId, pips, points: pips.reduce((sum, p, i) => (i === playerId ? sum : sum + p), 0) };
      return s;
    }
    s.turn = nextPlayer(s);
    return s;
  },

  chooseBotMove(state, playerId, rng, difficulty) {
    const legal = dominoesEngine.legalActions(state, playerId);
    if (legal.length === 0) return null;
    if (difficulty === 'easy') return rng.pick(legal);

    const hand = state.hands[playerId] ?? [];
    let best = legal[0] as DominoAction;
    let bestScore = -Infinity;
    for (const action of legal) {
      let score = rng.next() * 0.5; // tiny tie-breaker
      if (action.type === 'place') {
        const tile = hand.find((t) => t.id === action.tileId);
        if (tile) {
          score += tilePips(tile) * 0.4;
          if (tile.a === tile.b) score += 8; // shed doubles early
          // simulate new ends
          if (state.chain.length > 0) {
            const { left, right } = endValues(state.chain);
            let newLeft = left;
            let newRight = right;
            if (action.end === 'right') {
              newRight = tile.a === right ? tile.b : tile.a;
            } else {
              newLeft = tile.b === left ? tile.a : tile.b;
            }
            const rest = hand.filter((t) => t.id !== tile.id);
            const flexibility = rest.filter((t) => t.a === newLeft || t.b === newLeft || t.a === newRight || t.b === newRight).length;
            score += flexibility * 6;
            if (difficulty === 'hard' && newLeft === newRight) score += 4;
          }
        }
      } else if (action.type === 'draw') {
        score = -5;
      }
      if (score > bestScore) {
        bestScore = score;
        best = action;
      }
    }
    return best;
  },

  currentPlayers(state) {
    return state.phase === 'gameover' ? [] : [state.turn];
  },

  isGameOver(state) {
    return state.phase === 'gameover';
  },

  winners(state) {
    return state.result?.winner != null ? [state.result.winner] : [];
  },
};
