import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

type CardColor = 'red' | 'yellow' | 'green' | 'blue' | 'wild';
type CardValue = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'skip' | 'rev' | 'd2' | 'wild' | 'd4';

interface OchoCard {
  id: string;
  color: CardColor;
  value: CardValue;
}

/** Authoritative (server-side) board — `deck`, `discard` and `hands` are secret. */
interface OchoBoard extends Record<string, unknown> {
  deck: OchoCard[];
  discard: OchoCard[];
  top: OchoCard;
  /** Colour chosen for a wild top card (null unless the top is wild). */
  chosenColor: CardColor | null;
  hands: OchoCard[][];
  /** 1 = clockwise (seat order), -1 = counter-clockwise. */
  dir: 1 | -1;
  /** 'play' → the seat may play any legal card or draw; 'drawn' → it may play the drawn card or pass. */
  turnMode: 'play' | 'drawn';
  /** The card just drawn (only playable in 'drawn' mode). */
  drawnCardId: string | null;
  /** Seat that just dropped to one card — auto-announced "Ocho!". */
  unoSeat: number | null;
  /** Last applied action for client animation. */
  lastAction: { seat: number; type: string; card?: OchoCard; skipped?: number[]; drawn?: number } | null;
}

const COLORS: CardColor[] = ['red', 'yellow', 'green', 'blue'];
const HAND_SIZE = 7;

/** Card points at settlement: face value, 20 for actions, 50 for wilds. */
function cardPoints(card: OchoCard): number {
  if (card.color === 'wild') return 50;
  if (card.value === 'skip' || card.value === 'rev' || card.value === 'd2') return 20;
  return Number(card.value);
}

/**
 * Ocho — the classic crazy-eights party game for 2–4 players (wave-1 rebuild).
 *
 * Rules (mirrored by the in-app tutorial):
 * - 108-card deck: per colour one 0 and two each of 1–9, Skip, Reverse and
 *   Draw-Two, plus four Wilds and four Wild Draw-Fours.
 * - Match the top card by colour or number, or drop a wild. Wilds (and d4s)
 *   declare the next colour with the play.
 * - Skip passes the victim by; Reverse flips direction (and acts as a Skip in
 *   a duel); Draw-Two / Wild Draw-Four make the next seat draw and lose its
 *   turn.
 * - No playable card? Draw one. You may then play exactly that card or pass.
 * - Emptying your hand wins and scores the points left in every other hand.
 *
 * Hidden information: each seat sees only its own hand; everyone else sees
 * hand sizes. Spectators see no hands.
 */
@Injectable()
export class OchoEngine extends BaseGameEngine {
  readonly slug = 'ocho';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const deck = this.buildDeck();
    this.shuffle(deck);

    const hands: OchoCard[][] = Array.from({ length: config.seats.length }, () => []);
    for (let i = 0; i < HAND_SIZE * config.seats.length; i++) {
      hands[i % config.seats.length].push(deck.shift() as OchoCard);
    }

    // The opening card must be a plain number card.
    let topIndex = deck.findIndex((c) => c.color !== 'wild' && /^[0-9]$/.test(c.value));
    if (topIndex < 0) topIndex = 0; // practically unreachable with a fresh deck
    const top = deck.splice(topIndex, 1)[0];

