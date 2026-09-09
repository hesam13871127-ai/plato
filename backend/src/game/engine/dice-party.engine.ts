import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface DiceBoard extends Record<string, unknown> {
  /** Five dice values (1–6). */
  dice: number[];
  /** Held dice are not re-rolled. */
  held: boolean[];
  /** Rolls used this turn (0–3). */
  rollsUsed: number;
  /** scores[seat][catIndex]: points or -1 while unused. */
  scores: number[][];
  lastRoll: { seat: number; dice: number[] } | null;
  lastScore: { seat: number; category: string; points: number } | null;
}

const CATS = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
  'pair', 'two_pairs', 'three_kind', 'four_kind',
  'small_straight', 'large_straight', 'full_house', 'chance', 'yatzy',
] as const;
type Cat = (typeof CATS)[number];
const UPPER = 6; // first six categories are the upper section
const UPPER_BONUS = 50;
const UPPER_BONUS_AT = 63;
const MAX_ROLLS = 3;

/**
 * Dice Party (Yatzy) for 2–4 players, wave-3 rebuild.
 *
 * Each turn: roll five dice (three rolls max), tap dice to hold them through
 * re-rolls, then bank the roll into one of fifteen categories — ones through
 * sixes, pairs, triples, quads, straights, full house, chance and Yatzy (five
 * of a kind, 50 points). Every category is used exactly once per player; the
 * upper section pays a +50 bonus at 63+. Highest total after all categories
 * wins. No hidden information.
 *
 * Bots hold greedily (chase triples, straights and pairs) and bank the
 * best-scoring category left; difficulty scales re-roll patience and adds
 * blunder chances on easy/medium.
 */
