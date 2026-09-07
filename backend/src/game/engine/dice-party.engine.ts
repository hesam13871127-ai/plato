import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

/** Score-card categories, in card order. */
export const DICE_CATEGORIES = [
  'ones',
  'twos',
  'threes',
  'fours',
  'fives',
  'sixes',
  'three_kind',
  'four_kind',
  'full_house',
  'small_straight',
  'large_straight',
  'yacht',
  'chance',
] as const;
export type DiceCategory = (typeof DICE_CATEGORIES)[number];

const UPPER: DiceCategory[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
const UPPER_BONUS_THRESHOLD = 63;
const UPPER_BONUS = 35;
const MAX_ROLLS = 3;

interface DicePlayer {
  card: Partial<Record<DiceCategory, number>>;
  total: number;
  upperTotal: number;
  bonus: number;
}

interface DiceBoard extends Record<string, unknown> {
  players: DicePlayer[];
  dice: number[]; // 5 dice; 0 = not rolled yet this turn
  held: boolean[];
  rollsLeft: number;
  round: number; // 1..13
  lastEvent: { seat: number; category: DiceCategory; points: number; yacht: boolean } | null;
  /** Preview: what each open category would score with the current dice. */
  preview: Partial<Record<DiceCategory, number>>;
}

/**
 * Dice Party — a Yacht-style dice duel for 2–4 players. On your turn roll five
 * dice up to three times, holding any you like between rolls, then score the
 * result in one of 13 categories on your card (each usable once). Upper
 * section 63+ earns a 35-point bonus; five of a kind ("Yacht!") scores 50.
 * Highest card after 13 rounds wins. Bots hold sensibly toward the best open
 * category and score by expected value, with difficulty adding noise.
 */
@Injectable()
export class DicePartyEngine extends BaseGameEngine {
  readonly slug = 'dice_party';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const board: DiceBoard = {
      players: config.seats.map(() => ({ card: {}, total: 0, upperTotal: 0, bonus: 0 })),
      dice: [0, 0, 0, 0, 0],
      held: [false, false, false, false, false],
      rollsLeft: MAX_ROLLS,
      round: 1,
      lastEvent: null,
      preview: {},
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
    if (state.phase !== 'in_progress') return { ok: false, error: 'Game is not in progress.' };
    if (action.seat !== state.currentSeat) return { ok: false, error: 'It is not your turn.' };
    const board = state.board as unknown as DiceBoard;
    const rolled = board.rollsLeft < MAX_ROLLS;
    switch (action.type) {
      case 'roll': {
        if (board.rollsLeft <= 0) return { ok: false, error: 'No rolls left — pick a category.' };
        const held = action.payload.held;
        if (held !== undefined) {
          if (!Array.isArray(held) || held.length !== 5 || held.some((h) => typeof h !== 'boolean')) {
            return { ok: false, error: 'Held must list five dice.' };
          }
          if (!rolled && (held as boolean[]).some(Boolean)) return { ok: false, error: 'Roll first before holding dice.' };
        }
        return { ok: true };
      }
      case 'hold': {
        if (!rolled) return { ok: false, error: 'Roll first.' };
        const i = Number(action.payload.index);
        if (!Number.isInteger(i) || i < 0 || i > 4) return { ok: false, error: 'Choose a die.' };
        return { ok: true };
      }
      case 'score': {
        if (!rolled) return { ok: false, error: 'Roll the dice first.' };
        const category = String(action.payload.category) as DiceCategory;
        if (!DICE_CATEGORIES.includes(category)) return { ok: false, error: 'Unknown category.' };
        if (board.players[action.seat].card[category] !== undefined) return { ok: false, error: 'That category is already filled.' };
        return { ok: true };
      }
      default:
        return { ok: false, error: 'Unknown action.' };
    }
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    const next = this.clone(state);
    const board = next.board as unknown as DiceBoard;
    next.version += 1;

    if (action.type === 'hold') {
      const i = Number(action.payload.index);
      board.held[i] = !board.held[i];
      return next;
    }

    if (action.type === 'roll') {
      const held = action.payload.held as boolean[] | undefined;
      if (held) board.held = [...held];
      for (let i = 0; i < 5; i++) {
        if (!board.held[i] || board.dice[i] === 0) board.dice[i] = 1 + Math.floor(Math.random() * 6);
      }
      board.rollsLeft -= 1;
      board.preview = this.previewFor(board.players[action.seat], board.dice);
      return next;
    }

    // score
    const category = String(action.payload.category) as DiceCategory;
    const player = board.players[action.seat];
    const points = this.scoreCategory(category, board.dice);
    player.card[category] = points;
    this.recalc(player);
    board.lastEvent = { seat: action.seat, category, points, yacht: category === 'yacht' && points > 0 };
    next.scores[action.seat] = player.total;
    next.seats[action.seat].score = player.total;

    // Next turn / round.
    const lastSeat = next.seats.length - 1;
    if (action.seat === lastSeat) {
      if (board.round >= DICE_CATEGORIES.length) {
        this.finish(next);
        return next;
      }
      board.round += 1;
    }
    next.currentSeat = (action.seat + 1) % next.seats.length;
    next.turn += 1;
    board.dice = [0, 0, 0, 0, 0];
    board.held = [false, false, false, false, false];
    board.rollsLeft = MAX_ROLLS;
    board.preview = {};
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as DiceBoard;
    const player = board.players[seat];
    const think = (base: number) => base + Math.floor(Math.random() * 600);
    if (board.rollsLeft === MAX_ROLLS) {
      return { action: { seat, type: 'roll', payload: {} }, delayMs: think(700) };
    }
    const open = DICE_CATEGORIES.filter((c) => player.card[c] === undefined);
    const bestNow = this.bestCategory(open, board.dice, player);
    const noise = difficulty === 'easy' ? 0.35 : difficulty === 'medium' ? 0.15 : 0;

    // Decide whether to stop early: strong hands are banked immediately.
    const strong = bestNow.points >= 25 || (bestNow.category === 'full_house' && bestNow.points > 0);
    if (board.rollsLeft > 0 && !strong) {
      const held = this.chooseHolds(board.dice, open, difficulty);
      if (Math.random() < noise) {
        for (let i = 0; i < 5; i++) if (Math.random() < 0.3) held[i] = !held[i];
      }
      return { action: { seat, type: 'roll', payload: { held } }, delayMs: think(900) };
    }
    let category = bestNow.category;
    if (Math.random() < noise && open.length > 1) category = open[Math.floor(Math.random() * open.length)];
    return { action: { seat, type: 'score', payload: { category } }, delayMs: think(1000) };
  }

  protected redactHidden(state: GameState, seat: number): GameState {
    const board = state.board as unknown as DiceBoard;
    return {
      ...state,
      board: {
        players: board.players.map((p) => ({ card: p.card, total: p.total, upperTotal: p.upperTotal, bonus: p.bonus })),
        dice: board.dice,
        held: board.held,
        rollsLeft: board.rollsLeft,
        round: board.round,
        rounds: DICE_CATEGORIES.length,
        lastEvent: board.lastEvent,
        preview: state.phase === 'in_progress' && seat === state.currentSeat ? board.preview : {},
        categories: DICE_CATEGORIES,
      },
    };
  }

  // ── Scoring ───────────────────────────────────────────────────────────────

  scoreCategory(category: DiceCategory, dice: number[]): number {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    for (const d of dice) counts[d] += 1;
    const sum = dice.reduce((a, b) => a + b, 0);
    const has = (n: number) => counts.some((c) => c >= n);
    switch (category) {
      case 'ones':
      case 'twos':
      case 'threes':
      case 'fours':
      case 'fives':
      case 'sixes': {
        const face = UPPER.indexOf(category) + 1;
        return counts[face] * face;
      }
      case 'three_kind':
        return has(3) ? sum : 0;
      case 'four_kind':
        return has(4) ? sum : 0;
      case 'full_house':
        return counts.includes(3) && counts.includes(2) ? 25 : 0;
      case 'small_straight':
        return this.straightLength(counts) >= 4 ? 30 : 0;
      case 'large_straight':
        return this.straightLength(counts) >= 5 ? 40 : 0;
      case 'yacht':
        return has(5) ? 50 : 0;
      case 'chance':
        return sum;
    }
  }

  private straightLength(counts: number[]): number {
    let best = 0;
    let run = 0;
    for (let f = 1; f <= 6; f++) {
      run = counts[f] > 0 ? run + 1 : 0;
      best = Math.max(best, run);
    }
    return best;
  }

  private previewFor(player: DicePlayer, dice: number[]): Partial<Record<DiceCategory, number>> {
    const out: Partial<Record<DiceCategory, number>> = {};
    for (const c of DICE_CATEGORIES) if (player.card[c] === undefined) out[c] = this.scoreCategory(c, dice);
    return out;
  }

  private recalc(player: DicePlayer): void {
    player.upperTotal = UPPER.reduce((a, c) => a + (player.card[c] ?? 0), 0);
    player.bonus = player.upperTotal >= UPPER_BONUS_THRESHOLD ? UPPER_BONUS : 0;
    player.total = DICE_CATEGORIES.reduce((a, c) => a + (player.card[c] ?? 0), 0) + player.bonus;
  }

  private finish(state: GameState): void {
    const board = state.board as unknown as DiceBoard;
    state.phase = 'completed';
    state.currentSeat = -1;
    state.scores = board.players.map((p) => p.total);
    const max = Math.max(...state.scores);
    const leaders = state.scores.map((s, i) => (s === max ? i : -1)).filter((i) => i >= 0);
    state.winnerSeat = leaders.length === 1 ? leaders[0] : null;
    state.winnerSeats = leaders;
  }

  // ── Bot heuristics ────────────────────────────────────────────────────────

  private bestCategory(open: DiceCategory[], dice: number[], player: DicePlayer): { category: DiceCategory; points: number } {
    let best: { category: DiceCategory; points: number; value: number } | null = null;
    for (const c of open) {
      const points = this.scoreCategory(c, dice);
      // Value = points, minus the "opportunity cost" of burning a rich category for nothing.
      const par = this.par(c);
      let value = points - (points === 0 ? par * 0.6 : 0);
      if (UPPER.includes(c)) {
        const face = UPPER.indexOf(c) + 1;
        const need = 3 * face;
        value += points >= need ? 4 : -2;
        if (player.upperTotal + points >= UPPER_BONUS_THRESHOLD && player.bonus === 0) value += UPPER_BONUS * 0.5;
      }
      if (!best || value > best.value) best = { category: c, points, value };
    }
    return best ?? { category: open[0], points: 0 };
  }

  /** Rough expected value of a category — what a bot "expects" to get from it. */
  private par(c: DiceCategory): number {
    switch (c) {
      case 'ones':
        return 2;
      case 'twos':
        return 5;
      case 'threes':
        return 7;
      case 'fours':
        return 9;
      case 'fives':
        return 11;
      case 'sixes':
        return 13;
      case 'three_kind':
        return 18;
      case 'four_kind':
        return 10;
      case 'full_house':
        return 12;
      case 'small_straight':
        return 18;
      case 'large_straight':
        return 14;
      case 'yacht':
        return 6;
      case 'chance':
        return 22;
    }
  }

  private chooseHolds(dice: number[], open: DiceCategory[], difficulty: SeatInfo['botDifficulty']): boolean[] {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    for (const d of dice) counts[d] += 1;
    const held = [false, false, false, false, false];
    const straightOpen = open.includes('small_straight') || open.includes('large_straight');
    const run = this.straightLength(counts);
    // Chase straights when we already hold 3+ in a row and the category is open.
    if (straightOpen && run >= 3 && difficulty !== 'easy') {
      const seen = new Set<number>();
      dice.forEach((d, i) => {
        if (!seen.has(d)) {
          seen.add(d);
          held[i] = true;
        }
      });
      return held;
    }
    // Otherwise keep the most frequent face (prefer higher faces on ties).
    let face = 6;
    for (let f = 6; f >= 1; f--) if (counts[f] > counts[face]) face = f;
    if (counts[face] <= 1) {
      // Nothing paired: keep high dice for chance/upper, drop the rest.
      dice.forEach((d, i) => (held[i] = d >= 5));
      return held;
    }
    dice.forEach((d, i) => (held[i] = d === face));
    return held;
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as DiceBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...board,
        players: board.players.map((p) => ({ ...p, card: { ...p.card } })),
        dice: [...board.dice],
        held: [...board.held],
        preview: { ...board.preview },
      } as unknown as Record<string, unknown>,
    };
  }
}
