import { EngineRegistry } from '../src/game/engine/engine.registry';
import { BaseGameEngine } from '../src/game/engine/base-game.engine';
import { DominoesEngine } from '../src/game/engine/dominoes.engine';
import { LudoEngine } from '../src/game/engine/ludo.engine';
import type { GameState } from '../src/game/engine/types';

/**
 * Engine play-through suite. During the wave-by-wave rebuild every playable
 * game is driven here to completion by its own bot brain — turn-based games
 * via `chooseBotMove`, live games via `tick` — exactly the code path the
 * session service drives for real matches. This catches stuck states,
 * unhandled actions and missing AI branches without any UI or network.
 *
 * Waves register their engines in the lists below as they land.
 */

const TURN_BASED: Array<{ name: string; build: () => BaseGameEngine; players?: number }> = [
  { name: 'dominoes', build: () => new DominoesEngine() },
  { name: 'ludo', build: () => new LudoEngine() },
];

describe('turn-based game engines — full bot play-through', () => {
  for (const { name, build, players } of TURN_BASED) {
    test(`${name} reaches a completed state with a winner`, () => {
      const engine = build();
      let state = engine.createInitialState(
        makeConfig(engine, players ?? engine.maxPlayers),
      );
      const maxTurns = 4000;

      for (let turn = 0; turn < maxTurns && state.phase === 'in_progress'; turn++) {
        const seat = state.currentSeat;
        expect(seat).toBeGreaterThanOrEqual(0);
        const move = engine.chooseBotMove(state, seat, 'hard');
        const action = { ...move.action, seat };
        const validation = engine.validate(state, action);
        // The bot's own move must always be legal for the current state.
        if (!validation.ok) {
          throw new Error(
            `${name}: bot move rejected at turn ${turn}: ${validation.error} — ${JSON.stringify(action)}`,
          );
        }
        state = engine.applyAction(state, action);
      }

      expect(state.phase).toBe('completed');
      expect(
        state.winnerSeat === null ? state.winnerSeats ?? [] : [state.winnerSeat],
      ).toBeTruthy();
    });
  }
});

describe('dominoes rules', () => {
  const engine = new DominoesEngine();

  function start(players = 2): GameState {
    return engine.createInitialState(makeConfig(engine, players));
  }

  test('deals 7 tiles each to 2 players and 5 each to 3–4 players', () => {
    for (const players of [2, 3, 4]) {
      const state = start(players);
      const board = state.board as unknown as {
        hands: unknown[][];
        boneyard: unknown[];
      };
      expect(board.hands).toHaveLength(players);
      const perHand = players === 2 ? 7 : 5;
      board.hands.forEach((hand) => expect(hand).toHaveLength(perHand));
      expect(board.hands.flat().length + board.boneyard.length).toBe(28);
    }
  });

  test('seats the holder of the highest double first', () => {
    for (let i = 0; i < 25; i++) {
      const state = start(4);
      const board = state.board as unknown as {
        hands: Array<Array<{ a: number; b: number }>>;
        leadSeat: number;
      };
      let bestKey = -1;
      let bestSeat = -1;
      board.hands.forEach((hand, seat) => {
        for (const t of hand) {
          const key = t.a === t.b ? 1000 + t.a : t.a + t.b;
          if (key > bestKey) {
            bestKey = key;
            bestSeat = seat;
          }
        }
      });
      expect(state.currentSeat).toBe(bestSeat);
      expect(board.leadSeat).toBe(bestSeat);
    }
  });

  test('rejects tiles that are not in hand, do not match, or ambiguous ends', () => {
    const state = start(2);
    const board = state.board as unknown as {
      hands: Array<Array<{ a: number; b: number }>>;
      ends: { left: number; right: number } | null;
    };
    const seat = state.currentSeat;
    const hand = board.hands[seat];

    // Lead with the first tile.
    const lead = hand[0];
    expect(
      engine.validate(state, { seat, type: 'play_tile', payload: { tile: [lead.a, lead.b] } }).ok,
    ).toBe(true);
    const after = engine.applyAction(state, { seat, type: 'play_tile', payload: { tile: [lead.a, lead.b] } });

    const ends = (after.board as unknown as { ends: { left: number; right: number } }).ends;
    const nextSeat = after.currentSeat;
    const nextHand = (after.board as unknown as { hands: Array<Array<{ a: number; b: number }>> }).hands[nextSeat];

    // A tile matching neither end is rejected.
    const dead = nextHand.find((t) => t.a !== ends.left && t.a !== ends.right && t.b !== ends.left && t.b !== ends.right);
    if (dead) {
      const res = engine.validate(after, { seat: nextSeat, type: 'play_tile', payload: { tile: [dead.a, dead.b] } });
      expect(res.ok).toBe(false);
    }

    // A tile from another seat's hand is rejected.
    const foreign = (after.board as unknown as { hands: Array<Array<{ a: number; b: number }>> }).hands[
      (nextSeat + 1) % 2
    ][0];
    expect(
      engine.validate(after, { seat: nextSeat, type: 'play_tile', payload: { tile: [foreign.a, foreign.b] } }).ok,
    ).toBe(false);

    // Drawing while holding a playable tile is rejected; passing too.
    const playable = nextHand.find(
      (t) => t.a === ends.left || t.b === ends.left || t.a === ends.right || t.b === ends.right,
    );
    if (playable) {
      expect(engine.validate(after, { seat: nextSeat, type: 'draw', payload: {} }).ok).toBe(false);
      expect(engine.validate(after, { seat: nextSeat, type: 'pass', payload: {} }).ok).toBe(false);
    }
  });

  test('never leaks other hands to a seat or a spectator', () => {
    const state = start(4);
    const view1 = engine.playerView(state, 1);
    const b1 = view1.board as unknown as {
      hand: Array<[number, number]> | null;
      handSizes: number[];
      boneyard: number;
    };
    expect(b1.hand).toHaveLength(5);
    expect(b1.handSizes).toEqual([5, 5, 5, 5]);
    expect(typeof b1.boneyard).toBe('number'); // count, not the tile array

    const spectator = engine.spectatorView(state);
    const bs = spectator.board as unknown as { hand: unknown };
    expect(bs.hand).toBeNull();
  });

  test('blocked table is won by the lightest hand', () => {
    // Force a guaranteed blocked finish: empty every boneyard then pass around.
    let state = start(2);
    for (let i = 0; i < 500 && state.phase === 'in_progress'; i++) {
      const board = state.board as unknown as {
        hands: Array<Array<{ a: number; b: number }>>;
        boneyard: unknown[];
        ends: { left: number; right: number } | null;
      };
      const seat = state.currentSeat;
      const hand = board.hands[seat];
      const playable = board.ends
        ? hand.filter(
            (t) =>
              t.a === board.ends!.left ||
              t.b === board.ends!.left ||
              t.a === board.ends!.right ||
              t.b === board.ends!.right,
          )
        : hand;
      if (playable.length > 0) {
        const t = playable[0];
        const fitsLeft = board.ends ? t.a === board.ends.left || t.b === board.ends.left : false;
        const fitsRight = board.ends ? t.a === board.ends.right || t.b === board.ends.right : false;
        const needsEnd =
          board.ends && fitsLeft && fitsRight && board.ends.left !== board.ends.right;
        state = engine.applyAction(state, {
          seat,
          type: 'play_tile',
          payload: { tile: [t.a, t.b], ...(needsEnd ? { end: 'l' } : {}) },
        });
      } else if (board.boneyard.length > 0) {
        state = engine.applyAction(state, { seat, type: 'draw', payload: {} });
      } else {
        state = engine.applyAction(state, { seat, type: 'pass', payload: {} });
      }
    }
    expect(state.phase).toBe('completed');
    expect(state.winnerSeat).not.toBeNull();
  });
});

