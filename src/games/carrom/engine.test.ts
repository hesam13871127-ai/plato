import { describe, expect, it } from 'vitest';
import { makeRng } from '../../core/rng';
import type { GameConfig } from '../../core/types';
import { BASELINE_Y, CARROM_H, CARROM_W, carromEngine, type CarromState, type Coin } from './engine';

const cfg: GameConfig = {
  seed: 1,
  slots: [
    { id: 0, kind: 'human', name: 'a' },
    { id: 1, kind: 'bot', name: 'b' },
  ],
};

function stateWith(coins: Coin[], overrides: Partial<CarromState> = {}): CarromState {
  const s = carromEngine.createInitialState(cfg, makeRng(1));
  return { ...s, coins, ...overrides };
}

function coin(kind: Coin['kind'], x: number, y: number, id: string): Coin {
  return { id, kind, x, y, pocketed: false };
}

/**
 * Geometry: striker at (strikerX, BASELINE_Y[0]); the target coin sits exactly
 * on the line from the striker to pocket (CARROM_W, CARROM_H) so a straight
 * strike pots it.
 */
const STRIKER_X = 2;
const DIR = { x: CARROM_W - STRIKER_X, y: CARROM_H - BASELINE_Y[0]! };
const DIR_LEN = Math.hypot(DIR.x, DIR.y);
const UNIT = { x: DIR.x / DIR_LEN, y: DIR.y / DIR_LEN };
const TARGET = { x: STRIKER_X + UNIT.x * 2.2, y: BASELINE_Y[0]! + UNIT.y * 2.2 };
const AIM_ANGLE = Math.atan2(DIR.y, DIR.x);

describe('carrom engine', () => {
  it('sets up 19 coins: 9 white, 9 black, 1 queen', () => {
    const s = carromEngine.createInitialState(cfg, makeRng(1));
    expect(s.coins.filter((c) => c.kind === 'white').length).toBe(9);
    expect(s.coins.filter((c) => c.kind === 'black').length).toBe(9);
    expect(s.coins.filter((c) => c.kind === 'queen').length).toBe(1);
  });

  it('a straight strike pots the coin and keeps the turn', () => {
    const s = stateWith([
      coin('white', TARGET.x, TARGET.y, 'w-target'),
      coin('white', 5.5, 1.2, 'w-far'), // not the last coin (queen still on the board)
      coin('black', 0.8, 3.4, 'b-far'),
      coin('queen', 0.7, 0.7, 'q-far'),
    ]);
    const after = carromEngine.applyAction(s, { type: 'strike', strikerX: STRIKER_X, angle: AIM_ANGLE, power: 0.95 }, 0, makeRng(1));
    expect(after.coins.find((c) => c.id === 'w-target')!.pocketed).toBe(true);
    expect(after.turn).toBe(0); // potted own coin → extra turn
    expect(after.lastEvent!.foul).toBe(false);
  });

  it('potting the queen sets a pending cover and keeps the turn', () => {
    const s = stateWith([
      coin('queen', TARGET.x, TARGET.y, 'q-target'),
      coin('white', 5.5, 1.2, 'w-far'),
      coin('black', 0.8, 3.4, 'b-far'),
    ]);
    const after = carromEngine.applyAction(s, { type: 'strike', strikerX: STRIKER_X, angle: AIM_ANGLE, power: 0.95 }, 0, makeRng(1));
    expect(after.coins.find((c) => c.id === 'q-target')!.pocketed).toBe(true);
    expect(after.queenPendingBy).toBe(0);
    expect(after.turn).toBe(0); // potting the queen grants the cover stroke
  });

  it('covering the queen with an own coin settles her', () => {
    const s: CarromState = stateWith(
      [
        { id: 'q', kind: 'queen', x: 3, y: 3, pocketed: true },
        coin('white', TARGET.x, TARGET.y, 'w-cover'),
        coin('black', 0.8, 3.4, 'b-far'),
      ],
      { queenPendingBy: 0 },
    );
    const after = carromEngine.applyAction(s, { type: 'strike', strikerX: STRIKER_X, angle: AIM_ANGLE, power: 0.95 }, 0, makeRng(1));
    expect(after.coins.find((c) => c.id === 'w-cover')!.pocketed).toBe(true);
    expect(after.queenPendingBy).toBeNull();
    expect(after.queenOff).toBe(true);
    expect(after.lastEvent!.queenCovered).toBe(true);
  });

  it('failing to cover returns the queen to the center', () => {
    const s: CarromState = stateWith(
      [
        { id: 'q-gone', kind: 'queen', x: 3, y: 3, pocketed: true },
        coin('white', 5.2, 3, 'w-far'),
        coin('black', 1.5, 4, 'b-far'),
      ],
      { queenPendingBy: 0 },
    );
    // strike straight along the baseline, missing everything
    const after = carromEngine.applyAction(s, { type: 'strike', strikerX: 1.2, angle: 0, power: 0.3 }, 0, makeRng(1));
    const queen = after.coins.find((c) => c.kind === 'queen')!;
    expect(queen.pocketed).toBe(false); // returned to the center
    expect(after.queenPendingBy).toBeNull();
    expect(after.lastEvent!.queenReturned).toBe(true);
    expect(after.turn).toBe(1);
  });

  it('a striker scratch is a foul and passes the turn', () => {
    const s = stateWith([coin('white', 4.5, 3.2, 'w-x'), coin('black', 1.5, 4.5, 'b-x')]);
    // strike the striker toward the bottom-left corner jaw
    const angle = Math.atan2(0.1 - BASELINE_Y[0]!, 0 - 1.2);
    const after = carromEngine.applyAction(s, { type: 'strike', strikerX: 1.2, angle, power: 0.6 }, 0, makeRng(1));
    expect(after.lastEvent!.foul).toBe(true);
    expect(after.lastEvent!.reason).toBe('striker');
    expect(after.turn).toBe(1);
  });

  it('wins when the last own coin drops after the queen is settled', () => {
    const s: CarromState = stateWith(
      [
        { id: 'q', kind: 'queen', x: 3, y: 3, pocketed: true },
        coin('white', TARGET.x, TARGET.y, 'w-last'),
        coin('black', 0.8, 3.4, 'b-far'),
      ],
      { queenOff: true },
    );
    const after = carromEngine.applyAction(s, { type: 'strike', strikerX: STRIKER_X, angle: AIM_ANGLE, power: 0.95 }, 0, makeRng(1));
    expect(after.coins.find((c) => c.id === 'w-last')!.pocketed).toBe(true);
    expect(carromEngine.isGameOver(after)).toBe(true);
    expect(carromEngine.winners(after)).toEqual([0]);
  });

  it('bots finish a full legal game', () => {
    let s = carromEngine.createInitialState(cfg, makeRng(11));
    for (let i = 0; i < 600 && !carromEngine.isGameOver(s); i++) {
      const move = carromEngine.chooseBotMove(s, s.turn, makeRng(i * 5 + 1), 'hard');
      expect(move).not.toBeNull();
      const after = carromEngine.applyAction(s, move!, s.turn, makeRng(1));
      expect(after).not.toBe(s);
      s = after;
    }
    expect(carromEngine.isGameOver(s)).toBe(true);
    expect(carromEngine.winners(s).length).toBe(1);
  });
});