    const board: OchoBoard = {
      deck,
      discard: [],
      top,
      chosenColor: null,
      hands,
      dir: 1,
      turnMode: 'play',
      drawnCardId: null,
      unoSeat: null,
      lastAction: null,
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
    const board = state.board as unknown as OchoBoard;
    const hand = board.hands[action.seat] ?? [];

    if (action.type === 'play') {
      const cardId = typeof action.payload.cardId === 'string' ? action.payload.cardId : null;
      const card = hand.find((c) => c.id === cardId);
      if (!card) return { ok: false, error: 'That card is not in your hand.' };
      if (board.turnMode === 'drawn' && board.drawnCardId !== card.id) {
        return { ok: false, error: 'After drawing you may only play the drawn card.' };
      }
      if (!this.matchesTop(board, card)) {
        return { ok: false, error: 'That card does not match the colour or the value.' };
      }
      if (card.color === 'wild') {
        const color = action.payload.color;
        if (typeof color !== 'string' || !COLORS.includes(color as CardColor)) {
          return { ok: false, error: 'Choose a colour for your wild.' };
        }
      }
      return { ok: true };
    }

    if (action.type === 'draw') {
      if (board.turnMode === 'drawn') return { ok: false, error: 'You already drew — play it or pass.' };
      return { ok: true };
    }

    if (action.type === 'pass') {
      if (board.turnMode !== 'drawn') return { ok: false, error: 'You may only pass after drawing.' };
      return { ok: true };
    }

    return { ok: false, error: 'Unknown action.' };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    const next = this.clone(state);
    const board = next.board as unknown as OchoBoard;

    if (action.type === 'play') {
      const hand = board.hands[action.seat];
      const card = hand.find((c) => c.id === action.payload.cardId) as OchoCard;
      hand.splice(hand.indexOf(card), 1);
      board.discard.push(board.top);
      board.top = card;
      board.chosenColor = card.color === 'wild' ? (action.payload.color as CardColor) : null;
      board.turnMode = 'play';
      board.drawnCardId = null;
      board.lastAction = { seat: action.seat, type: 'play', card: { ...card } };
      next.version += 1;

      if (hand.length === 0) {
        this.finish(next, action.seat);
        return next;
      }
      board.unoSeat = hand.length === 1 ? action.seat : null;

      // Resolve the card's effect on the following seat.
      const skip = new Set<number>();
      let drawForNext = 0;
      if (card.value === 'skip') skip.add(this.nextSeat(next, action.seat, board));
      if (card.value === 'rev') {
        board.dir = (board.dir * -1) as 1 | -1;
        if (next.seats.length === 2) skip.add(this.nextSeat(next, action.seat, board));
      }
      if (card.value === 'd2') drawForNext = 2;
      if (card.value === 'd4') drawForNext = 4;

      if (drawForNext > 0) {
        const victim = this.nextSeat(next, action.seat, board);
        this.forceDraw(board, victim, drawForNext);
        skip.add(victim);
      }

      this.advance(next, board, action.seat, skip);
      return next;
    }

    if (action.type === 'draw') {
      this.refillDeckIfNeeded(board);
      const card = board.deck.pop() as OchoCard;
      board.hands[action.seat].push(card);
      board.turnMode = 'drawn';
      board.drawnCardId = card.id;
      board.lastAction = { seat: action.seat, type: 'draw', drawn: 1 };
      next.version += 1;
      next.turnStartedAt = new Date().toISOString();
      return next;
    }

    // pass
    board.lastAction = { seat: action.seat, type: 'pass' };
    board.turnMode = 'play';
    board.drawnCardId = null;
    next.version += 1;
    this.advance(next, board, action.seat, new Set());
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as OchoBoard;
    const hand = board.hands[seat] ?? [];

    if (board.turnMode === 'drawn') {
      const drawn = hand.find((c) => c.id === board.drawnCardId);
      if (drawn && this.matchesTop(board, drawn)) {
        return {
          action: {
            seat,
            type: 'play',
            payload: { cardId: drawn.id, ...(drawn.color === 'wild' ? { color: this.bestColor(hand) } : {}) },
          },
          delayMs: this.think(difficulty, 250),
        };
      }
      return { action: { seat, type: 'pass', payload: {} }, delayMs: this.think(difficulty, 150) };
    }

    const playable = hand.filter((c) => this.matchesTop(board, c));
    if (playable.length === 0) {
      // Nothing to draw anywhere? A dead pass is the only legal move.
      if (board.deck.length === 0 && board.discard.length === 0) {
        return { action: { seat, type: 'pass', payload: {} }, delayMs: this.think(difficulty, 200) };
      }
      return { action: { seat, type: 'draw', payload: {} }, delayMs: this.think(difficulty, 400) };
    }

    const nextHandSize = board.hands[this.nextSeat(state, seat, board)]?.length ?? 99;
    const strike = nextHandSize <= 2; // punish a rival about to go out

    let card: OchoCard;
    if (difficulty === 'easy') {
      card = playable[Math.floor(Math.random() * playable.length)];
    } else {
      const value = (c: OchoCard) => {
        let v = cardPoints(c);
        if (strike && (c.value === 'd2' || c.value === 'd4' || c.value === 'skip')) v += 60;
        if (strike && c.value === 'rev' && state.seats.length === 2) v += 60;
        // Keep wilds for when they truly matter (unless punishing).
        if (c.color === 'wild' && !strike) v -= 25;
        return v;
      };
      card = playable.reduce((best, c) => (value(c) >= value(best) ? c : best));
    }

    return {
      action: {
        seat,
        type: 'play',
        payload: { cardId: card.id, ...(card.color === 'wild' ? { color: this.bestColor(hand) } : {}) },
      },
      delayMs: this.think(difficulty, 300),
    };
  }