describe('ludo rules', () => {
  const engine = new LudoEngine();

  interface LudoShape {
    tokens: number[][];
    subPhase: 'roll' | 'move';
    dice: number | null;
    sixStreak: number;
    safeCells: number[];
    lastRoll: { seat: number; value: number } | null;
  }

  function freshBoard(): GameState {
    return engine.createInitialState(makeConfig(engine, 2));
  }

  /** A crafted mid-move state: seat 0 to act with the given dice. */
  function crafted(dice: number, mutate?: (b: LudoShape) => void): GameState {
    const state = freshBoard();
    const board = state.board as unknown as LudoShape;
    board.subPhase = 'move';
    board.dice = dice;
    if (mutate) mutate(board);
    return state;
  }

  test('only a six frees a yard token, and the exit lands on the start cell', () => {
    const no = crafted(5);
    expect(engine.validate(no, { seat: 0, type: 'move', payload: { token: 0 } }).ok).toBe(false);

    const yes = crafted(6);
    expect(engine.validate(yes, { seat: 0, type: 'move', payload: { token: 0 } }).ok).toBe(true);
    const moved = engine.applyAction(yes, { seat: 0, type: 'move', payload: { token: 0 } });
    const mb = moved.board as unknown as LudoShape;
    expect(mb.tokens[0][0]).toBe(1);
    expect(mb.subPhase).toBe('roll'); // the six grants another roll
  });

  test('home column needs the exact roll to finish', () => {
    const at52 = crafted(6, (b) => {
      b.tokens[0][0] = 52;
    });
    const finished = engine.applyAction(at52, { seat: 0, type: 'move', payload: { token: 0 } });
    expect((finished.board as unknown as LudoShape).tokens[0][0]).toBe(58);

    const at57 = crafted(2, (b) => {
      b.tokens[0][0] = 57;
    });
    expect(engine.validate(at57, { seat: 0, type: 'move', payload: { token: 0 } }).ok).toBe(false);
  });

  test('captures on plain cells but never on safe cells', () => {
    // Seat 0 progress 1 → ring cell 0; a roll of 1 lands on cell 1.
    // Seat 1 sits on cell 1 at progress 41: (13 + 41 - 1) % 52 = 1.
    const capture = crafted(1, (b) => {
      b.tokens[0][0] = 1;
      b.tokens[1][0] = 41;
    });
    expect((capture.board as unknown as LudoShape).safeCells.includes(1)).toBe(false);
    const moved = engine.applyAction(capture, { seat: 0, type: 'move', payload: { token: 0 } });
    const mb = moved.board as unknown as { tokens: number[][]; lastMove: { captured: number[] } };
    expect(mb.tokens[0][0]).toBe(2);
    expect(mb.tokens[1][0]).toBe(0); // sent back to the yard
    expect(mb.lastMove.captured).toEqual([1]);

    // Cell 8 is a star (safe): seat 1 rests there at progress 48.
    const safe = crafted(1, (b) => {
      b.tokens[0][0] = 8; // cell 7; +1 → cell 8
      b.tokens[1][0] = 48; // (13 + 48 - 1) % 52 = 8
    });
    expect((safe.board as unknown as LudoShape).safeCells.includes(8)).toBe(true);
    const safeMoved = engine.applyAction(safe, { seat: 0, type: 'move', payload: { token: 0 } });
    const sb = safeMoved.board as unknown as { tokens: number[][]; lastMove: { captured: number[] } };
    expect(sb.tokens[1][0]).toBe(48); // untouched on the safe cell
    expect(sb.lastMove.captured).toEqual([]);
  });

  test('a roll with no legal move passes the turn automatically', () => {
    const stuck = crafted(6, (b) => {
      b.tokens[0] = [57, 58, 58, 58];
    });
    // Convert to a roll state (subPhase must be 'roll' to roll).
    const rollState = { ...stuck, currentSeat: 0 } as GameState;
    (rollState.board as unknown as LudoShape).subPhase = 'roll';
    (rollState.board as unknown as LudoShape).dice = null;
    const after = engine.applyAction(rollState, { seat: 0, type: 'roll', payload: {} });
    // Whatever the dice, nothing can move: 57+anything>58 and no yard tokens.
    expect(after.currentSeat).toBe(1);
    expect((after.board as unknown as LudoShape).subPhase).toBe('roll');
  });

  test('three sixes in a row forfeit the turn', () => {
    const random = jest.spyOn(Math, 'random').mockReturnValue(0.99); // always a 6
    try {
      let state = freshBoard();
      const board = state.board as unknown as LudoShape;
      board.sixStreak = 2; // two sixes already on the streak
      state = engine.applyAction(state, { seat: 0, type: 'roll', payload: {} });
      expect((state.board as unknown as LudoShape).lastRoll).toEqual({ seat: 0, value: 6 });
      expect((state.board as unknown as LudoShape).sixStreak).toBe(0); // burned
      expect(state.currentSeat).toBe(1); // turn forfeited to the next seat
      expect((state.board as unknown as LudoShape).subPhase).toBe('roll');
      expect((state.board as unknown as LudoShape).dice).toBeNull();
    } finally {
      random.mockRestore();
    }
  });

  test('bringing all four tokens home wins the game', () => {
    const almost = crafted(1, (b) => {
      b.tokens[0] = [57, 58, 58, 58];
    });
    const moved = engine.applyAction(almost, { seat: 0, type: 'move', payload: { token: 0 } });
    expect(moved.phase).toBe('completed');
    expect(moved.winnerSeat).toBe(0);
    expect(moved.scores[0]).toBe(4);
  });
});