@Injectable()
export class DicePartyEngine extends BaseGameEngine {
  readonly slug = 'dice_party';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const dice = Array.from({ length: 5 }, () => 1 + Math.floor(Math.random() * 6));
    const board: DiceBoard = {
      dice,
      held: Array<boolean>(5).fill(false),
      rollsUsed: 0,
      scores: config.seats.map(() => Array<number>(CATS.length).fill(-1)),
      lastRoll: null,
      lastScore: null,
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
    const board = state.board as unknown as DiceBoard;

    if (action.type === 'roll') {
      if (board.rollsUsed >= MAX_ROLLS) return { ok: false, error: 'All three rolls are used.' };
      if (board.rollsUsed > 0 && board.held.every(Boolean)) {
        return { ok: false, error: 'All dice are held — release one to roll.' };
      }
      return { ok: true };
    }

    if (action.type === 'hold') {
      const dice = action.payload.dice;
      if (!Array.isArray(dice) || dice.some((i) => !Number.isInteger(i) || i < 0 || i > 4)) {
        return { ok: false, error: 'Choose valid dice.' };
      }
      return { ok: true };
    }

    if (action.type === 'score') {
      const cat = action.payload.category;
      const idx = CATS.indexOf(cat as Cat);
      if (idx === -1) return { ok: false, error: 'Unknown category.' };
      if (board.scores[action.seat][idx] !== -1) {
        return { ok: false, error: 'You already used that category.' };
      }
      return { ok: true };
    }

    return { ok: false, error: 'Unknown action.' };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    const next = this.clone(state);
    const board = next.board as unknown as DiceBoard;

    if (action.type === 'roll') {
      if (board.rollsUsed === 0) {
        // The first roll of a turn always throws all five dice.
        board.held = Array<boolean>(5).fill(false);
        board.dice = Array.from({ length: 5 }, () => 1 + Math.floor(Math.random() * 6));
      } else {
        board.dice = board.dice.map((d, i) =>
          board.held[i] ? d : 1 + Math.floor(Math.random() * 6),
        );
      }
      board.rollsUsed += 1;
      board.lastRoll = { seat: action.seat, dice: [...board.dice] };
      next.version += 1;
      next.turnStartedAt = new Date().toISOString();
      return next; // same seat keeps deciding
    }

    if (action.type === 'hold') {
      const held = Array<boolean>(5).fill(false);
      for (const i of action.payload.dice as number[]) held[i] = true;
      board.held = held;
      next.version += 1;
      return next;
    }

    // score
    const cat = action.payload.category as Cat;
    const idx = CATS.indexOf(cat);
    const points = this.scoreCategory(board.dice, cat);
    board.scores[action.seat][idx] = points;
    board.lastScore = { seat: action.seat, category: cat, points };
    board.rollsUsed = 0;
    board.held = Array<boolean>(5).fill(false);
    next.version += 1;

    // Game over once every seat banked every category.
    if (board.scores.every((row) => row.every((v) => v !== -1))) {
      const totals = board.scores.map((row) => {
        const upper = row.slice(0, UPPER).reduce((a, b) => a + Math.max(0, b), 0);
        const bonus = upper >= UPPER_BONUS_AT ? UPPER_BONUS : 0;
        return row.reduce((a, b) => a + Math.max(0, b), 0) + bonus;
      });
      const winner = totals.indexOf(Math.max(...totals));
      this.finish(next, winner, totals);
      return next;
    }

    next.currentSeat = (action.seat + 1) % next.seats.length;
    next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as DiceBoard;
    const available = board.scores[seat]
      .map((v, i) => (v === -1 ? i : -1))
      .filter((i) => i !== -1);

    if (board.rollsUsed === 0) {
      return { action: { seat, type: 'roll', payload: {} }, delayMs: this.think(difficulty, 200) };
    }

    const mistakeChance = difficulty === 'easy' ? 0.30 : difficulty === 'medium' ? 0.10 : 0;
    const patient = difficulty === 'hard' || difficulty === 'expert';

    // Decide whether more rolls can help; easy banks early or fumbles.
    if (board.rollsUsed < MAX_ROLLS) {
      const best = this.bestCategory(board.dice, available);
      if (Math.random() < mistakeChance) {
        // Blunder: bank a random category now.
        const cat = CATS[available[Math.floor(Math.random() * available.length)]];
        return { action: { seat, type: 'score', payload: { category: cat } }, delayMs: this.think(difficulty) };
      }
      if (best.score >= 25 || (best.score >= 15 && !patient) || (best.index === CATS.indexOf('yatzy') && best.score > 0)) {
        const cat = CATS[best.index];
        return { action: { seat, type: 'score', payload: { category: cat } }, delayMs: this.think(difficulty) };
      }
      // Re-roll: hold the useful dice.
      const hold = this.holdHints(board.dice, available);
      const wantRoll = patient || board.rollsUsed < 2;
      if (hold.every(Boolean)) {
        // Nothing worth re-rolling (e.g. a made straight) — bank it.
        const bestNow = this.bestCategory(board.dice, available);
        return {
          action: { seat, type: 'score', payload: { category: CATS[bestNow.index] } },
          delayMs: this.think(difficulty),
        };
      }
      if (wantRoll) {
        if (hold.some((h, i) => h !== board.held[i])) {
          return {
            action: { seat, type: 'hold', payload: { dice: hold.map((h, i) => (h ? i : -1)).filter((i) => i >= 0) } },
            delayMs: this.think(difficulty, 250),
          };
        }
        return { action: { seat, type: 'roll', payload: {} }, delayMs: this.think(difficulty, 250) };
      }
    }

    const best = this.bestCategory(board.dice, available);
    return {
      action: { seat, type: 'score', payload: { category: CATS[best.index] } },
      delayMs: this.think(difficulty),
    };
  }

  // ── scoring (Yatzy) ───────────────────────────────────────────────────────

