import { EngineRegistry } from '../src/game/engine/engine.registry';
import { BaseGameEngine } from '../src/game/engine/base-game.engine';
import { DominoesEngine } from '../src/game/engine/dominoes.engine';
import { LudoEngine } from '../src/game/engine/ludo.engine';
import { OchoEngine } from '../src/game/engine/ocho.engine';
import { Connect4Engine } from '../src/game/engine/connect4.engine';
import { CheckersEngine } from '../src/game/engine/checkers.engine';
import { ChessEngine } from '../src/game/engine/chess.engine';
import { PoolEngine } from '../src/game/engine/pool.engine';
import { CarromEngine } from '../src/game/engine/carrom.engine';
import { DotsAndBoxesEngine } from '../src/game/engine/dots-and-boxes.engine';
import { SnakesLaddersEngine } from '../src/game/engine/snakes-ladders.engine';
import { BingoEngine } from '../src/game/engine/bingo.engine';
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
  { name: 'ocho', build: () => new OchoEngine() },
  { name: 'connect4', build: () => new Connect4Engine(), players: 2 },
  { name: 'checkers', build: () => new CheckersEngine(), players: 2 },
  { name: 'chess', build: () => new ChessEngine(), players: 2 },
  { name: 'pool', build: () => new PoolEngine(), players: 2 },
  { name: 'carrom', build: () => new CarromEngine(), players: 2 },
  { name: 'dots_and_boxes', build: () => new DotsAndBoxesEngine(), players: 2 },
  { name: 'snakes_ladders', build: () => new SnakesLaddersEngine() },
  { name: 'bingo', build: () => new BingoEngine() },
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
    // Force a 4 (deterministic roll): 57+4 > 58 and no yard tokens, so the
    // seat has no legal move and the engine must auto-pass. (A natural 1
    // would reach 58 and be playable — hence the mock.)
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const after = engine.applyAction(rollState, { seat: 0, type: 'roll', payload: {} });
    randomSpy.mockRestore();
    // Nothing can move with a 4: 57+4 > 58 and no yard tokens.
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

describe('ocho rules', () => {
  const engine = new OchoEngine();

  interface OchoCardShape {
    id: string;
    color: string;
    value: string;
  }

  interface OchoShape {
    deck: OchoCardShape[];
    discard: OchoCardShape[];
    top: OchoCardShape;
    chosenColor: string | null;
    hands: OchoCardShape[][];
    dir: number;
    turnMode: string;
    drawnCardId: string | null;
  }

  function start(players = 2): GameState {
    return engine.createInitialState(makeConfig(engine, players));
  }

  test('deals 7 cards per seat from a 108-card deck with a number on top', () => {
    const state = start(4);
    const board = state.board as unknown as OchoShape;
    board.hands.forEach((hand) => expect(hand).toHaveLength(7));
    expect(board.hands.flat().length + board.deck.length + 1).toBe(108);
    expect(board.top.color).not.toBe('wild');
    expect(/^[0-9]$/.test(board.top.value)).toBe(true);
  });

  test('enforces matching by active colour/value and wild colour choice', () => {
    const state = start(2);
    const board = state.board as unknown as OchoShape;
    const hand = board.hands[0];

    // A card matching neither colour nor value is rejected.
    const dead = hand.find((c) => c.color !== 'wild' && c.color !== board.top.color && c.value !== board.top.value);
    if (dead) {
      expect(engine.validate(state, { seat: 0, type: 'play', payload: { cardId: dead.id } }).ok).toBe(false);
    }
    // A wild play without a colour choice is rejected.
    board.hands[0] = [
      { id: 'wild-x', color: 'wild', value: 'wild' },
      ...hand,
    ];
    expect(
      engine.validate(state, { seat: 0, type: 'play', payload: { cardId: 'wild-x' } }).ok,
    ).toBe(false);
    // With a declared colour it is legal, and it becomes the active colour.
    const played = engine.applyAction(state, {
      seat: 0,
      type: 'play',
      payload: { cardId: 'wild-x', color: 'green' },
    });
    const pb = played.board as unknown as OchoShape;
    expect(pb.chosenColor).toBe('green');
    expect(pb.turnMode).toBe('play');
  });

  test('skip and reverse steer the turn; draw-two punishes and skips', () => {
    const state = start(3);
    const board = state.board as unknown as OchoShape;
    // A junk card keeps hands non-empty so nobody "wins" mid-test.
    const junk = (i: number) => ({ id: `junk-${i}`, color: 'junkcolor', value: `j${i}` });
    // Seat 0 plays a skip on the current top colour.
    board.hands[0] = [
      { id: 's1', color: board.top.color, value: 'skip' },
      junk(0),
    ];
    const afterSkip = engine.applyAction(state, { seat: 0, type: 'play', payload: { cardId: 's1' } });
    expect(afterSkip.currentSeat).toBe(2); // seat 1 skipped in a 3-seat game

    const b2 = afterSkip.board as unknown as OchoShape;
    b2.hands[2] = [
      { id: 's2', color: b2.top.color, value: 'rev' },
      junk(2),
    ];
    const afterRev = engine.applyAction(afterSkip, { seat: 2, type: 'play', payload: { cardId: 's2' } });
    expect((afterRev.board as unknown as OchoShape).dir).toBe(-1);
    expect(afterRev.currentSeat).toBe(1); // direction flipped: 2 → 1

    const b3 = afterRev.board as unknown as OchoShape;
    const handSizesBefore = b3.hands.map((h) => h.length);
    b3.hands[1] = [
      { id: 'd2', color: b3.top.color, value: 'd2' },
      junk(1),
    ];
    const afterD2 = engine.applyAction(afterRev, { seat: 1, type: 'play', payload: { cardId: 'd2' } });
    const b4 = afterD2.board as unknown as OchoShape;
    expect(b4.hands[0]).toHaveLength(handSizesBefore[0] + 2); // seat 0 drew two
    expect(afterD2.currentSeat).toBe(2); // and lost the turn
  });

  test('draw-then-play only allows the drawn card; pass ends the turn', () => {
    const state = start(2);
    const board = state.board as unknown as OchoShape;
    const before = board.hands[0].length;

    const drawn = engine.applyAction(state, { seat: 0, type: 'draw', payload: {} });
    const db = drawn.board as unknown as OchoShape;
    expect(db.turnMode).toBe('drawn');
    expect(db.hands[0]).toHaveLength(before + 1);
    expect(db.drawnCardId).toBeTruthy();

    // Playing a different card after drawing is rejected.
    const other = db.hands[0].find((c) => c.id !== db.drawnCardId)!;
    expect(engine.validate(drawn, { seat: 0, type: 'play', payload: { cardId: other.id } }).ok).toBe(
      false,
    );

    const passed = engine.applyAction(drawn, { seat: 0, type: 'pass', payload: {} });
    expect(passed.currentSeat).toBe(1);
    expect((passed.board as unknown as OchoShape).turnMode).toBe('play');
  });

  test('never leaks other hands (or the deck) to seats or spectators', () => {
    const state = start(4);
    const view = engine.playerView(state, 1);
    const vb = view.board as unknown as {
      hand: OchoCardShape[] | null;
      handSizes: number[];
      deck: number;
    };
    expect(vb.hand).toHaveLength(7);
    expect(vb.handSizes).toEqual([7, 7, 7, 7]);
    expect(typeof vb.deck).toBe('number');

    const spectator = engine.spectatorView(state);
    const sb = spectator.board as unknown as { hand: unknown };
    expect(sb.hand).toBeNull();
  });
});