describe('engine registry', () => {
  test('registers, resolves and rejects engines cleanly', () => {
    const registry = new EngineRegistry(new DominoesEngine(), new LudoEngine());
    // The wave-1 engines are wired in via DI.
    expect(registry.slugs).toEqual(['dominoes', 'ludo']);
    expect(registry.has('dominoes')).toBe(true);
    expect(registry.get('dominoes')).toBeInstanceOf(DominoesEngine);
    expect(registry.require('ludo')).toBeInstanceOf(LudoEngine);

    // Unknown games are rejected, and extra engines can be registered on top.
    expect(registry.has('nonexistent')).toBe(false);
    expect(() => registry.require('nonexistent')).toThrow(/No engine registered/);
    registry.register(new DummyEngine());
    expect(registry.slugs).toEqual(['dominoes', 'ludo', '__dummy__']);
    expect(registry.require('__dummy__')).toBeInstanceOf(DummyEngine);
  });
});

class DummyEngine extends BaseGameEngine {
  readonly slug = '__dummy__';
  readonly minPlayers = 2;
  readonly maxPlayers = 2;
  readonly isLive = false;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  createInitialState(config: never): never {
    throw new Error('not implemented');
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  validate(state: never, action: never): never {
    throw new Error('not implemented');
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  applyAction(state: never, action: never): never {
    throw new Error('not implemented');
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  chooseBotMove(state: never, seat: number, difficulty: never): never {
    throw new Error('not implemented');
  }
}

function makeConfig(engine: BaseGameEngine, players: number) {
  return {
    matchId: `test-${engine.slug}`,
    gameSlug: engine.slug,
    seats: Array.from({ length: players }, (_, i) => ({
      playerId: `bot-${i}`,
      seatNumber: i,
      isBot: true,
      botDifficulty: 'hard' as const,
      displayName: `Bot ${i}`,
      avatarUrl: null,
    })),
    isLive: engine.isLive,
  };
}
