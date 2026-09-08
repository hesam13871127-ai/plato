import { describe, expect, it } from 'vitest';
import { makeRng } from '../../core/rng';
import type { GameConfig } from '../../core/types';
import { diceEngine, scoreCategory, totalScore, type Category } from './engine';

function cfg(n: number): GameConfig {
  return {
    seed: 1,
    slots: Array.from({ length: n }, (_, i) => ({ id: i, kind: 'bot', name: `b${i}` })),
  };
}

function score(dice: number[], cat: Category): number {
  return scoreCategory(dice, cat);
}

describe('dice party (yahtzee) engine', () => {
  it('scores every category correctly', () => {
    expect(score([1, 1, 3, 1, 5], 'ones')).toBe(3);
    expect(score([2, 2, 2, 5, 5], 'twos')).toBe(6);
    expect(score([6, 6, 6, 6, 2], 'sixes')).toBe(24);
    expect(score([3, 3, 3, 4, 5], 'triple')).toBe(18);
    expect(score([4, 4, 4, 4, 1], 'quad')).toBe(17);
    expect(score([5, 5, 3, 3, 3], 'fullHouse')).toBe(25);
    expect(score([3, 3, 3, 3, 3], 'fullHouse')).toBe(25);
    expect(score([1, 2, 3, 4, 6], 'smallStraight')).toBe(30);
    expect(score([2, 3, 4, 5, 5], 'smallStraight')).toBe(30);
    expect(score([1, 3, 4, 5, 6], 'smallStraight')).toBe(30);
    expect(score([1, 3, 4, 5, 6], 'largeStraight')).toBe(0);
    expect(score([2, 3, 4, 5, 6], 'largeStraight')).toBe(40);
    expect(score([6, 6, 6, 6, 6], 'yacht')).toBe(50);
    expect(score([1, 2, 3, 4, 5], 'chance')).toBe(15);
    expect(score([1, 2, 4, 5, 6], 'fullHouse')).toBe(0);
    expect(score([1, 1, 2, 2, 3], 'triple')).toBe(0);
  });

  it('applies the upper bonus at 63+', () => {
    const card = Object.fromEntries(
      (
        ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes', 'triple', 'quad', 'fullHouse', 'smallStraight', 'largeStraight', 'yacht', 'chance'] as Category[]
      ).map((c) => [c, null]),
    ) as Record<Category, number | null>;
    card.ones = 3;
    card.twos = 6;
    card.threes = 9;
    card.fours = 12;
    card.fives = 15;
    card.sixes = 18; // 63 exactly
    card.chance = 20;
    expect(totalScore(card)).toBe(63 + 35 + 20);
    card.sixes = 12; // 57 → no bonus
    expect(totalScore(card)).toBe(57 + 20);
  });

  it('rolls three times then forces an assignment', () => {
    let s = diceEngine.createInitialState(cfg(2), makeRng(5));
    expect(s.phase).toBe('roll');
    expect(s.rollsLeft).toBe(2);
    s = diceEngine.applyAction(s, { type: 'roll', hold: [true, false, false, false, false] }, 0, makeRng(1));
    expect(s.rollsLeft).toBe(1);
    expect(s.dice[0]).toBe(diceEngine.createInitialState(cfg(2), makeRng(5)).dice[0]); // held die kept
    s = diceEngine.applyAction(s, { type: 'roll', hold: [true, true, true, true, true] }, 0, makeRng(2));
    expect(s.phase).toBe('assign');
    expect(diceEngine.legalActions(s, 0).every((a) => a.type === 'score')).toBe(true);
    s = diceEngine.applyAction(s, { type: 'score', category: 'chance' }, 0, makeRng(3));
    expect(s.scores[0]!.chance).toBeGreaterThan(0);
    expect(s.turn).toBe(1);
    expect(s.phase).toBe('roll');
    expect(s.rollsLeft).toBe(2);
  });

  it('holds work: held dice are not re-rolled', () => {
    let s = diceEngine.createInitialState(cfg(2), makeRng(42));
    const before = [...s.dice];
    s = diceEngine.applyAction(s, { type: 'roll', hold: [false, true, false, true, false] }, 0, makeRng(9));
    expect(s.dice[1]).toBe(before[1]);
    expect(s.dice[3]).toBe(before[3]);
  });

  it('runs a full 13-round game and reports the right winner', () => {
    let s = diceEngine.createInitialState(cfg(2), makeRng(77));
    let guard = 0;
    while (!diceEngine.isGameOver(s) && guard++ < 500) {
      const move = diceEngine.chooseBotMove(s, s.turn, makeRng(guard), 'medium');
      expect(move).not.toBeNull();
      s = diceEngine.applyAction(s, move!, s.turn, makeRng(guard * 7 + 1));
    }
    expect(diceEngine.isGameOver(s)).toBe(true);
    expect(s.round).toBe(13);
    // every category scored for every player
    for (const card of s.scores) {
      for (const v of Object.values(card)) expect(v).not.toBeNull();
    }
    const winners = diceEngine.winners(s);
    expect(winners.length).toBeGreaterThanOrEqual(1);
    const totals = s.scores.map((c) => totalScore(c));
    expect(totals[winners[0]!]).toBe(Math.max(...totals));
  });

  it('rejects scoring an already-used category', () => {
    let s = diceEngine.createInitialState(cfg(2), makeRng(5));
    s = diceEngine.applyAction(s, { type: 'roll', hold: [true, true, true, true, true] }, 0, makeRng(1));
    s = diceEngine.applyAction(s, { type: 'roll', hold: [true, true, true, true, true] }, 0, makeRng(1));
    s = diceEngine.applyAction(s, { type: 'score', category: 'ones' }, 0, makeRng(1));
    // p1's turn now; p0 cannot score again
    expect(diceEngine.validate(s, { type: 'score', category: 'ones' }, 0)).toBe(false);
  });
});
