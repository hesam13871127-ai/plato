import type { GameConfig, GameEngine, RNG } from '../../core/types';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type OchoColor = 'red' | 'yellow' | 'green' | 'blue';
export type OchoValue =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';

export interface OchoCard {
  id: number;
  color: OchoColor | 'wild';
  value: OchoValue;
}

export type OchoAction =
  | { type: 'play'; cardId: number; chosenColor?: OchoColor }
  | { type: 'draw' }
  | { type: 'pass' };

export interface OchoState {
  playerCount: number;
  hands: OchoCard[][];
  drawPile: OchoCard[];
  discard: OchoCard[];
  activeColor: OchoColor;
  turn: number;
  dir: 1 | -1;
  /** the card drawn this turn (only set while its player may still play it) */
  drewCardId: number | null;
  phase: 'play' | 'gameover';
  winner: number | null;
  points: number;
  lastEvent: {
    kind: 'play' | 'draw' | 'pass' | 'penalty';
    player: number;
    cardId?: number;
    color?: OchoColor | 'wild';
    value?: OchoValue;
    amount?: number;
    victim?: number;
  } | null;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const COLORS: OchoColor[] = ['red', 'yellow', 'green', 'blue'];

export function cardPoints(c: OchoCard): number {
  if (c.value === 'wild' || c.value === 'wild4') return 50;
  if (c.value === 'skip' || c.value === 'reverse' || c.value === 'draw2') return 20;
  return Number(c.value);
}

function buildDeck(): OchoCard[] {
  const cards: OchoCard[] = [];
  let id = 0;
  for (const color of COLORS) {
    cards.push({ id: id++, color, value: '0' });
    for (let n = 1; n <= 9; n++) {
      cards.push({ id: id++, color, value: String(n) as OchoValue });
      cards.push({ id: id++, color, value: String(n) as OchoValue });
    }
    for (const v of ['skip', 'reverse', 'draw2'] as OchoValue[]) {
      cards.push({ id: id++, color, value: v });
      cards.push({ id: id++, color, value: v });
    }
  }
  for (let i = 0; i < 4; i++) {
    cards.push({ id: id++, color: 'wild', value: 'wild' });
    cards.push({ id: id++, color: 'wild', value: 'wild4' });
  }
  return cards;
}

function topCard(state: OchoState): OchoCard {
  return state.discard[state.discard.length - 1] as OchoCard;
}

export function canPlay(state: OchoState, card: OchoCard): boolean {
  if (card.color === 'wild') return true;
  if (card.color === state.activeColor) return true;
  return card.value === topCard(state).value;
}

function advance(state: OchoState, k: number): number {
  const n = state.playerCount;
  return (((state.turn + state.dir * k) % n) + n) % n;
}

/** Move `n` cards from the draw pile (reshuffling the discard if needed). */
function drawCards(state: OchoState, player: number, n: number, rng: RNG): number {
  let drawn = 0;
  const hand = state.hands[player] as OchoCard[];
  for (let i = 0; i < n; i++) {
    if (state.drawPile.length === 0) {
      if (state.discard.length <= 1) break;
      const top = state.discard.pop() as OchoCard;
      state.drawPile = rng.shuffle(state.discard);
      state.discard = [top];
    }
    const card = state.drawPile.shift();
    if (!card) break;
    hand.push(card);
    drawn++;
  }
  return drawn;
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

export const ochoEngine: GameEngine<OchoState, OchoAction> = {
  createInitialState(config, rng) {
    const playerCount = config.slots.length;
    const deck = rng.shuffle(buildDeck());
    const hands: OchoCard[][] = Array.from({ length: playerCount }, (_, i) => deck.slice(i * 7, (i + 1) * 7));
    let pile = deck.slice(playerCount * 7);

    // first discard must be a number card — bury anything else
    const discard: OchoCard[] = [];
    while (true) {
      const card = pile.shift();
      if (!card) break;
      if (/^[0-9]$/.test(card.value)) {
        discard.push(card);
        break;
      }
      pile.push(card);
    }

    return {
      playerCount,
      hands,
      drawPile: pile,
      discard,
      activeColor: (discard[0]?.color ?? 'red') as OchoColor,
      turn: 0,
      dir: 1,
      drewCardId: null,
      phase: 'play',
      winner: null,
      points: 0,
      lastEvent: null,
    };
  },

  legalActions(state, playerId) {
    if (state.phase !== 'play' || state.turn !== playerId) return [];
    const hand = state.hands[playerId] ?? [];
    const actions: OchoAction[] = [];
    for (const card of hand) {
      if (state.drewCardId !== null && card.id !== state.drewCardId) continue;
      if (!canPlay(state, card)) continue;
      if (card.color === 'wild') {
        for (const c of COLORS) actions.push({ type: 'play', cardId: card.id, chosenColor: c });
      } else {
        actions.push({ type: 'play', cardId: card.id });
      }
    }
    if (state.drewCardId === null) {
      actions.push({ type: 'draw' });
    } else {
      actions.push({ type: 'pass' });
    }
    return actions;
  },

  validate(state, action, playerId) {
    return ochoEngine.legalActions(state, playerId).some((a) => JSON.stringify(a) === JSON.stringify(action));
  },

  applyAction(state, action, playerId, rng) {
    if (!ochoEngine.validate(state, action, playerId)) return state;
    const s: OchoState = {
      ...state,
      hands: state.hands.map((h) => [...h]),
      drawPile: [...state.drawPile],
      discard: [...state.discard],
    };

    if (action.type === 'draw') {
      const before = (s.hands[playerId] as OchoCard[]).length;
      drawCards(s, playerId, 1, rng);
      if ((s.hands[playerId] as OchoCard[]).length === before) {
        // nothing left to draw: turn passes
        s.turn = advance(s, 1);
        s.drewCardId = null;
        s.lastEvent = { kind: 'pass', player: playerId };
        return s;
      }
      const card = (s.hands[playerId] as OchoCard[])[(s.hands[playerId] as OchoCard[]).length - 1] as OchoCard;
      s.lastEvent = { kind: 'draw', player: playerId, cardId: card.id, color: card.color, value: card.value };
      if (canPlay(s, card)) {
        s.drewCardId = card.id; // may play it or pass
        return s;
      }
      s.turn = advance(s, 1);
      s.drewCardId = null;
      return s;
    }

    if (action.type === 'pass') {
      s.turn = advance(s, 1);
      s.drewCardId = null;
      s.lastEvent = { kind: 'pass', player: playerId };
      return s;
    }

    // play
    const hand = s.hands[playerId] as OchoCard[];
    const idx = hand.findIndex((c) => c.id === action.cardId);
    const card = hand[idx] as OchoCard;
    hand.splice(idx, 1);
    s.discard.push(card);
    s.activeColor = card.color === 'wild' ? (action.chosenColor ?? 'red') : card.color;
    s.drewCardId = null;
    s.lastEvent = { kind: 'play', player: playerId, cardId: card.id, color: card.color, value: card.value };

    if (hand.length === 0) {
      s.phase = 'gameover';
      s.winner = playerId;
      s.points = s.hands.reduce(
        (sum, h, p) => (p === playerId ? sum : sum + h.reduce((x, c) => x + cardPoints(c), 0)),
        0,
      );
      return s;
    }

    const next = advance(s, 1);
    switch (card.value) {
      case 'skip':
        s.turn = advance(s, 2);
        break;
      case 'reverse':
        s.dir = (s.dir === 1 ? -1 : 1) as 1 | -1;
        s.turn = s.playerCount === 2 ? advance(s, 2) : advance(s, 1);
        break;
      case 'draw2': {
        drawCards(s, next, 2, rng);
        s.lastEvent = { ...s.lastEvent, kind: 'penalty', victim: next, amount: 2 };
        s.turn = advance(s, 2);
        break;
      }
      case 'wild4': {
        drawCards(s, next, 4, rng);
        s.lastEvent = { ...s.lastEvent, kind: 'penalty', victim: next, amount: 4 };
        s.turn = advance(s, 2);
        break;
      }
      default:
        s.turn = next;
    }
    return s;
  },

  chooseBotMove(state, playerId, rng, difficulty) {
    const legal = ochoEngine.legalActions(state, playerId);
    if (legal.length === 0) return null;
    const plays = legal.filter((a): a is Extract<OchoAction, { type: 'play' }> => a.type === 'play');
    if (plays.length === 0) return legal[0] as OchoAction;
    if (difficulty === 'easy') return rng.pick(plays);

    const hand = state.hands[playerId] ?? [];
    const next = advance(state, 1);
    const nextHand = (state.hands[next] ?? []).length;
    const colorCount = (color: OchoColor, excludeId?: number) =>
      hand.filter((c) => c.id !== excludeId && c.color === color).length;

    let best = plays[0]!;
    let bestScore = -Infinity;
    for (const action of plays) {
      const card = hand.find((c) => c.id === action.cardId);
      if (!card) continue;
      let score = rng.next() * 0.4;

      if (card.color === 'wild') {
        score -= 8; // hold wilds
        if (card.value === 'wild4') {
          score -= 4;
          if (nextHand <= 2) score += 45;
        }
        if (action.chosenColor) score += colorCount(action.chosenColor, card.id) * 2.2;
      } else {
        score += colorCount(card.color as OchoColor, card.id) * 2.0;
        if (nextHand <= 2) {
          if (card.value === 'draw2') score += 35;
          if (card.value === 'skip') score += 25;
          if (card.value === 'reverse' && state.playerCount === 2) score += 25;
        }
        if (card.value === 'draw2') score += 6;
        if (card.value === 'skip') score += 4;
        if (/^[0-9]$/.test(card.value)) score += Number(card.value) * 0.3;
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
    return state.winner !== null ? [state.winner] : [];
  },
};