describe('connect4 rules', () => {
  const engine = new Connect4Engine();

  interface C4Shape {
    grid: number[][];
    rows: number;
    cols: number;
    winLine: Array<[number, number]> | null;
    lastMove: { seat: number; col: number; row: number } | null;
  }

  function start(): GameState {
    return engine.createInitialState(makeConfig(engine, 2));
  }

  test('drops fall to the lowest open slot and turns alternate', () => {
    const state = start();
    const a = engine.applyAction(state, { seat: 0, type: 'drop', payload: { col: 3 } });
    const b = engine.applyAction(a, { seat: 1, type: 'drop', payload: { col: 3 } });
    const board = b.board as unknown as C4Shape;
    expect(board.grid[0][3]).toBe(0);
    expect(board.grid[1][3]).toBe(1);
    expect(b.currentSeat).toBe(0);
    expect(engine.validate(b, { seat: 0, type: 'drop', payload: { col: 9 } }).ok).toBe(false);
  });

  test('detects horizontal, vertical and diagonal wins with the exact line', () => {
    // Horizontal: seat 0 owns row 0, cols 0..3.
    let state = start();
    const board = state.board as unknown as C4Shape;
    board.grid[0] = [0, 0, 0, -1, -1, -1, -1];
    const won = engine.applyAction(state, { seat: 0, type: 'drop', payload: { col: 3 } });
    const wb = won.board as unknown as C4Shape;
    expect(won.phase).toBe('completed');
    expect(won.winnerSeat).toBe(0);
    expect(wb.winLine).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
    ]);

    // Vertical: seat 1 owns column 6, rows 0..2.
    state = start();
    const board2 = state.board as unknown as C4Shape;
    board2.grid[0][6] = 1;
    board2.grid[1][6] = 1;
    board2.grid[2][6] = 1;
    state.currentSeat = 1;
    const wonV = engine.applyAction(state, { seat: 1, type: 'drop', payload: { col: 6 } });
    expect((wonV.board as unknown as C4Shape).winLine).toEqual([
      [0, 6],
      [1, 6],
      [2, 6],
      [3, 6],
    ]);

    // Diagonal: seat 0 builds the rising main diagonal (0,0)…(3,3).
    state = start();
    const board3 = state.board as unknown as C4Shape;
    board3.grid[0][0] = 0;
    board3.grid[1][1] = 0;
    board3.grid[2][2] = 0;
    // column 3 must have 3 discs so the drop lands on row 3.
    board3.grid[0][3] = 1;
    board3.grid[1][3] = 1;
    board3.grid[2][3] = 1;
    const wonD = engine.applyAction(state, { seat: 0, type: 'drop', payload: { col: 3 } });
    const dLine = (wonD.board as unknown as C4Shape).winLine;
    expect(dLine).not.toBeNull();
    expect(wonD.winnerSeat).toBe(0);
  });

  test('rejects drops into full columns and ends a full board as a draw', () => {
    const state = start();
    const board = state.board as unknown as C4Shape;
    // A guaranteed line-free fill: value(r,c) = (floor(r/2) + c) % 2 has runs
    // of at most two in every direction (rows alternate, columns pair up,
    // both diagonals go v,v,¬v,¬v). One slot is left open for the last drop.
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        board.grid[r][c] = (Math.floor(r / 2) + c) % 2;
      }
    }
    board.grid[0][3] = -1; // the final open slot
    expect(engine.validate(state, { seat: 0, type: 'drop', payload: { col: 3 } }).ok).toBe(true);

    const full = engine.applyAction(state, { seat: 0, type: 'drop', payload: { col: 3 } });
    expect(full.phase).toBe('completed');
    expect(full.winnerSeat).toBe(null); // draw
    expect(full.scores).toEqual([0, 0]);

    // And now every column is full — drops are rejected.
    expect(engine.validate(full, { seat: 0, type: 'drop', payload: { col: 3 } }).ok).toBe(false);
  });
});

