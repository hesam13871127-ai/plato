import { describe, expect, it } from 'vitest';
import { makeRng } from '../../core/rng';
import type { GameConfig } from '../../core/types';
import { canPlay, ochoEngine, type OchoState } from './engine';

function cfg(n: number): GameConfig {
  return {
    seed: 5,
    slots: Array.from({ length: n }, (_, i) => ({ id: i, kind: 'bot', name: `b${i}` })),
  };
}

function fresh(n = 2): OchoState {
  return ochoEngine.createInitialState(cfg(n), makeRng(5));
}

/** a state where the discard top is a known red 5 */
function known(): OchoState {
  const s = fresh(2);
  return {
    ...s,
    hands: [
      [
        { id: 101, color: 'red', value: '7' },
        { id: 102, color: 'blue', value: '5' },
        { id: 103, color: 'green', value: '2' },
        { id: 104, color: 'wild', value: 'wild' },
      ],
      [
        { id: 201, color: 'yellow', value: '1' },
        { id: 202, color: 'green', value: 'skip' },
      ],
    ],
    drawPile: [{ id: 300, color: 'blue', value: '9' }],
    discard: [{ id: 400, color: 'red', value: '5' }],
    activeColor: 'red',
    turn: 0,
    dir: 1,
    drewCardId: null,
    phase: 'play',
  };
}

