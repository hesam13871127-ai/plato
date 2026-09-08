import { describe, expect, it } from 'vitest';
import { makeRng } from '../../core/rng';
import type { GameConfig } from '../../core/types';
import { bankrollEngine, spreadMultiplier, START_CHIPS, TURNS_PER_PLAYER, type BankrollState } from './engine';

function cfg(n: number): GameConfig {
  return {
    seed: 51,
    slots: Array.from({ length: n }, (_, i) => ({ id: i, kind: 'bot', name: `b${i}` })),
  };
}

function withTable(base: BankrollState, a: number, b: number): BankrollState {
  return { ...base, table: [a, b] };
}

describe('bankroll engine', () => {
  it('deals 52 unique ranks, two table cards and full banks', () => {
    const s = bankrollEngine.createInitialState(cfg(3), makeRng(1));
    expect(s.deck.length + s.discard.length + 2).toBe(52);
    const all = [...s.deck, ...s.discard, ...s.table!];
    const counts = new Map<number, number>();
    for (const c of all) counts.set(c, (counts.get(c) ?? 0) + 1);
    expect([...counts.values()].every((c) => c === 4)).toBe(true);
    expect(s.banks).toEqual([START_CHIPS, START_CHIPS, START_CHIPS]);
    expect(s.phase).toBe('bet');
  });

  it('pays the multiplier when the card lands between', () => {
    let s = bankrollEngine.createInitialState(cfg(2), makeRng(2));
    // 5 and 7 → spread 1 (only rank 6 wins) → ×5
    s = withTable(s, 5, 7);
    const deck = [...s.deck];
    deck[deck.length - 1] = 6; // force the next card to be a 6
    s = { ...s, deck };
    const before = s.banks[0]!;
    s = bankrollEngine.applyAction(s, { type: 'bet', amount: 10 }, 0, makeRng(2));
    expect(s.lastEvent?.kind).toBe('win');
    expect(s.banks[0]).toBe(before + 10 * spreadMultiplier(1));
    expect(s.table).not.toEqual([5, 7]); // fresh table dealt
  });

  it('loses the stake outside and DOUBLE on a post', () => {
    let s = bankrollEngine.createInitialState(cfg(2), makeRng(3));
    s = withTable(s, 2, 10);
    let deck = [...s.deck];
    deck[deck.length - 1] = 13; // outside
    s = { ...s, deck };
    s = bankrollEngine.applyAction(s, { type: 'bet', amount: 8 }, 0, makeRng(3));
    expect(s.lastEvent?.kind).toBe('lose');
    expect(s.banks[0]).toBe(START_CHIPS - 8);

    s = { ...withTable(s, 4, 9), turn: 0 }; // back to player 0's turn
    deck = [...s.deck];
    deck[deck.length - 1] = 9; // hits the post
    s = { ...s, deck };
    s = bankrollEngine.applyAction(s, { type: 'bet', amount: 8 }, 0, makeRng(3));
    expect(s.lastEvent?.kind).toBe('post');
    expect(s.banks[0]).toBe(START_CHIPS - 8 - 16);
  });

  it('passing costs a small fee and keeps the turn moving', () => {
    let s = bankrollEngine.createInitialState(cfg(2), makeRng(4));
    s = bankrollEngine.applyAction(s, { type: 'pass' }, 0, makeRng(4));
    expect(s.lastEvent?.kind).toBe('pass');
    expect(s.banks[0]).toBe(START_CHIPS - 2);
    expect(s.turn).toBe(1);
  });

  it('rejects bets larger than the bank, zero/negative bets, and acting out of turn', () => {
    const s = bankrollEngine.createInitialState(cfg(2), makeRng(5));
    expect(bankrollEngine.validate(s, { type: 'bet', amount: START_CHIPS }, 0)).toBe(true);
    expect(bankrollEngine.validate(s, { type: 'bet', amount: START_CHIPS + 1 }, 0)).toBe(false);
    expect(bankrollEngine.validate(s, { type: 'bet', amount: 0 }, 0)).toBe(false);
    expect(bankrollEngine.validate(s, { type: 'bet', amount: -3 }, 0)).toBe(false);
    expect(bankrollEngine.validate(s, { type: 'bet', amount: 5 }, 1)).toBe(false);
  });

  it('reshuffles the discard when the deck runs dry', () => {
    let s = bankrollEngine.createInitialState(cfg(2), makeRng(6));
    // 52 total: 2 on the table + 50 in the discard
    s = { ...s, deck: [], discard: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].flatMap((r) => [r, r, r, r]).slice(0, 50) };
    s = bankrollEngine.applyAction(s, { type: 'pass' }, 0, makeRng(6)); // pass draws two fresh cards
    expect(s.deck.length + s.discard.length + 2).toBe(52);
    expect(s.table).not.toBeNull();
  });

  it('ends when one player busts everyone else or the turn budget is spent', () => {
    // budget path: simulate full bot games
    for (let seed = 1; seed <= 6; seed++) {
      let s = bankrollEngine.createInitialState(cfg(3), makeRng(seed));
      const rng = makeRng(seed * 31);
      let guard = 0;
      while (!bankrollEngine.isGameOver(s) && guard++ < 500) {
        const move = bankrollEngine.chooseBotMove(s, s.turn, rng, 'medium');
        if (!move) break;
        s = bankrollEngine.applyAction(s, move, s.turn, rng);
      }
      expect(bankrollEngine.isGameOver(s)).toBe(true);
      expect(s.turnsTaken).toBeLessThanOrEqual(TURNS_PER_PLAYER * 3);
      const best = Math.max(...s.banks);
      expect(bankrollEngine.winners(s).length).toBeGreaterThanOrEqual(1);
      expect(s.banks[bankrollEngine.winners(s)[0]!]).toBe(best);
    }
  });

  it('busted players are skipped', () => {
    let s = bankrollEngine.createInitialState(cfg(3), makeRng(7));
    const banks = [...s.banks];
    banks[1] = 0;
    s = { ...s, banks, turn: 0 };
    s = bankrollEngine.applyAction(s, { type: 'pass' }, 0, makeRng(7));
    expect(s.turn).toBe(2); // seat 1 is broke — skipped
  });

  it('bots never stake more than they own and pass on awful spreads', () => {
    const s = bankrollEngine.createInitialState(cfg(2), makeRng(8));
    const rng = makeRng(8);
    for (let i = 0; i < 30; i++) {
      const st = withTable(s, 7, 8); // spread 0: only a post or outside possible
      const move = bankrollEngine.chooseBotMove(st, 0, rng, 'hard');
      expect(move).toEqual({ type: 'pass' }); // EV deeply negative
      const st2 = withTable(s, 1, 13); // spread 11: juicy
      const move2 = bankrollEngine.chooseBotMove(st2, 0, rng, 'hard') as { type: string; amount: number };
      expect(move2.type).toBe('bet');
      expect(move2.amount).toBeLessThanOrEqual(st2.banks[0]!);
      expect(move2.amount).toBeGreaterThanOrEqual(1);
    }
  });
});