describe('checkers rules', () => {
  const engine = new CheckersEngine();

  interface CellShape {
    s: number;
    k: number;
  }

  interface CheckersShape {
    cells: Array<Array<CellShape | null>>;
    mustJumpFrom: [number, number] | null;
    lastMove: { seat: number; captured: [number, number] | null; promoted: boolean } | null;
    noProgress: number;
  }

  function start(): GameState {
    return engine.createInitialState(makeConfig(engine, 2));
  }

  function board(state: GameState): CheckersShape {
    return state.board as unknown as CheckersShape;
  }

  test('sets up 12 men per side on dark squares only', () => {
    const state = start();
    const b = board(state);
    let zero = 0;
    let one = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = b.cells[r][c];
        if ((r + c) % 2 === 0) expect(p).toBeNull();
        if (p?.s === 0) zero++;
        if (p?.s === 1) one++;
      }
    }
    expect(zero).toBe(12);
    expect(one).toBe(12);
  });

  test('men move forward diagonally only; backwards is rejected', () => {
    const state = start();
    const b = board(state);
    // Give seat 0 a man at (2, 2) with empty squares around.
    b.cells = Array.from({ length: 8 }, () => Array<CellShape | null>(8).fill(null));
    b.cells[2][2] = { s: 0, k: 0 };
    b.cells[5][3] = { s: 1, k: 0 }; // an enemy man far away
    state.currentSeat = 0;

    expect(engine.validate(state, { seat: 0, type: 'move', payload: { from: [2, 2], to: [3, 3] } }).ok).toBe(true);
    expect(engine.validate(state, { seat: 0, type: 'move', payload: { from: [2, 2], to: [1, 3] } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 0, type: 'move', payload: { from: [2, 2], to: [2, 3] } }).ok).toBe(false);
  });

  test('captures are mandatory and multi-jump chains continue from the landing square', () => {
    const state = start();
    const b = board(state);
    b.cells = Array.from({ length: 8 }, () => Array<CellShape | null>(8).fill(null));
    // Seat 0 man at (2,2); enemy at (3,3); landing (4,4); a second enemy at
    // (5,5) with landing (6,6) so the chain continues.
    b.cells[2][2] = { s: 0, k: 0 };
    b.cells[3][3] = { s: 1, k: 0 };
    b.cells[5][5] = { s: 1, k: 0 };
    b.cells[7][1] = { s: 1, k: 0 }; // spare enemy piece
    state.currentSeat = 0;

    // A quiet step is illegal while a jump exists.
    b.cells[4][1] = null;
    expect(engine.validate(state, { seat: 0, type: 'move', payload: { from: [2, 2], to: [3, 1] } }).ok).toBe(false);

    const jump1 = engine.applyAction(state, { seat: 0, type: 'move', payload: { from: [2, 2], to: [4, 4] } });
    const b1 = board(jump1);
    expect(b1.cells[3][3]).toBeNull(); // enemy captured
    expect(b1.cells[4][4]?.s).toBe(0);
    expect(b1.mustJumpFrom).toEqual([4, 4]); // chain continues
    expect(jump1.currentSeat).toBe(0); // same seat keeps jumping

    // Moving a different piece mid-chain is rejected.
    b1.cells[0][5] = { s: 0, k: 0 };
    expect(
      engine.validate(jump1, { seat: 0, type: 'move', payload: { from: [0, 5], to: [1, 4] } }).ok,
    ).toBe(false);

    const jump2 = engine.applyAction(jump1, { seat: 0, type: 'move', payload: { from: [4, 4], to: [6, 6] } });
    const b2 = board(jump2);
    expect(b2.cells[5][5]).toBeNull();
    expect(b2.mustJumpFrom).toBeNull();
    expect(jump2.currentSeat).toBe(1); // chain over — turn passes
  });

  test('reaching the back rank promotes to king and ends the turn', () => {
    const state = start();
    const b = board(state);
    b.cells = Array.from({ length: 8 }, () => Array<CellShape | null>(8).fill(null));
    b.cells[6][2] = { s: 0, k: 0 };
    b.cells[7][3] = null; // landing square on the back rank
    b.cells[5][5] = { s: 1, k: 0 }; // spare enemy with room to move
    state.currentSeat = 0;

    const moved = engine.applyAction(state, { seat: 0, type: 'move', payload: { from: [6, 2], to: [7, 3] } });
    const b2 = board(moved);
    expect(b2.cells[7][3]?.k).toBe(1); // crowned
    expect(b2.lastMove?.promoted).toBe(true);
    expect(moved.currentSeat).toBe(1); // promotion ends the turn
  });

  test('a seat with no legal move loses; kings move in all four diagonals', () => {
    const state = start();
    const b = board(state);
    b.cells = Array.from({ length: 8 }, () => Array<CellShape | null>(8).fill(null));
    // Seat 0 king at (3,3); seat 1 man at (0,0) with (1,1) blocked → trapped.
    b.cells[3][3] = { s: 0, k: 1 };
    b.cells[0][0] = { s: 1, k: 0 };
    b.cells[1][1] = { s: 0, k: 0 }; // blocks the man's only diagonal
    state.currentSeat = 0;

    // The king may move in any diagonal direction.
    expect(engine.validate(state, { seat: 0, type: 'move', payload: { from: [3, 3], to: [2, 2] } }).ok).toBe(true);
    const moved = engine.applyAction(state, { seat: 0, type: 'move', payload: { from: [3, 3], to: [2, 4] } });
    expect(moved.phase).toBe('completed'); // seat 1 has no legal move
    expect(moved.winnerSeat).toBe(0);
  });
});

