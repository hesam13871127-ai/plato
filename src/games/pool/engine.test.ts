import { describe, expect, it } from 'vitest';
import { makeRng } from '../../core/rng';
import type { GameConfig } from '../../core/types';
import { BALL_R, POOL_H, POOL_W, poolEngine, type Ball, type PoolState } from './engine';

const cfg: GameConfig = {
  seed: 1,
  slots: [
    { id: 0, kind: 'human', name: 'a' },
    { id: 1, kind: 'bot', name: 'b' },
  ],
};

function stateWith(balls: Ball[], overrides: Partial<PoolState> = {}): PoolState {
  const s = poolEngine.createInitialState(cfg, makeRng(1));
  return { ...s, balls, ...overrides };
}

function ball(num: number, x: number, y: number, kind: Ball['kind'] = 'solid', pocketed = false): Ball {
  return { id: num === 0 ? 'cue' : `ball-${num}`, num, kind, x, y, pocketed };
}

describe('pool engine', () => {
  it('racks 16 balls: cue + 7 solids + 7 stripes + eight', () => {
    const s = poolEngine.createInitialState(cfg, makeRng(1));
    expect(s.balls.length).toBe(16);
    expect(s.balls.filter((b) => b.kind === 'solid').length).toBe(7);
    expect(s.balls.filter((b) => b.kind === 'stripe').length).toBe(7);
    expect(s.balls.filter((b) => b.kind === 'eight').length).toBe(1);
    expect(s.balls.every((b) => !b.pocketed)).toBe(true);
    // rack rows are touching-ish and inside the table
    for (const b of s.balls) {
      expect(b.x).toBeGreaterThan(BALL_R);
      expect(b.x).toBeLessThan(POOL_W - BALL_R);
      expect(b.y).toBeGreaterThan(BALL_R);
      expect(b.y).toBeLessThan(POOL_H - BALL_R);
    }
  });

  it('a straight shot pots the target ball and keeps the turn open-assigned', () => {
    // cue (2,2) → ball 1 (5,3) → corner pocket (8,4) all on one line
    const s = stateWith([ball(0, 2, 2, 'cue'), ball(1, 5, 3, 'solid'), ball(2, 1, 3.8, 'stripe')]);
    const angle = Math.atan2(3 - 2, 5 - 2); // atan2(1,3)
    const after = poolEngine.applyAction(s, { type: 'shot', angle, power: 0.9 }, 0, makeRng(1));
    const potted = after.balls.find((b) => b.num === 1)!;
    expect(potted.pocketed).toBe(true);
    expect(after.open).toBe(false);
    expect(after.groups[0]).toBe('solid');
    expect(after.groups[1]).toBe('stripe');
    expect(after.turn).toBe(0); // potted on open table → extra turn
    expect(after.lastEvent!.foul).toBe(false);
  });

  it('a scratch is a foul: cue respotted and turn passes', () => {
    // cue alone aimed straight into the top-left corner pocket
    const s = stateWith([ball(0, 1, 1, 'cue'), ball(1, 6.5, 3.4, 'solid'), ball(9, 1.5, 3.4, 'stripe')]);
    const angle = Math.atan2(-1, -1); // toward (0,0)
    const after = poolEngine.applyAction(s, { type: 'shot', angle, power: 0.9 }, 0, makeRng(1));
    expect(after.lastEvent!.foul).toBe(true);
    expect(after.lastEvent!.reason).toBe('scratch');
    const cue = after.balls.find((b) => b.kind === 'cue')!;
    expect(cue.pocketed).toBe(false); // respotted
    expect(after.turn).toBe(1);
  });

  it('no-contact shots are fouls', () => {
    const s = stateWith([ball(0, 2, 2, 'cue'), ball(1, 6, 3, 'solid')]);
    const after = poolEngine.applyAction(s, { type: 'shot', angle: Math.PI / 2, power: 0.5 }, 0, makeRng(1)); // straight up, misses everything
    expect(after.lastEvent!.foul).toBe(true);
    expect(after.lastEvent!.reason).toBe('no-contact');
    expect(after.turn).toBe(1);
  });

  it('potting the 8 early loses the game', () => {
    const s = stateWith(
      [ball(0, 2, 2, 'cue'), ball(8, 5, 3, 'eight'), ball(3, 1, 3.5, 'solid'), ball(11, 6.8, 0.6, 'stripe')],
      { groups: ['solid', 'stripe'], open: false },
    );
    const angle = Math.atan2(3 - 2, 5 - 2);
    const after = poolEngine.applyAction(s, { type: 'shot', angle, power: 0.95 }, 0, makeRng(1));
    expect(poolEngine.isGameOver(after)).toBe(true);
    expect(poolEngine.winners(after)).toEqual([1]); // opponent wins
  });

  it('potting the 8 after clearing the group wins', () => {
    const s = stateWith(
      [ball(0, 2, 2, 'cue'), ball(8, 5, 3, 'eight'), ball(11, 1, 3.5, 'stripe')],
      { groups: ['solid', 'stripe'], open: false },
    );
    const angle = Math.atan2(3 - 2, 5 - 2);
    const after = poolEngine.applyAction(s, { type: 'shot', angle, power: 0.95 }, 0, makeRng(1));
    expect(poolEngine.isGameOver(after)).toBe(true);
    expect(poolEngine.winners(after)).toEqual([0]);
  });

  it('only the shooter’s group grants an extra turn once groups are set', () => {
    // shooter is solids; only a stripe drops → turn passes
    const s = stateWith(
      [ball(0, 2, 2, 'cue'), ball(11, 5, 3, 'stripe'), ball(3, 6.8, 0.5, 'solid')],
      { groups: ['solid', 'stripe'], open: false },
    );
    const angle = Math.atan2(3 - 2, 5 - 2);
    const after = poolEngine.applyAction(s, { type: 'shot', angle, power: 0.9 }, 0, makeRng(1));
    expect(after.balls.find((b) => b.num === 11)!.pocketed).toBe(true);
    expect(after.turn).toBe(1); // potted opponent's ball → no extra turn
  });

  it('bots always produce a valid shot and full games terminate', () => {
    let s = poolEngine.createInitialState(cfg, makeRng(3));
    for (let i = 0; i < 400 && !poolEngine.isGameOver(s); i++) {
      const move = poolEngine.chooseBotMove(s, s.turn, makeRng(i * 7 + 1), 'hard');
      expect(move).not.toBeNull();
      const after = poolEngine.applyAction(s, move!, s.turn, makeRng(1));
      expect(after).not.toBe(s);
      s = after;
    }
    expect(poolEngine.isGameOver(s)).toBe(true);
  });
});
