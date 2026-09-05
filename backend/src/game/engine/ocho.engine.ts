import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

// Card codes: colour ∈ R,G,B,Y (wild = W); rank ∈ 0-9, S(skip), R(reverse),
// P(+2), W(wild), X(wild +4).
interface OchoCard {
  id: string;
  color: 'R' | 'G' | 'B' | 'Y' | 'W';
  rank: string;
}

interface OchoBoard extends Record<string, unknown> {
  hands: OchoCard[][];
  drawPile: OchoCard[];
  discard: OchoCard[];
  direction: 1 | -1;
  activeColor: 'R' | 'G' | 'B' | 'Y';
  drawPending: number; // cards the current player must draw (stacked penalties)
}

const COLORS: Array<OchoCard['color']> = ['R', 'G', 'B', 'Y'];
const RANKS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'S', 'R', 'P'];

/**
 * Ocho — a fast UNO-style shedding game for 2–4 players. Match colour or rank,
 * play action cards (skip, reverse, draw-two, wild, wild-draw-four), or draw.
 * First to empty their hand wins. Turn-based; hidden hands are redacted per
 * seat. Bot AI matches colour/rank with difficulty-tuned wild usage and the
 * occasional sub-optimal (natural) play.
 */
@Injectable()
export class OchoEngine extends BaseGameEngine {
  readonly slug = 'ocho';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const seats = config.seats;
    const deck = this.shuffledDeck();
    const hands: OchoCard[][] = seats.map(() => []);
    const perHand = 7;
    for (let i = 0; i < perHand; i++) {
      for (let s = 0; s < seats.length; s++) hands[s].push(deck.pop()!);
    }
    // First discard: ensure a plain numbered coloured card.
    let first = deck.pop()!;
    while (first.color === 'W' || first.rank === 'S' || first.rank === 'R' || first.rank === 'P' || first.rank === 'X') {
      deck.unshift(first);
      first = deck.pop()!;
    }
    const board: OchoBoard = {
      hands,
      drawPile: deck,
      discard: [first],
      direction: 1,
      activeColor: first.color as 'R' | 'G' | 'B' | 'Y',
      drawPending: 0,
    };
    return {
      phase: 'in_progress',
      turn: 0,
      currentSeat: 0,
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

  private top(board: OchoBoard): OchoCard {
    return board.discard[board.discard.length - 1];
  }

  private playable(card: OchoCard, board: OchoBoard): boolean {
    if (board.drawPending > 0) {
      // Under a penalty you may only stack the matching penalty card; must draw otherwise.
      const top = this.top(board);
      if (top.rank === 'P' && card.rank === 'P') return true;
      if (top.rank === 'X' && card.rank === 'X') return true;
      return false;
    }
    if (card.color === 'W') return true;
    return card.color === board.activeColor || card.rank === this.top(board).rank;
  }

  private handHasPlayable(board: OchoBoard, seat: number): boolean {
    return board.hands[seat].some((c) => this.playable(c, board));
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'Game is not in progress.' };
    if (action.seat !== state.currentSeat) return { ok: false, error: 'It is not your turn.' };
    const board = state.board as unknown as OchoBoard;
    if (action.type === 'draw') {
      if (board.drawPending > 0) return { ok: true }; // taking the penalty
      if (this.handHasPlayable(board, action.seat)) {
        return { ok: false, error: 'You have a playable card.' };
      }
      return { ok: true };
    }
    if (action.type === 'play') {
      const cardId = String((action.payload as { cardId?: unknown }).cardId ?? '');
      const card = board.hands[action.seat].find((c) => c.id === cardId);
      if (!card) return { ok: false, error: 'You do not hold that card.' };
      if (!this.playable(card, board)) return { ok: false, error: 'That card cannot be played.' };
      return { ok: true };
    }
    return { ok: false, error: 'Unknown action.' };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    const next = this.clone(state);
    const board = next.board as unknown as OchoBoard;

    if (action.type === 'draw') {
      const count = board.drawPending > 0 ? board.drawPending : 1;
      this.drawCards(board, action.seat, count);
      board.drawPending = 0;
      // After a penalty draw the turn passes; after a normal draw the player
      // may still play an auto-matched card — bots do, humans choose.
      next.version += 1;
      this.advance(next, action.seat);
      return next;
    }

    // play
    const cardId = String((action.payload as { cardId: string }).cardId);
    const hand = board.hands[action.seat];
    const idx = hand.findIndex((c) => c.id === cardId);
    const [card] = hand.splice(idx, 1);
    board.discard.push(card);
    if (card.color === 'W') {
      const chosen = (action.payload as { color?: string }).color;
      board.activeColor = (COLORS.includes(chosen as OchoCard['color'])
        ? chosen
        : this.majorityColor(hand)) as 'R' | 'G' | 'B' | 'Y';
    } else {
      board.activeColor = card.color as 'R' | 'G' | 'B' | 'Y';
    }
    next.version += 1;

    if (hand.length === 0) {
      this.finish(next, action.seat);
      return next;
    }

    // Action card effects.
    if (card.rank === 'S') {
      this.advance(next, action.seat, 2);
    } else if (card.rank === 'R') {
      board.direction = (board.direction * -1) as 1 | -1;
      this.advance(next, action.seat, 1);
    } else if (card.rank === 'P') {
      board.drawPending += 2;
      this.advance(next, action.seat, 1);
    } else if (card.rank === 'X') {
      board.drawPending += 4;
      this.advance(next, action.seat, 1);
    } else {
      this.advance(next, action.seat, 1);
    }
    next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  private drawCards(board: OchoBoard, seat: number, count: number): void {
    for (let i = 0; i < count; i++) {
      if (board.drawPile.length === 0) this.reshuffle(board);
      const card = board.drawPile.pop();
      if (card) board.hands[seat].push(card);
    }
  }

  private reshuffle(board: OchoBoard): void {
    const keep = board.discard.pop();
    const rest = board.discard.splice(0, board.discard.length);
    board.drawPile = this.shuffle(rest);
    board.discard = keep ? [keep] : [];
  }

  private majorityColor(hand: OchoCard[]): OchoCard['color'] {
    const counts: Record<string, number> = { R: 0, G: 0, B: 0, Y: 0 };
    for (const c of hand) if (c.color !== 'W') counts[c.color]++;
    let best: OchoCard['color'] = 'R';
    let n = -1;
    for (const color of COLORS) {
      if (counts[color] > n) {
        n = counts[color];
        best = color;
      }
    }
    return best;
  }

  private advance(state: GameState, fromSeat: number, steps = 1): void {
    const board = state.board as unknown as OchoBoard;
    const total = state.seats.length;
    let next = fromSeat;
    for (let i = 0; i < steps; i++) {
      next = (next + board.direction + total) % total;
    }
    state.currentSeat = next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as OchoBoard;
    const hand = board.hands[seat];

    if (board.drawPending > 0) {
      // Only a card the engine itself deems playable may be stacked (P on P,
      // X on X); everything else must take the penalty draw.
      const stackable = hand.filter((c) => this.playable(c, board));
      const willStack = stackable.length > 0 && (difficulty === 'hard' || difficulty === 'expert' || Math.random() < 0.6);
      if (willStack) {
        const card = stackable[0];
        return { action: { seat, type: 'play', payload: { cardId: card.id, color: this.majorityColor(hand) } }, delayMs: this.think(difficulty) };
      }
      return { action: { seat, type: 'draw', payload: {} }, delayMs: this.think(difficulty) };
    }

    const playable = hand.filter((c) => this.playable(c, board));
    if (playable.length === 0) {
      return { action: { seat, type: 'draw', payload: {} }, delayMs: this.think(difficulty) };
    }
    const mistakeChance =
      difficulty === 'easy' ? 0.35 : difficulty === 'medium' ? 0.18 : difficulty === 'hard' ? 0.07 : 0.02;
    let card: OchoCard;
    if (Math.random() < mistakeChance) {
      card = playable[Math.floor(Math.random() * playable.length)];
    } else {
      card = this.chooseCard(board, hand, playable, seat, difficulty);
    }
    const payload: Record<string, unknown> = { cardId: card.id };
    if (card.color === 'W') payload.color = this.majorityColor(hand);
    return { action: { seat, type: 'play', payload }, delayMs: this.think(difficulty) };
  }

  private chooseCard(
    board: OchoBoard,
    hand: OchoCard[],
    playable: OchoCard[],
    _seat: number,
    difficulty: SeatInfo['botDifficulty'],
  ): OchoCard {
    // Save wilds unless nothing else or about to win (hard/expert).
    const nonWild = playable.filter((c) => c.color !== 'W');
    const smart = difficulty === 'hard' || difficulty === 'expert';
    if (smart) {
      // Winning move: shed high impact cards when hand is low.
      if (hand.length <= 2) {
        const action = playable.find((c) => c.rank === 'S' || c.rank === 'P' || c.rank === 'X');
        if (action) return action;
      }
      if (nonWild.length > 0) {
        // Prefer action cards then high rank to discard value.
        const sorted = [...nonWild].sort((a, b) => this.cardWeight(b) - this.cardWeight(a));
        return sorted[0];
      }
      return playable[0]; // wild
    }
    // easy/medium: prefer matching colour/rank with mild action bias, sometimes waste a wild.
    const pool = nonWild.length > 0 ? nonWild : playable;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private cardWeight(c: OchoCard): number {
    if (c.rank === 'X') return 9;
    if (c.rank === 'P') return 8;
    if (c.rank === 'S' || c.rank === 'R') return 7;
    const n = parseInt(c.rank, 10);
    return Number.isNaN(n) ? 0 : n;
  }

  protected redactHidden(state: GameState, seat: number): GameState {
    const board = state.board as unknown as OchoBoard;
    const safe: Record<string, unknown> = {
      discardTop: this.top(board),
      drawCount: board.drawPile.length,
      direction: board.direction,
      activeColor: board.activeColor,
      drawPending: board.drawPending,
      handSizes: board.hands.map((h) => h.length),
      hand: seat >= 0 ? board.hands[seat] : null,
    };
    return { ...state, board: safe };
  }

  private finish(state: GameState, winnerSeat: number): void {
    state.phase = 'completed';
    state.winnerSeat = winnerSeat;
    state.currentSeat = -1;
    // Winner scores the total pip value left in opponents' hands.
    const board = state.board as unknown as OchoBoard;
    let total = 0;
    board.hands.forEach((hand, i) => {
      if (i === winnerSeat) return;
      total += hand.reduce((sum, c) => sum + (c.rank === 'X' ? 50 : c.rank === 'W' ? 50 : c.rank === 'S' || c.rank === 'R' || c.rank === 'P' ? 20 : parseInt(c.rank, 10) || 0), 0);
    });
    state.scores = state.scores.map((_, i) => (i === winnerSeat ? total : 0));
  }

  private think(difficulty: SeatInfo['botDifficulty']): number {
    const base = difficulty === 'easy' ? 2200 : difficulty === 'medium' ? 1600 : difficulty === 'hard' ? 1100 : 800;
    return base + Math.floor(Math.random() * 1400);
  }

  private shuffledDeck(): OchoCard[] {
    const deck: OchoCard[] = [];
    let id = 0;
    for (const color of COLORS) {
      deck.push({ id: `c${id++}`, color, rank: '0' });
      for (let copy = 0; copy < 2; copy++) {
        for (const rank of RANKS) {
          if (rank === '0') continue;
          deck.push({ id: `c${id++}`, color, rank });
        }
      }
    }
    for (let copy = 0; copy < 4; copy++) {
      deck.push({ id: `c${id++}`, color: 'W', rank: 'W' });
      deck.push({ id: `c${id++}`, color: 'W', rank: 'X' });
    }
    return this.shuffle(deck);
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as OchoBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...board,
        hands: board.hands.map((h) => h.map((c) => ({ ...c }))),
        drawPile: board.drawPile.map((c) => ({ ...c })),
        discard: board.discard.map((c) => ({ ...c })),
      } as unknown as Record<string, unknown>,
    };
  }
}