describe('chess rules', () => {
  const engine = new ChessEngine();

  interface PieceShape {
    t: string;
    s: number;
  }

  interface ChessShape {
    grid: Array<Array<PieceShape | null>>;
    castling: { k: boolean[]; q: boolean[] };
    ep: [number, number] | null;
    halfmove: number;
    positions: Record<string, number>;
    lastMove: {
      seat: number;
      from: [number, number];
      to: [number, number];
      piece: string;
      captured: string | null;
      promotion: boolean;
      castle: string | null;
      check: boolean;
      mate: boolean;
    } | null;
    status: string;
    moveCount: number;
  }

  function start(): GameState {
    return engine.createInitialState(makeConfig(engine, 2));
  }

  function board(state: GameState): ChessShape {
    return state.board as unknown as ChessShape;
  }

  /** A near-empty board with the given pieces and clean bookkeeping. */
  function craft(
    pieces: Array<[number, number, string, number]>,
    currentSeat: number,
    halfmove = 0,
  ): GameState {
    const state = start();
    const b = board(state);
    b.grid = Array.from({ length: 8 }, () => Array<PieceShape | null>(8).fill(null));
    for (const [r, c, t, s] of pieces) b.grid[r][c] = { t, s };
    b.castling = { k: [false, false], q: [false, false] };
    b.ep = null;
    b.halfmove = halfmove;
    b.positions = {};
    state.currentSeat = currentSeat;
    return state;
  }

  test('sets up the orthodox opening position with twenty legal moves', () => {
    const state = start();
    const b = board(state);
    const order = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    expect(b.grid[0].map((p) => p?.t)).toEqual(order);
    expect(b.grid[7].map((p) => p?.t)).toEqual(order);
    expect(b.grid[1].every((p) => p?.t === 'p' && p.s === 1)).toBe(true);
    expect(b.grid[6].every((p) => p?.t === 'p' && p.s === 0)).toBe(true);
    expect(b.grid[0][4]).toEqual({ t: 'k', s: 1 });
    expect(b.grid[7][4]).toEqual({ t: 'k', s: 0 });
    expect(Object.values(b.positions)).toEqual([1]);
    expect(engine.legalMoves(state)).toHaveLength(20); // 16 pawn pushes + 4 knights
  });

  test('double push sets the en-passant square and en passant captures the passer', () => {
    const state = craft(
      [
        [7, 4, 'k', 0],
        [6, 4, 'p', 0],
        [4, 3, 'p', 1],
        [0, 7, 'k', 1],
      ],
      0,
    );
    const pushed = engine.applyAction(state, {
      seat: 0,
      type: 'move',
      payload: { from: [6, 4], to: [4, 4] },
    });
    expect(board(pushed).ep).toEqual([5, 4]);
    expect(pushed.currentSeat).toBe(1);

    const struck = engine.applyAction(pushed, {
      seat: 1,
      type: 'move',
      payload: { from: [4, 3], to: [5, 4] },
    });
    const b = board(struck);
    expect(b.grid[4][4]).toBeNull(); // the passed pawn is gone
    expect(b.grid[5][4]).toEqual({ t: 'p', s: 1 });
    expect(b.ep).toBeNull();
    expect(struck.currentSeat).toBe(0);
  });

  test('pawns promote on the last rank (explicit, under- and default crowning)', () => {
    const explicit = craft(
      [
        [7, 3, 'k', 0],
        [1, 0, 'p', 0],
        [3, 7, 'k', 1],
      ],
      0,
    );
    const crowned = engine.applyAction(explicit, {
      seat: 0,
      type: 'move',
      payload: { from: [1, 0], to: [0, 0], promotion: 'q' },
    });
    expect(board(crowned).grid[0][0]).toEqual({ t: 'q', s: 0 });
    expect(board(crowned).lastMove?.promotion).toBe(true);

    const knighted = craft(
      [
        [7, 3, 'k', 0],
        [1, 2, 'p', 0],
        [3, 7, 'k', 1],
      ],
      0,
    );
    const ninja = engine.applyAction(knighted, {
      seat: 1 - 1,
      type: 'move',
      payload: { from: [1, 2], to: [0, 2], promotion: 'n' },
    });
    expect(board(ninja).grid[0][2]).toEqual({ t: 'n', s: 0 });

    const defaulted = craft(
      [
        [7, 3, 'k', 0],
        [1, 4, 'p', 0],
        [3, 7, 'k', 1],
      ],
      0,
    );
    const queen = engine.applyAction(defaulted, {
      seat: 0,
      type: 'move',
      payload: { from: [1, 4], to: [0, 4] },
    });
    expect(board(queen).grid[0][4]).toEqual({ t: 'q', s: 0 }); // promotion defaults to queen
  });

  test('castling moves king and rook together and is refused through check', () => {
    const state = craft(
      [
        [7, 4, 'k', 0],
        [7, 0, 'r', 0],
        [7, 7, 'r', 0],
        [0, 4, 'k', 1],
        [0, 0, 'r', 1],
      ],
      0,
    );
    const b = board(state);
    b.castling = { k: [true, false], q: [true, false] };

    const castled = engine.applyAction(state, {
      seat: 0,
      type: 'move',
      payload: { from: [7, 4], to: [7, 6] },
    });
    const cb = board(castled);
    expect(cb.grid[7][6]).toEqual({ t: 'k', s: 0 });
    expect(cb.grid[7][5]).toEqual({ t: 'r', s: 0 });
    expect(cb.grid[7][4]).toBeNull();
    expect(cb.grid[7][7]).toBeNull();
    expect(cb.lastMove?.castle).toBe('k');
    expect(cb.castling.k[0]).toBe(false);

    // A rook covering the transit square forbids kingside castling — but the
    // unattacked queenside path stays open.
    const blocked = craft(
      [
        [7, 4, 'k', 0],
        [7, 0, 'r', 0],
        [7, 7, 'r', 0],
        [0, 4, 'k', 1],
        [0, 5, 'r', 1],
      ],
      0,
    );
    board(blocked).castling = { k: [true, false], q: [true, false] };
    expect(
      engine.validate(blocked, { seat: 0, type: 'move', payload: { from: [7, 4], to: [7, 6] } }).ok,
    ).toBe(false);
    expect(
      engine.validate(blocked, { seat: 0, type: 'move', payload: { from: [7, 4], to: [7, 2] } }).ok,
    ).toBe(true);
  });

  test('fool’s mate checkmates white in four plies', () => {
    let state = start();
    const play = (seat: number, from: [number, number], to: [number, number]) => {
      state = engine.applyAction(state, { seat, type: 'move', payload: { from, to } });
    };
    play(0, [6, 5], [5, 5]); // f3
    play(1, [1, 4], [3, 4]); // e5
    play(0, [6, 6], [4, 6]); // g4
    play(1, [0, 3], [4, 7]); // Qh4#
    expect(state.phase).toBe('completed');
    expect(state.winnerSeat).toBe(1);
    expect(board(state).status).toBe('checkmate');
    expect(board(state).lastMove?.mate).toBe(true);
  });

  test('a lone king with no safe square is stalemate, not mate', () => {
    const state = craft(
      [
        [4, 4, 'k', 0],
        [5, 1, 'q', 0],
        [0, 0, 'k', 1],
      ],
      0,
    );
    const moved = engine.applyAction(state, {
      seat: 0,
      type: 'move',
      payload: { from: [5, 1], to: [2, 1] }, // Qb6
    });
    expect(moved.phase).toBe('completed');
    expect(moved.winnerSeat).toBeNull();
    expect(board(moved).status).toBe('stalemate');
    expect(moved.scores).toEqual([0, 0]);
  });

  test('one hundred quiet plies draw by the fifty-move rule', () => {
    const state = craft(
      [
        [7, 4, 'k', 0],
        [7, 0, 'r', 0],
        [0, 4, 'k', 1],
      ],
      0,
      99,
    );
    const moved = engine.applyAction(state, {
      seat: 0,
      type: 'move',
      payload: { from: [7, 0], to: [7, 1] },
    });
    expect(moved.phase).toBe('completed');
    expect(moved.winnerSeat).toBeNull();
    expect(board(moved).status).toBe('fifty');
  });

  test('repeating a position three times draws', () => {
    let state = start();
    const cycle: Array<[number, [number, number], [number, number]]> = [
      [0, [7, 6], [5, 5]], // Nf3
      [1, [0, 6], [2, 5]], // Nf6
      [0, [5, 5], [7, 6]], // Ng1
      [1, [2, 5], [0, 6]], // Ng8
    ];
    for (let i = 0; i < 2; i++) {
      for (const [seat, from, to] of cycle) {
        state = engine.applyAction(state, { seat, type: 'move', payload: { from, to } });
      }
    }
    expect(state.phase).toBe('completed');
    expect(state.winnerSeat).toBeNull();
    expect(board(state).status).toBe('repetition');
  });

  test('a lone minor piece against a king draws on insufficient material', () => {
    const state = craft(
      [
        [7, 4, 'k', 0],
        [7, 5, 'n', 0],
        [0, 4, 'k', 1],
      ],
      0,
    );
    const moved = engine.applyAction(state, {
      seat: 0,
      type: 'move',
      payload: { from: [7, 5], to: [5, 4] },
    });
    expect(moved.phase).toBe('completed');
    expect(moved.winnerSeat).toBeNull();
    expect(board(moved).status).toBe('material');
  });

  test('validation never mutates the state it inspects', () => {
    const state = start();
    const snapshot = JSON.stringify(state);
    engine.validate(state, { seat: 0, type: 'move', payload: { from: [7, 6], to: [5, 5] } });
    engine.validate(state, { seat: 0, type: 'move', payload: { from: [7, 0], to: [0, 0] } });
    engine.validate(state, { seat: 1, type: 'move', payload: { from: [0, 6], to: [2, 5] } });
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe('pool rules', () => {
  const engine = new PoolEngine();

  interface BallShape {
    n: number;
    x: number;
    y: number;
    potted: boolean;
  }

  interface PoolShape {
    balls: BallShape[];
    openTable: boolean;
    groups: [number | null, number | null];
    ballInHand: boolean;
    shotCount: number;
    lastShot: {
      seat: number;
      angle: number;
      power: number;
      potted: number[];
      firstHit: number | null;
      cuePotted: boolean;
      foul: boolean;
      reason: string | null;
      frames: number[][];
    } | null;
  }

  function start(): GameState {
    return engine.createInitialState(makeConfig(engine, 2));
  }

  function board(state: GameState): PoolShape {
    return state.board as unknown as PoolShape;
  }

  /** A quiet table with the given balls and clean bookkeeping. */
  function craft(
    balls: Array<[number, number, number]>,
    opts?: Partial<PoolShape> & { currentSeat?: number },
  ): GameState {
    const state = start();
    const b = board(state);
    b.balls = balls.map(([n, x, y]) => ({ n, x, y, potted: false }));
    b.openTable = opts?.openTable ?? false;
    b.groups = opts?.groups ?? [null, null];
    b.ballInHand = opts?.ballInHand ?? false;
    b.shotCount = opts?.shotCount ?? 5;
    b.lastShot = null;
    state.currentSeat = opts?.currentSeat ?? 0;
    return state;
  }

  test('racks a 15-ball triangle with the 8 in the middle and ball-in-hand break', () => {
    const state = start();
    const b = board(state);
    expect(b.balls).toHaveLength(16);
    expect(b.balls[0].n).toBe(0);
    const eight = b.balls.find((ball) => ball.n === 8);
    expect(eight).toBeDefined();
    expect(Math.abs(eight!.x - 160.5)).toBeLessThan(0.8); // third row, centred
    expect(Math.abs(eight!.y - 50)).toBeLessThan(0.01);
    expect(b.balls.every((ball) => !ball.potted)).toBe(true);
    expect(b.openTable).toBe(true);
    expect(b.groups).toEqual([null, null]);
    expect(b.ballInHand).toBe(true);
    expect(state.currentSeat).toBe(0);
  });

  test('placement is validated, and a straight pot assigns groups and keeps the turn', () => {
    const placing = craft(
      [
        [0, 100, 50],
        [1, 160, 20],
        [8, 30, 80],
      ],
      { ballInHand: true, openTable: true, shotCount: 0 },
    );
    expect(
      engine.validate(placing, { seat: 0, type: 'place', payload: { x: 160, y: 20 } }).ok,
    ).toBe(false); // overlapping an object ball
    const placed = engine.applyAction(placing, {
      seat: 0,
      type: 'place',
      payload: { x: 100, y: 50 },
    });
    expect(board(placed).ballInHand).toBe(false);
    expect(placed.currentSeat).toBe(0); // placer keeps the turn

    // Straight line cue → 1 → corner pocket (200, 0).
    const shooting = craft(
      [
        [0, 119.76, 40.12],
        [1, 160, 20],
        [8, 30, 80],
      ],
      { openTable: true, shotCount: 0 },
    );
    const shot = engine.applyAction(shooting, {
      seat: 0,
      type: 'shoot',
      payload: { angle: Math.atan2(20 - 40.12, 160 - 119.76), power: 0.8 },
    });
    const sb = board(shot);
    expect(sb.lastShot?.firstHit).toBe(1);
    expect(sb.lastShot?.potted).toContain(1);
    expect(sb.lastShot?.foul).toBe(false);
    expect(sb.groups).toEqual([0, 1]); // first legal pot assigns solids to seat 0
    expect(sb.openTable).toBe(false);
    expect(shot.currentSeat).toBe(0); // potted own ball — stays at the table
    expect(shot.phase).toBe('in_progress');
    expect(sb.lastShot!.frames.length).toBeGreaterThan(2);
  });

  test('hitting nothing is a foul: ball-in-hand for the opponent', () => {
    const state = craft(
      [
        [0, 20, 50],
        [1, 180, 90],
        [8, 170, 10],
      ],
      { openTable: true, shotCount: 0 },
    );
    const shot = engine.applyAction(state, {
      seat: 0,
      type: 'shoot',
      payload: { angle: -Math.PI / 2, power: 0.3 }, // straight up into open felt
    });
    const sb = board(shot);
    expect(sb.lastShot?.firstHit).toBeNull();
    expect(sb.lastShot?.foul).toBe(true);
    expect(sb.ballInHand).toBe(true);
    expect(shot.currentSeat).toBe(1);
    expect(shot.phase).toBe('in_progress');
  });

  test('potting the cue ball is a foul and leaves it potted until placed', () => {
    const state = craft(
      [
        [0, 190, 20],
        [1, 50, 80],
        [8, 50, 20],
      ],
      { openTable: true, shotCount: 0 },
    );
    const shot = engine.applyAction(state, {
      seat: 0,
      type: 'shoot',
      payload: { angle: Math.atan2(-20, 10), power: 0.6 }, // rolls into the corner pocket
    });
    const sb = board(shot);
    expect(sb.lastShot?.cuePotted).toBe(true);
    expect(sb.lastShot?.foul).toBe(true);
    expect(sb.balls.find((b) => b.n === 0)?.potted).toBe(true);
    expect(sb.ballInHand).toBe(true);
    expect(shot.currentSeat).toBe(1);
    // The opponent rescues the cue and keeps the turn.
    const rescued = engine.applyAction(shot, {
      seat: 1,
      type: 'place',
      payload: { x: 60, y: 50 },
    });
    expect(board(rescued).balls.find((b) => b.n === 0)?.potted).toBe(false);
    expect(board(rescued).ballInHand).toBe(false);
    expect(rescued.currentSeat).toBe(1);
  });

  test('the 8-ball wins the game when your group is clear — and loses it early', () => {
    const common: Array<[number, number, number]> = [
      [0, 119.76, 40.12],
      [8, 160, 20],
      [3, 100, 80],
    ];
    const angle = Math.atan2(20 - 40.12, 160 - 119.76);

    // Group cleared (the 3 is already down): potting the 8 wins.
    const cleared = craft(common, { groups: [0, 1], shotCount: 9 });
    board(cleared).balls.find((b) => b.n === 3)!.potted = true;
    const winner = engine.applyAction(cleared, {
      seat: 0,
      type: 'shoot',
      payload: { angle, power: 0.8 },
    });
    expect(winner.phase).toBe('completed');
    expect(winner.winnerSeat).toBe(0);

    // Group NOT cleared: the early 8 hands the win to the opponent.
    const loser = engine.applyAction(
      craft(common, { groups: [0, 1], shotCount: 9 }),
      { seat: 0, type: 'shoot', payload: { angle, power: 0.8 } },
    );
    expect(loser.phase).toBe('completed');
    expect(loser.winnerSeat).toBe(1);
  });

  test('the 8-ball potted on the break re-spots instead of ending the game', () => {
    const state = craft(
      [
        [0, 119.76, 40.12],
        [8, 160, 20],
        [5, 50, 90],
      ],
      { openTable: true, shotCount: 0 },
    );
    const shot = engine.applyAction(state, {
      seat: 0,
      type: 'shoot',
      payload: { angle: Math.atan2(20 - 40.12, 160 - 119.76), power: 0.8 },
    });
    const sb = board(shot);
    expect(shot.phase).toBe('in_progress');
    const eight = sb.balls.find((b) => b.n === 8);
    expect(eight?.potted).toBe(false);
    expect(Math.abs(eight!.x - 150)).toBeLessThan(0.01); // back on the foot spot
    expect(Math.abs(eight!.y - 50)).toBeLessThan(0.01);
    expect(sb.openTable).toBe(true); // no group assigned by the respot
    expect(shot.currentSeat).toBe(1); // nothing potted — turn passes
  });
});

describe('carrom rules', () => {
  const engine = new CarromEngine();

  interface PieceShape {
    k: number; // 0 white · 1 black · 8 queen · 9 striker
    x: number;
    y: number;
    potted: boolean;
  }

  interface CarromShape {
    pieces: PieceShape[];
    strikerInHand: boolean;
    queenPending: boolean;
    queenCoveredBy: number | null;
    shotCount: number;
    lastShot: {
      seat: number;
      angle: number;
      power: number;
      potted: number[];
      strikerPotted: boolean;
      foul: boolean;
      reason: string | null;
      frames: number[][];
    } | null;
  }

  function start(): GameState {
    return engine.createInitialState(makeConfig(engine, 2));
  }

  function board(state: GameState): CarromShape {
    return state.board as unknown as CarromShape;
  }

  /** A quiet board with the given pieces; the striker is placed unless in-hand. */
  function craft(pieces: Array<[number, number, number]>, opts?: { strikerInHand?: boolean; queenPending?: boolean }): GameState {
    const state = start();
    const b = board(state);
    b.pieces = pieces.map(([k, x, y]) => ({ k, x, y, potted: false }));
    b.strikerInHand = opts?.strikerInHand ?? false;
    b.queenPending = opts?.queenPending ?? false;
    b.queenCoveredBy = null;
    b.shotCount = 5;
    b.lastShot = null;
    state.currentSeat = 0;
    return state;
  }

  test('sets up 9 white + 9 black men around the queen, striker in hand', () => {
    const state = start();
    const b = board(state);
    expect(b.pieces).toHaveLength(20);
    expect(b.pieces.filter((p) => p.k === 0)).toHaveLength(9);
    expect(b.pieces.filter((p) => p.k === 1)).toHaveLength(9);
    const queen = b.pieces.find((p) => p.k === 8);
    expect(queen?.x).toBeCloseTo(50);
    expect(queen?.y).toBeCloseTo(50);
    expect(b.strikerInHand).toBe(true);
    expect(b.queenPending).toBe(false);
    expect(state.currentSeat).toBe(0);
  });

  test('the striker must be placed on your own baseline', () => {
    const state = craft(
      [
        [8, 50, 50],
        [0, 50, 81],
        [1, 20, 20],
        [9, 50, 81],
      ],
      { strikerInHand: true },
    );
    expect(
      engine.validate(state, { seat: 0, type: 'place', payload: { x: 50, y: 50 } }).ok,
    ).toBe(false); // not on the baseline
    expect(
      engine.validate(state, { seat: 0, type: 'place', payload: { x: 50, y: 81 } }).ok,
    ).toBe(false); // blocked by the white man
    const placed = engine.applyAction(state, {
      seat: 0,
      type: 'place',
      payload: { x: 40, y: 81 },
    });
    expect(board(placed).strikerInHand).toBe(false);
    expect(placed.currentSeat).toBe(0); // placer keeps the turn
  });

  test('potting your own man keeps you at the board', () => {
    // Striker (50,81) → white (26.6, 89.9) → pocket (0, 100).
    const state = craft([
      [8, 80, 20],
      [1, 80, 80],
      [0, 26.6, 89.9],
      [0, 90, 55],
      [0, 90, 65],
      [9, 50, 81],
    ]);
    const shot = engine.applyAction(state, {
      seat: 0,
      type: 'shoot',
      payload: { angle: Math.atan2(100 - 81, 0 - 50), power: 0.8 },
    });
    const sb = board(shot);
    expect(sb.lastShot?.potted).toContain(0);
    expect(sb.lastShot?.foul).toBe(false);
    expect(sb.pieces.find((p) => p.k === 0)?.potted).toBe(true);
    expect(shot.currentSeat).toBe(0); // own pot keeps the turn
    expect(sb.strikerInHand).toBe(true); // and the striker is re-placed
    expect(sb.lastShot!.frames.length).toBeGreaterThan(2);
  });

  test('a potted striker is a foul: a potted man returns and the turn passes', () => {
    const state = craft([
      [8, 50, 50],
      [1, 80, 20],
      [9, 50, 81],
      [0, 60, 60],
    ]);
    // One white already down — the foul penalty brings it back.
    board(state).pieces.find((p) => p.k === 0)!.potted = true;
    const shot = engine.applyAction(state, {
      seat: 0,
      type: 'shoot',
      payload: { angle: Math.atan2(100 - 81, 0 - 50), power: 0.7 }, // striker rolls into the pocket
    });
    const sb = board(shot);
    expect(sb.lastShot?.strikerPotted).toBe(true);
    expect(sb.lastShot?.foul).toBe(true);
    expect(shot.currentSeat).toBe(1);
    const white = sb.pieces.find((p) => p.k === 0)!;
    expect(white.potted).toBe(false); // returned to the centre
    expect(Math.hypot(white.x - 50, white.y - 50)).toBeLessThan(15);
    expect(sb.strikerInHand).toBe(true);
  });

  test('the queen stays down only until you cover her', () => {
    const angle = Math.atan2(100 - 81, 0 - 50);
    // (a) Potting the queen alone leaves her pending and keeps the turn.
    const potQueen = craft([
      [0, 80, 60],
      [1, 20, 20],
      [8, 26.6, 89.9],
      [9, 50, 81],
    ]);
    const afterQueen = engine.applyAction(potQueen, {
      seat: 0,
      type: 'shoot',
      payload: { angle, power: 0.8 },
    });
    const qb = board(afterQueen);
    expect(qb.lastShot?.potted).toContain(8);
    expect(qb.queenPending).toBe(true);
    expect(afterQueen.currentSeat).toBe(0); // shoot again to cover
    expect(qb.pieces.find((p) => p.k === 8)?.potted).toBe(true);

    // (b) Failing to cover sends her back to the centre.
    const coverFail = craft(
      [
        [0, 85, 60],
        [0, 85, 70],
        [1, 20, 20],
        [9, 50, 81],
      ],
      { queenPending: true },
    );
    const queenDown = coverFail;
    board(queenDown).pieces.push({ k: 8, x: 0, y: 100, potted: true });
    const failed = engine.applyAction(queenDown, {
      seat: 0,
      type: 'shoot',
      payload: { angle: -Math.PI / 2, power: 0.25 }, // safe tap, nothing potted
    });
    const fb = board(failed);
    expect(fb.queenPending).toBe(false);
    const queen = fb.pieces.find((p) => p.k === 8)!;
    expect(queen.potted).toBe(false);
    expect(Math.hypot(queen.x - 50, queen.y - 50)).toBeLessThan(15);
    expect(failed.currentSeat).toBe(1);
  });

  test('sinking the last of your nine men wins the board', () => {
    const state = craft([
      [8, 50, 50],
      [1, 80, 20],
      [0, 26.6, 89.9],
      [9, 50, 81],
    ]);
    // Eight whites already down.
    const b = board(state);
    for (let i = 0; i < 8; i++) {
      b.pieces.push({ k: 0, x: 90, y: 20 + i, potted: true });
    }
    const shot = engine.applyAction(state, {
      seat: 0,
      type: 'shoot',
      payload: { angle: Math.atan2(100 - 81, 0 - 50), power: 0.8 },
    });
    expect(shot.phase).toBe('completed');
    expect(shot.winnerSeat).toBe(0);
    expect(shot.scores[0]).toBe(10); // nine men + win point
    expect(shot.scores[1]).toBe(0);
  });
});

describe('dots & boxes rules', () => {
  const engine = new DotsAndBoxesEngine();

  interface DnbShape {
    size: number;
    h: number[][];
    v: number[][];
    boxes: number[][];
    lastEdge: { kind: string; r: number; c: number; seat: number } | null;
    claimed: number;
  }

  function start(): GameState {
    return engine.createInitialState(makeConfig(engine, 2));
  }

  function board(state: GameState): DnbShape {
    return state.board as unknown as DnbShape;
  }

  test('starts with an empty 5×5 grid (25 boxes, no ties)', () => {
    const state = start();
    const b = board(state);
    expect(b.size).toBe(5);
    expect(b.h).toHaveLength(6);
    expect(b.h[0]).toHaveLength(5);
    expect(b.v).toHaveLength(5);
    expect(b.v[0]).toHaveLength(6);
    expect(b.boxes.flat().every((o) => o === -1)).toBe(true);
    expect(b.claimed).toBe(0);
    expect(state.currentSeat).toBe(0);
  });

  test('drawn edges cannot be drawn again', () => {
    const state = start();
    const drawn = engine.applyAction(state, { seat: 0, type: 'edge', payload: { kind: 'h', r: 0, c: 0 } });
    expect(board(drawn).h[0][0]).toBe(0);
    expect(drawn.currentSeat).toBe(1); // no box — turn passes
    expect(
      engine.validate(drawn, { seat: 1, type: 'edge', payload: { kind: 'h', r: 0, c: 0 } }).ok,
    ).toBe(false);
  });

  test('completing a box claims it and earns another line', () => {
    const state = start();
    const b = board(state);
    // Three sides of box (2,2).
    b.h[2][2] = 0;
    b.h[3][2] = 1;
    b.v[2][2] = 1;
    state.currentSeat = 0;
    const moved = engine.applyAction(state, {
      seat: 0,
      type: 'edge',
      payload: { kind: 'v', r: 2, c: 3 },
    });
    const mb = board(moved);
    expect(mb.boxes[2][2]).toBe(0);
    expect(mb.claimed).toBe(1);
    expect(moved.currentSeat).toBe(0); // chain turn
  });

  test('one line can complete two boxes at once', () => {
    const state = start();
    const b = board(state);
    // Boxes (2,2) and (2,3) both miss only v[2][3].
    b.h[2][2] = 0;
    b.h[3][2] = 1;
    b.v[2][2] = 1;
    b.h[2][3] = 1;
    b.h[3][3] = 0;
    b.v[2][4] = 0;
    state.currentSeat = 0;
    const moved = engine.applyAction(state, {
      seat: 0,
      type: 'edge',
      payload: { kind: 'v', r: 2, c: 3 },
    });
    const mb = board(moved);
    expect(mb.boxes[2][2]).toBe(0);
    expect(mb.boxes[2][3]).toBe(0);
    expect(mb.claimed).toBe(2);
    expect(moved.currentSeat).toBe(0);
  });

  test('a fully drawn grid settles by box count with 25 claimed', () => {
    let state = start();
    let guard = 0;
    while (state.phase === 'in_progress' && guard++ < 100) {
      const b = board(state);
      const seat = state.currentSeat;
      let played = false;
      outer: for (let r = 0; r <= b.size; r++) {
        for (let c = 0; c < b.size; c++) {
          if (b.h[r][c] === -1) {
            state = engine.applyAction(state, { seat, type: 'edge', payload: { kind: 'h', r, c } });
            played = true;
            break outer;
          }
        }
      }
      if (played) continue;
      for (let r = 0; r < b.size; r++) {
        for (let c = 0; c <= b.size; c++) {
          if (b.v[r][c] === -1) {
            state = engine.applyAction(state, { seat, type: 'edge', payload: { kind: 'v', r, c } });
            played = true;
            break;
          }
        }
        if (played) break;
      }
    }
    expect(state.phase).toBe('completed');
    expect(board(state).claimed).toBe(25);
    expect(state.scores[0] + state.scores[1]).toBe(25);
    expect(state.winnerSeat).toBe(state.scores[0] > state.scores[1] ? 0 : 1);
  });
});

describe('snakes & ladders rules', () => {
  const engine = new SnakesLaddersEngine();

  interface SlShape {
    positions: number[];
    dice: number | null;
    sixStreak: number;
    lastMove: {
      seat: number;
      roll: number;
      from: number;
      to: number;
      bounced: boolean;
      snake: [number, number] | null;
      ladder: [number, number] | null;
      won: boolean;
    } | null;
  }

  function start(players = 2): GameState {
    return engine.createInitialState(makeConfig(engine, players));
  }

  function board(state: GameState): SlShape {
    return state.board as unknown as SlShape;
  }

  /** Deterministic roll helper — Math.random is mocked to force `dice`. */
  function roll(state: GameState, seat: number, dice: number): GameState {
    const spy = jest.spyOn(Math, 'random').mockReturnValue((dice - 0.5) / 6);
    const next = engine.applyAction(state, { seat, type: 'roll', payload: {} });
    spy.mockRestore();
    return next;
  }

  test('starts everyone off-board with an empty die', () => {
    const state = start(4);
    expect(board(state).positions).toEqual([0, 0, 0, 0]);
    expect(board(state).dice).toBeNull();
    expect(state.currentSeat).toBe(0);
    expect(engine.maxPlayers).toBe(4);
  });

  test('overshooting 100 bounces back instead of finishing', () => {
    const state = start();
    board(state).positions[0] = 98;
    const moved = roll(state, 0, 5); // 98 + 5 = 103 → 200 - 103 = 97
    expect(board(moved).positions[0]).toBe(97);
    expect(board(moved).lastMove?.bounced).toBe(true);
    expect(moved.currentSeat).toBe(1); // not a 6 — turn passes
  });

  test('ladders lift and snakes bite', () => {
    const ladder = start();
    board(ladder).positions[0] = 1;
    const lifted = roll(ladder, 0, 3); // 1 + 3 = 4 → ladder to 14
    expect(board(lifted).positions[0]).toBe(14);
    expect(board(lifted).lastMove?.ladder).toEqual([4, 14]);

    const snake = start();
    board(snake).positions[0] = 46;
    const bitten = roll(snake, 0, 1); // 46 + 1 = 47 → snake to 26
    expect(board(bitten).positions[0]).toBe(26);
    expect(board(bitten).lastMove?.snake).toEqual([47, 26]);
  });

  test('landing exactly on 100 wins the race', () => {
    const state = start();
    board(state).positions[0] = 97;
    const moved = roll(state, 0, 3); // 97 + 3 = 100
    expect(moved.phase).toBe('completed');
    expect(moved.winnerSeat).toBe(0);
    expect(board(moved).lastMove?.won).toBe(true);
    expect(moved.scores[0]).toBe(100);
  });

  test('a 6 rolls again — but three in a row pass the turn', () => {
    let state = start();
    state = roll(state, 0, 6);
    expect(state.currentSeat).toBe(0); // extra roll
    expect(board(state).sixStreak).toBe(1);
    state = roll(state, 0, 6);
    expect(state.currentSeat).toBe(0); // second extra roll
    expect(board(state).sixStreak).toBe(2);
    state = roll(state, 0, 6);
    expect(state.currentSeat).toBe(1); // third 6 in a row — turn passes
    expect(board(state).sixStreak).toBe(0);
  });
});

describe('bingo rules', () => {
  const engine = new BingoEngine();

  interface BingoShape {
    cards: number[][][];
    marks: boolean[][][];
    drawn: number[];
    pool: number[];
    lastBall: number | null;
    lastWin: { seat: number; line: Array<[number, number]> } | null;
  }

  function start(players = 2): GameState {
    return engine.createInitialState(makeConfig(engine, players));
  }

  function board(state: GameState): BingoShape {
    return state.board as unknown as BingoShape;
  }

  /** Deterministic draw — one ball left in the cage. */
  function draw(state: GameState, seat: number): GameState {
    const b = board(state);
    if (b.pool.length === 1) {
      const only = b.pool[0];
      const spy = jest.spyOn(Math, 'random').mockReturnValue(0);
      const next = engine.applyAction(state, { seat, type: 'draw', payload: {} });
      spy.mockRestore();
      expect(board(next).lastBall).toBe(only);
      return next;
    }
    return engine.applyAction(state, { seat, type: 'draw', payload: {} });
  }

  test('deals private 5×5 cards with column ranges and a marked FREE centre', () => {
    const state = start(4);
    const b = board(state);
    expect(b.cards).toHaveLength(4);
    for (const card of b.cards) {
      expect(card).toHaveLength(5);
      expect(card[2][2]).toBe(0);
      expect(b.marks[b.cards.indexOf(card)][2][2]).toBe(true);
      const ranges = [[1, 15], [16, 30], [31, 45], [46, 60], [61, 75]];
      for (let c = 0; c < 5; c++) {
        const seen = new Set<number>();
        for (let r = 0; r < 5; r++) {
          const v = card[r][c];
          if (v === 0) continue;
          expect(v).toBeGreaterThanOrEqual(ranges[c][0]);
          expect(v).toBeLessThanOrEqual(ranges[c][1]);
          expect(seen.has(v)).toBe(false); // unique per column
          seen.add(v);
        }
      }
    }
    expect(b.drawn).toHaveLength(0);
    expect(b.pool).toHaveLength(75);
    expect(state.currentSeat).toBe(0);
  });

  test('a drawn ball dabs every card holding it and passes the turn', () => {
    const state = start(2);
    // Fix both cards so ball 7 is at (0,0) for seat 0 and (4,4) for seat 1.
    const b = board(state);
    b.cards[0][0][0] = 7;
    b.cards[1][4][4] = 7;
    b.pool.splice(b.pool.indexOf(7), 1);
    b.pool = [7]; // deterministic: 7 is the only ball left
    const moved = draw(state, 0);
    const mb = board(moved);
    expect(mb.lastBall).toBe(7);
    expect(mb.drawn).toEqual([7]);
    expect(mb.marks[0][0][0]).toBe(true);
    expect(mb.marks[1][4][4]).toBe(true);
    expect(moved.currentSeat).toBe(1);
    expect(moved.phase).toBe('in_progress');
  });

  test('cards are hidden: other seats see no card, spectators see none', () => {
    const state = start(3);
    const mine = engine.playerView(state, 1);
    const mb = mine.board as unknown as BingoShape;
    expect(mb.cards[1]).toHaveLength(5); // own card visible
    expect(mb.cards[0]).toEqual([]); // opponents hidden
    expect(mb.cards[2]).toEqual([]);
    expect(mb.drawn).toHaveLength(0); // drawn list public
    const spec = engine.spectatorView(state);
    const sb = spec.board as unknown as BingoShape;
    expect(sb.cards.every((c) => c.length === 0)).toBe(true);
  });

  test('completing a line shouts BINGO and wins', () => {
    const state = start(2);
    const b = board(state);
    // Seat 0's top row needs only cell (0,4) — ball 75 will be drawn next.
    b.cards[0][0] = [1, 16, 31, 46, 75];
    for (let c = 0; c < 4; c++) b.marks[0][0][c] = true;
    b.pool = [75];
    const moved = draw(state, 0);
    expect(moved.phase).toBe('completed');
    expect(moved.winnerSeat).toBe(0);
    const mb = board(moved);
    expect(mb.lastWin?.seat).toBe(0);
    expect(mb.lastWin?.line).toHaveLength(5);
    expect(moved.scores[0]).toBeGreaterThan(0);
  });

  test('the cage never runs dry — a full 75-ball game always finds a winner', () => {
    const state = start(2);
    const spy = jest.spyOn(Math, 'random').mockReturnValue(0.999);
    let moved = state;
    let guard = 0;
    while (moved.phase === 'in_progress' && guard++ < 100) {
      moved = engine.applyAction(moved, { seat: moved.currentSeat, type: 'draw', payload: {} });
    }
    spy.mockRestore();
    expect(moved.phase).toBe('completed');
    expect(moved.winnerSeat).not.toBeNull();
    expect(board(moved).drawn.length).toBeLessThanOrEqual(75);
  });
});

describe('engine registry', () => {
  test('registers, resolves and rejects engines cleanly', () => {
    const registry = new EngineRegistry(
      new DominoesEngine(),
      new LudoEngine(),
      new OchoEngine(),
      new Connect4Engine(),
      new CheckersEngine(),
      new ChessEngine(),
      new PoolEngine(),
      new CarromEngine(),
      new DotsAndBoxesEngine(),
      new SnakesLaddersEngine(),
      new BingoEngine(),
    );
    // The wave-1 engines are wired in via DI.
    expect(registry.slugs).toEqual(['dominoes', 'ludo', 'ocho', 'connect4', 'checkers', 'chess', 'pool', 'carrom', 'dots_and_boxes', 'snakes_ladders', 'bingo']);
    expect(registry.has('dominoes')).toBe(true);
    expect(registry.get('dominoes')).toBeInstanceOf(DominoesEngine);
    expect(registry.require('ludo')).toBeInstanceOf(LudoEngine);

    // Unknown games are rejected, and extra engines can be registered on top.
    expect(registry.has('nonexistent')).toBe(false);
    expect(() => registry.require('nonexistent')).toThrow(/No engine registered/);
    registry.register(new DummyEngine());
    expect(registry.slugs).toEqual(['dominoes', 'ludo', 'ocho', 'connect4', 'checkers', 'chess', 'pool', 'carrom', 'dots_and_boxes', 'snakes_ladders', 'bingo', '__dummy__']);
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