  scoreCategory(dice: number[], cat: Cat): number {
    const counts = Array<number>(7).fill(0);
    let sum = 0;
    for (const d of dice) {
      counts[d] += 1;
      sum += d;
    }
    const upperValues = [1, 2, 3, 4, 5, 6];
    const upperIdx = upperValues.findIndex((_, i) => CATS[i] === cat);
    if (upperIdx !== -1) return counts[upperIdx + 1] * (upperIdx + 1);

    switch (cat) {
      case 'pair':
        for (let v = 6; v >= 1; v--) if (counts[v] >= 2) return v * 2;
        return 0;
      case 'two_pairs': {
        const pairs: number[] = [];
        for (let v = 6; v >= 1 && pairs.length < 2; v--) if (counts[v] >= 2) pairs.push(v);
        return pairs.length === 2 ? pairs[0] * 2 + pairs[1] * 2 : 0;
      }
      case 'three_kind':
        for (let v = 6; v >= 1; v--) if (counts[v] >= 3) return v * 3;
        return 0;
      case 'four_kind':
        for (let v = 6; v >= 1; v--) if (counts[v] >= 4) return v * 4;
        return 0;
      case 'small_straight': {
        for (let v = 1; v <= 5; v++) if (counts[v] === 0) return 0;
        return 15;
      }
      case 'large_straight': {
        for (let v = 2; v <= 6; v++) if (counts[v] === 0) return 0;
        return 20;
      }
      case 'full_house': {
        let triple = 0;
        let pair = 0;
        for (let v = 1; v <= 6; v++) {
          if (counts[v] === 3) triple = v;
          if (counts[v] === 2) pair = v;
        }
        return triple > 0 && pair > 0 ? triple * 3 + pair * 2 : 0;
      }
      case 'chance':
        return sum;
      case 'yatzy':
        for (let v = 1; v <= 6; v++) if (counts[v] === 5) return 50;
        return 0;
      default:
        return 0;
    }
  }

  private bestCategory(dice: number[], available: number[]): { index: number; score: number } {
    let best = { index: available[0], score: -1 };
    for (const i of available) {
      const score = this.scoreCategory(dice, CATS[i]);
      if (score > best.score) best = { index: i, score };
    }
    return best;
  }

  /** Which dice to keep for the re-roll — a compact Yatzy heuristic. */
  private holdHints(dice: number[], available: number[]): boolean[] {
    const counts = Array<number>(7).fill(0);
    for (const d of dice) counts[d] += 1;
    const hold = Array<boolean>(5).fill(false);

    // Chase three-of-a-kind or better (yatzy / full house).
    let top = 1;
    for (let v = 1; v <= 6; v++) if (counts[v] > counts[top]) top = v;
    if (counts[top] >= 3) {
      dice.forEach((d, i) => (hold[i] = d === top));
      return hold;
    }

    // Straights: hold a run of 4+ distinct consecutive values.
    const uniq = [...new Set(dice)].sort((a, b) => a - b);
    let runStart = -1;
    let runLen = 1;
    let bestStart = uniq[0] ?? 1;
    let bestLen = 1;
    for (let i = 1; i < uniq.length; i++) {
      if (uniq[i] === uniq[i - 1] + 1) runLen++;
      else runLen = 1;
      runStart = uniq[i] - runLen + 1;
      if (runLen > bestLen) {
        bestLen = runLen;
        bestStart = runStart;
      }
    }
    const wantsSmall = available.includes(CATS.indexOf('small_straight')) || available.includes(CATS.indexOf('large_straight'));
    if (wantsSmall && bestLen >= 4) {
      dice.forEach((d, i) => (hold[i] = d >= bestStart && d < bestStart + bestLen));
      return hold;
    }

    // Keep a pair.
    if (counts[top] === 2) {
      dice.forEach((d, i) => (hold[i] = d === top));
      return hold;
    }

    // Keep the single highest die.
    let hiIdx = 0;
    dice.forEach((d, i) => {
      if (d > dice[hiIdx]) hiIdx = i;
    });
    hold[hiIdx] = true;
    return hold;
  }

  // ── shared helpers ────────────────────────────────────────────────────────

  private finish(state: GameState, winnerSeat: number, totals: number[]): void {
    state.phase = 'completed';
    state.winnerSeat = winnerSeat;
    state.currentSeat = -1;
    state.scores = [...totals];
    state.seats = state.seats.map((s, i) => ({ ...s, score: totals[i] }));
  }

  private think(difficulty: SeatInfo['botDifficulty'], extra = 0): number {
    const base = difficulty === 'easy' ? 1400 : difficulty === 'medium' ? 1000 : difficulty === 'hard' ? 750 : 500;
    return base + extra + Math.floor(Math.random() * 800);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as DiceBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        dice: [...board.dice],
        held: [...board.held],
        rollsUsed: board.rollsUsed,
        scores: board.scores.map((row) => [...row]),
        lastRoll: board.lastRoll ? { ...board.lastRoll, dice: [...board.lastRoll.dice] } : null,
        lastScore: board.lastScore ? { ...board.lastScore } : null,
      } as unknown as Record<string, unknown>,
    };
  }
}