describe('ocho engine', () => {
  it('builds a 108-card deck and deals 7 to each player', () => {
    const s = fresh(4);
    const total = s.hands.reduce((n, h) => n + h.length, 0) + s.drawPile.length + s.discard.length;
    expect(s.hands.every((h) => h.length === 7)).toBe(true);
    expect(total).toBe(108);
  });

  it('flips a number card as the first discard', () => {
    for (let seed = 1; seed < 30; seed++) {
      const s = ochoEngine.createInitialState(cfg(3), makeRng(seed));
      expect(/^[0-9]$/.test(s.discard[s.discard.length - 1]!.value)).toBe(true);
      expect(s.activeColor).toBe(s.discard[s.discard.length - 1]!.color);
    }
  });

  it('only allows matching color / value / wild plays', () => {
    const s = known();
    const legal = ochoEngine.legalActions(s, 0).filter((a) => a.type === 'play');
    const ids = legal.map((a) => (a as { cardId: number }).cardId).sort();
    expect(ids).toEqual([101, 102, 104, 104, 104, 104]); // red 7, blue 5, wild x4 colors
    // green 2 does NOT match red 5 — sanity
    expect(canPlay(s, { id: 999, color: 'green', value: '2' })).toBe(false);
  });

  it('wild plays must declare a color', () => {
    const s = known();
    expect(ochoEngine.validate(s, { type: 'play', cardId: 104 }, 0)).toBe(false);
    const after = ochoEngine.applyAction(s, { type: 'play', cardId: 104, chosenColor: 'green' }, 0, makeRng(1));
    expect(after.activeColor).toBe('green');
    expect(after.turn).toBe(1);
  });

  it('skip jumps the next player', () => {
    const s3: OchoState = {
      ...known(),
      hands: [
        [
          { id: 105, color: 'red', value: 'skip' },
          { id: 109, color: 'red', value: '3' },
        ],
        [{ id: 201, color: 'yellow', value: '1' }],
        [{ id: 202, color: 'green', value: '2' }],
      ],
      playerCount: 3,
    };
    const after = ochoEngine.applyAction(s3, { type: 'play', cardId: 105 }, 0, makeRng(1));
    expect(after.turn).toBe(2); // p1 is skipped
  });

  it('reverse acts as skip in a 2-player game', () => {
    const s = { ...known(), activeColor: 'yellow' as const };
    s.hands[0] = [
      { id: 106, color: 'yellow', value: 'reverse' },
      { id: 110, color: 'yellow', value: '2' },
    ];
    const after = ochoEngine.applyAction(s, { type: 'play', cardId: 106 }, 0, makeRng(1));
    expect(after.dir).toBe(-1);
    expect(after.turn).toBe(0); // skipped back to the same player
  });

  it('draw2 makes the victim draw two and lose their turn', () => {
    const s: OchoState = {
      ...known(),
      drawPile: [
        { id: 300, color: 'blue', value: '9' },
        { id: 301, color: 'green', value: '4' },
      ],
      hands: [
        [
          { id: 107, color: 'red', value: 'draw2' },
          { id: 111, color: 'red', value: '4' },
        ],
        [
          { id: 201, color: 'yellow', value: '1' },
          { id: 202, color: 'green', value: '2' },
        ],
      ],
    };
    const after = ochoEngine.applyAction(s, { type: 'play', cardId: 107 }, 0, makeRng(1));
    expect(after.hands[1]!.length).toBe(4);
    expect(after.turn).toBe(0); // (0 + 2) % 2
    expect(after.lastEvent?.kind).toBe('penalty');
  });

  it('drawing an unplayable card auto-passes; a playable draw may be kept (pass) or played', () => {
    // blue 9 on red 5 → not playable → turn auto-passes
    const s = known();
    const after = ochoEngine.applyAction(s, { type: 'draw' }, 0, makeRng(1));
    expect(after.hands[0]!.length).toBe(5);
    expect(after.drewCardId).toBeNull();
    expect(after.turn).toBe(1);

    // red 3 on red 5 → playable → may play it or pass
    const s2: OchoState = { ...known(), drawPile: [{ id: 301, color: 'red', value: '3' }] };
    const after2 = ochoEngine.applyAction(s2, { type: 'draw' }, 0, makeRng(1));
    expect(after2.drewCardId).toBe(301);
    expect(after2.turn).toBe(0);
    const legal = ochoEngine.legalActions(after2, 0);
    expect(legal.some((a) => a.type === 'play' && a.cardId === 301)).toBe(true);
    expect(legal.some((a) => a.type === 'pass')).toBe(true);
    const passed = ochoEngine.applyAction(after2, { type: 'pass' }, 0, makeRng(1));
    expect(passed.turn).toBe(1);
    expect(passed.drewCardId).toBeNull();
  });

  it('wins by emptying the hand and scores card points', () => {
    const s: OchoState = {
      ...known(),
      hands: [
        [{ id: 108, color: 'red', value: '5' }],
        [
          { id: 201, color: 'yellow', value: '1' }, // 1
          { id: 202, color: 'green', value: 'skip' }, // 20
          { id: 203, color: 'wild', value: 'wild4' }, // 50
        ],
      ],
    };
    const after = ochoEngine.applyAction(s, { type: 'play', cardId: 108 }, 0, makeRng(1));
    expect(ochoEngine.isGameOver(after)).toBe(true);
    expect(ochoEngine.winners(after)).toEqual([0]);
    expect(after.points).toBe(71);
  });

  it('reshuffles the discard into the draw pile when it runs dry', () => {
    let s = known();
    // make the pile nearly dry, discard big
    s = {
      ...s,
      drawPile: [],
      discard: [
        { id: 501, color: 'green', value: '3' },
        { id: 502, color: 'blue', value: '8' },
        { id: 503, color: 'red', value: '5' },
      ],
      hands: [
        s.hands[0]!,
        [
          { id: 601, color: 'yellow', value: '1' },
          { id: 602, color: 'green', value: '9' },
        ],
      ],
    };
    const after = ochoEngine.applyAction(s, { type: 'draw' }, 0, makeRng(9));
    expect(after.hands[0]!.length).toBe(5); // drew one from the reshuffled pile
    expect(after.drawPile.length).toBe(1); // 2 buried − 1 drawn
    expect(after.discard.length).toBe(1);
  });

  it('bots play a full game legally', () => {
    let s = ochoEngine.createInitialState(cfg(4), makeRng(314));
    for (let i = 0; i < 5000 && !ochoEngine.isGameOver(s); i++) {
      const turn = s.turn;
      const move = ochoEngine.chooseBotMove(s, turn, makeRng(i * 13 + 5), 'medium');
      expect(move).not.toBeNull();
      const after = ochoEngine.applyAction(s, move!, turn, makeRng(i * 7 + 1));
      expect(after).not.toBe(s);
      s = after;
    }
    expect(ochoEngine.isGameOver(s)).toBe(true);
    expect(s.points).toBeGreaterThan(0);
  });
});