  protected redactHidden(state: GameState, seat: number): GameState {
    const board = state.board as unknown as OchoBoard;
    const view = {
      top: { color: board.top.color, value: board.top.value },
      activeColor: board.chosenColor ?? board.top.color,
      isWildTop: board.top.color === 'wild',
      deck: board.deck.length,
      dir: board.dir,
      turnMode: board.turnMode,
      drawnCardId: seat >= 0 ? board.drawnCardId : null,
      unoSeat: board.unoSeat,
      handSizes: board.hands.map((h) => h.length),
      hand: seat >= 0 ? board.hands[seat].map((c) => ({ id: c.id, color: c.color, value: c.value })) : null,
      lastAction: board.lastAction
        ? { ...board.lastAction, card: board.lastAction.card ? { color: board.lastAction.card.color, value: board.lastAction.card.value } : undefined }
        : null,
    };
    return { ...state, board: view as unknown as Record<string, unknown> };
  }

  // ── rules helpers ────────────────────────────────────────────────────────

  private matchesTop(board: OchoBoard, card: OchoCard): boolean {
    if (card.color === 'wild') return true;
    const active = board.chosenColor ?? board.top.color;
    return card.color === active || card.value === board.top.value;
  }

  private nextSeat(state: GameState, seat: number, board: OchoBoard): number {
    const n = state.seats.length;
    return (seat + board.dir + n) % n;
  }

  /** Moves to the seat after `seat`, skipping any skipped seats. */
  private advance(state: GameState, board: OchoBoard, seat: number, skip: Set<number>): void {
    let next = this.nextSeat(state, seat, board);
    while (skip.has(next) && skip.size < state.seats.length) {
      skip.delete(next);
      next = this.nextSeat(state, next, board);
    }
    state.currentSeat = next;
    state.turn += 1;
    state.turnStartedAt = new Date().toISOString();
  }

  private forceDraw(board: OchoBoard, seat: number, count: number): void {
    for (let i = 0; i < count; i++) {
      this.refillDeckIfNeeded(board);
      board.hands[seat].push(board.deck.pop() as OchoCard);
    }
  }

  private refillDeckIfNeeded(board: OchoBoard): void {
    if (board.deck.length > 0) return;
    if (board.discard.length === 0) return; // extreme edge: nothing to recycle
    const top = board.top;
    board.deck = board.discard;
    board.discard = [];
    this.shuffle(board.deck);
    board.top = top;
  }

  /** The colour the bot holds the most of. */
  private bestColor(hand: OchoCard[]): string {
    const counts = new Map<CardColor, number>();
    for (const c of hand) {
      if (c.color !== 'wild') counts.set(c.color, (counts.get(c.color) ?? 0) + 1);
    }
    let best: CardColor = COLORS[Math.floor(Math.random() * 4)];
    let bestN = 0;
    for (const [color, n] of counts) {
      if (n > bestN) {
        best = color;
        bestN = n;
      }
    }
    return best;
  }

  private finish(state: GameState, winnerSeat: number): void {
    const board = state.board as unknown as OchoBoard;
    const points = board.hands.map((hand) => hand.reduce((sum, c) => sum + cardPoints(c), 0));
    state.phase = 'completed';
    state.winnerSeat = winnerSeat;
    state.currentSeat = -1;
    state.scores = points.map((_, i) => (i === winnerSeat ? points.reduce((sum, p, j) => (j === i ? sum : sum + p), 0) : 0));
    state.seats = state.seats.map((s, i) => ({ ...s, score: state.scores[i] }));
  }

  private buildDeck(): OchoCard[] {
    const deck: OchoCard[] = [];
    const push = (color: CardColor, value: CardValue) =>
      deck.push({ id: `${color}-${value}-${deck.length}`, color, value });
    for (const color of COLORS) {
      push(color, '0');
      for (let n = 1; n <= 9; n++) {
        push(color, String(n) as CardValue);
        push(color, String(n) as CardValue);
      }
      for (const value of ['skip', 'rev', 'd2'] as CardValue[]) {
        push(color, value);
        push(color, value);
      }
    }
    for (let i = 0; i < 4; i++) {
      push('wild', 'wild');
      push('wild', 'd4');
    }
    return deck;
  }

  private shuffle(cards: OchoCard[]): void {
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
  }

  private think(difficulty: SeatInfo['botDifficulty'], extra: number): number {
    const base = difficulty === 'easy' ? 1000 : difficulty === 'medium' ? 800 : difficulty === 'hard' ? 600 : 420;
    return base + Math.floor(Math.random() * 700) + extra;
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as OchoBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        deck: board.deck.map((c) => ({ ...c })),
        discard: board.discard.map((c) => ({ ...c })),
        top: { ...board.top },
        chosenColor: board.chosenColor,
        hands: board.hands.map((hand) => hand.map((c) => ({ ...c }))),
        dir: board.dir,
        turnMode: board.turnMode,
        drawnCardId: board.drawnCardId,
        unoSeat: board.unoSeat,
        lastAction: board.lastAction ? { ...board.lastAction } : null,
      } as unknown as Record<string, unknown>,
    };
  }
}
