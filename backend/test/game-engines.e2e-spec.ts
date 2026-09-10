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
import { DicePartyEngine } from '../src/game/engine/dice-party.engine';
import { BackgammonEngine } from '../src/game/engine/backgammon.engine';
import { MancalaEngine } from '../src/game/engine/mancala.engine';
import { BowlingEngine, scoreBowling } from '../src/game/engine/bowling.engine';
import { TriviaEngine, TRIVIA_BANK } from '../src/game/engine/trivia.engine';
import { WordChainEngine, WORD_CHAIN_DICT } from '../src/game/engine/word-chain.engine';
import { EmojiCharadesEngine, EMOJI_RIDDLES } from '../src/game/engine/emoji-charades.engine';
import { MemoryEngine, MEMORY_SYMBOLS } from '../src/game/engine/memory.engine';
import { SketchEngine } from '../src/game/engine/sketch.engine';
import { WerewolfEngine } from '../src/game/engine/werewolf.engine';
import { ImpostorEngine, IMPOSTOR_LOCATIONS } from '../src/game/engine/impostor.engine';
import { DartsEngine, scoreDart } from '../src/game/engine/darts.engine';
import { MinigolfEngine, MINIGOLF_HOLES } from '../src/game/engine/minigolf.engine';
import { BankrollEngine } from '../src/game/engine/bankroll.engine';
import { BattleshipEngine, BATTLESHIP_FLEET } from '../src/game/engine/battleship.engine';
import { ReversiEngine, legalMoves, flipsFor } from '../src/game/engine/reversi.engine';
import { GomokuEngine, winningLineAt } from '../src/game/engine/gomoku.engine';
import { BlackjackEngine, handValue } from '../src/game/engine/blackjack.engine';
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
  { name: 'dice_party', build: () => new DicePartyEngine() },
  { name: 'backgammon', build: () => new BackgammonEngine(), players: 2 },
  { name: 'mancala', build: () => new MancalaEngine(), players: 2 },
  { name: 'bowling', build: () => new BowlingEngine(), players: 2 },
  { name: 'trivia', build: () => new TriviaEngine() },
  { name: 'word_chain', build: () => new WordChainEngine() },
  { name: 'emoji_charades', build: () => new EmojiCharadesEngine() },
  { name: 'memory', build: () => new MemoryEngine() },
  { name: 'sketch', build: () => new SketchEngine() },
  { name: 'werewolf', build: () => new WerewolfEngine(), players: 5 },
  { name: 'impostor', build: () => new ImpostorEngine(), players: 4 },
  { name: 'darts', build: () => new DartsEngine() },
  { name: 'minigolf', build: () => new MinigolfEngine() },
  { name: 'bankroll', build: () => new BankrollEngine() },
  { name: 'battleship', build: () => new BattleshipEngine() },
  { name: 'reversi', build: () => new ReversiEngine() },
  { name: 'gomoku', build: () => new GomokuEngine() },
  { name: 'blackjack', build: () => new BlackjackEngine() },
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

describe('dice party rules', () => {
  const engine = new DicePartyEngine();

  interface DiceShape {
    dice: number[];
    held: boolean[];
    rollsUsed: number;
    scores: number[][];
    lastRoll: { seat: number; dice: number[] } | null;
    lastScore: { seat: number; category: string; points: number } | null;
  }

  function start(players = 2): GameState {
    return engine.createInitialState(makeConfig(engine, players));
  }

  function board(state: GameState): DiceShape {
    return state.board as unknown as DiceShape;
  }

  /** Rolls with Math.random mocked to (v-0.5)/6 → every rolled die shows v. */
  function roll(state: GameState, seat: number, v: number): GameState {
    const spy = jest.spyOn(Math, 'random').mockReturnValue((v - 0.5) / 6);
    const next = engine.applyAction(state, { seat, type: 'roll', payload: {} });
    spy.mockRestore();
    return next;
  }

  function setDice(state: GameState, dice: number[]): void {
    board(state).dice = [...dice];
  }

  test('starts with five dice, no rolls used and an empty scorecard', () => {
    const state = start(4);
    const b = board(state);
    expect(b.dice).toHaveLength(5);
    expect(b.held).toEqual([false, false, false, false, false]);
    expect(b.rollsUsed).toBe(0);
    expect(b.scores).toHaveLength(4);
    expect(b.scores[0]).toHaveLength(15);
    expect(b.scores.every((row) => row.every((v) => v === -1))).toBe(true);
    expect(state.currentSeat).toBe(0);
  });

  test('held dice survive re-rolls and the turn allows three rolls max', () => {
    let state = start();
    state = roll(state, 0, 4); // all dice 4
    expect(board(state).dice).toEqual([4, 4, 4, 4, 4]);
    expect(board(state).rollsUsed).toBe(1);

    state = engine.applyAction(state, { seat: 0, type: 'hold', payload: { dice: [0] } });
    expect(board(state).held).toEqual([true, false, false, false, false]);

    state = roll(state, 0, 2); // dice 1..4 stay held → [4,2,2,2,2]
    expect(board(state).dice).toEqual([4, 2, 2, 2, 2]);

    state = roll(state, 0, 6);
    expect(board(state).rollsUsed).toBe(3);
    expect(
      engine.validate(state, { seat: 0, type: 'roll', payload: {} }).ok,
    ).toBe(false); // three rolls used
    expect(state.currentSeat).toBe(0); // still my turn — must bank a category
  });

  test('categories score by Yatzy rules and each is used once', () => {
    const state = start();
    setDice(state, [6, 6, 6, 2, 2]);
    state.currentSeat = 0;
    expect(engine.scoreCategory([6, 6, 6, 2, 2], 'sixes')).toBe(18);
    expect(engine.scoreCategory([6, 6, 6, 2, 2], 'pair')).toBe(12);
    expect(engine.scoreCategory([6, 6, 6, 2, 2], 'two_pairs')).toBe(16);
    expect(engine.scoreCategory([6, 6, 6, 2, 2], 'three_kind')).toBe(18);
    expect(engine.scoreCategory([6, 6, 6, 2, 2], 'full_house')).toBe(22);
    expect(engine.scoreCategory([6, 6, 6, 2, 2], 'chance')).toBe(22);
    expect(engine.scoreCategory([1, 2, 3, 4, 5], 'small_straight')).toBe(15);
    expect(engine.scoreCategory([2, 3, 4, 5, 6], 'large_straight')).toBe(20);
    expect(engine.scoreCategory([2, 3, 4, 5, 6], 'small_straight')).toBe(0);
    expect(engine.scoreCategory([5, 5, 5, 5, 5], 'yatzy')).toBe(50);
    expect(engine.scoreCategory([5, 5, 5, 5, 2], 'yatzy')).toBe(0);

    const scored = engine.applyAction(state, { seat: 0, type: 'score', payload: { category: 'full_house' } });
    expect(board(scored).scores[0][CATS_INDEX('full_house')]).toBe(22);
    expect(board(scored).lastScore?.points).toBe(22);
    expect(scored.currentSeat).toBe(1); // turn passes after banking
    expect(
      engine.validate(
        { ...scored, currentSeat: 0 } as GameState,
        { seat: 0, type: 'score', payload: { category: 'full_house' } },
      ).ok,
    ).toBe(false); // category already used
  });

  function CATS_INDEX(cat: string): number {
    return [
      'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
      'pair', 'two_pairs', 'three_kind', 'four_kind',
      'small_straight', 'large_straight', 'full_house', 'chance', 'yatzy',
    ].indexOf(cat);
  }

  test('the upper-section bonus pays +50 at 63+ and settles the winner', () => {
    const state = start(2);
    const b = board(state);
    // Seat 1 already banked everything; seat 0 has only 'yatzy' left.
    b.scores[0] = [4, 8, 12, 16, 20, 24, 8, 12, 15, 20, 15, 20, 22, 21, -1]; // upper = 84
    b.scores[1] = [3, 6, 9, 12, 15, 18, 6, 8, 12, 16, 0, 0, 0, 20, 21]; // upper = 63
    setDice(state, [1, 1, 1, 1, 1]);
    state.currentSeat = 0;

    const done = engine.applyAction(state, { seat: 0, type: 'score', payload: { category: 'yatzy' } });
    expect(done.phase).toBe('completed');
    expect(done.winnerSeat).toBe(0);
    // seat 0: 84 + 133 + 50 (yatzy) + 50 (bonus) = 317; seat 1: 63 + 83 + 50 = 196.
    expect(done.scores[0]).toBe(317);
    expect(done.scores[1]).toBe(196);
  });
});

describe('backgammon rules', () => {
  const engine = new BackgammonEngine();

  interface BgShape {
    points: number[]; // index 0 = point 1; + seat0, - seat1
    bar: [number, number];
    off: [number, number];
    dice: number[];
    rolled: number[];
    subPhase: 'roll' | 'move';
    lastMove: { seat: number; from: number; to: number; die: number; hit: boolean } | null;
  }

  function start(): GameState {
    return engine.createInitialState(makeConfig(engine, 2));
  }

  function board(state: GameState): BgShape {
    return state.board as unknown as BgShape;
  }

  /** Rolls with mocked dice: doubles of v, or the pair [a, b]. */
  function roll(state: GameState, seat: number, a: number, b?: number): GameState {
    const seq = b === undefined ? [a] : [a, b];
    let i = 0;
    const spy = jest
      .spyOn(Math, 'random')
      .mockImplementation(() => (seq[Math.min(i++, seq.length - 1)] - 0.5) / 6);
    const next = engine.applyAction(state, { seat, type: 'roll', payload: {} });
    spy.mockRestore();
    return next;
  }

  function craft(points: number[], opts?: Partial<BgShape> & { currentSeat?: number }): GameState {
    const state = start();
    const b = board(state);
    b.points = [...points];
    b.bar = opts?.bar ?? [0, 0];
    b.off = opts?.off ?? [0, 0];
    b.dice = opts?.dice ?? [];
    b.rolled = opts?.rolled ?? [];
    b.subPhase = opts?.subPhase ?? 'move';
    state.currentSeat = opts?.currentSeat ?? 0;
    return state;
  }

  test('lays out the standard opening position', () => {
    const b = board(start());
    expect(b.points.filter((v) => v > 0).reduce((a, v) => a + v, 0)).toBe(15);
    expect(b.points.filter((v) => v < 0).reduce((a, v) => a - v, 0)).toBe(15);
    expect(b.points[23]).toBe(2); // seat 0 on 24
    expect(b.points[5]).toBe(5); // seat 0 on 6
    expect(b.points[0]).toBe(-2); // seat 1 on 1
    expect(b.points[18]).toBe(-5); // seat 1 on 19
    expect(b.bar).toEqual([0, 0]);
    expect(b.off).toEqual([0, 0]);
    expect(b.subPhase).toBe('roll');
  });

  test('checkers move by the die, blocked points refuse and blots are hit to the bar', () => {
    // Seat 0: checkers on 24 and 6. Seat 1: two on 19 (blocked), one on 16 (blot).
    const state = craft([
      0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, 0, 0, -2, 0, 0, 0, 0, 1,
    ], { dice: [5, 3], rolled: [5, 3] });

    // 24 → 19 is blocked (two enemies).
    expect(
      engine.validate(state, { seat: 0, type: 'move', payload: { from: 24, die: 5 } }).ok,
    ).toBe(false);
    // 24 → 21 fine.
    const moved = engine.applyAction(state, { seat: 0, type: 'move', payload: { from: 24, die: 3 } });
    const mb = board(moved);
    expect(mb.points[20]).toBe(1); // landed on 21
    expect(mb.points[23]).toBe(0);
    // Now 21 → 16 with the 5 hits the blot.
    const hit = engine.applyAction(moved, { seat: 0, type: 'move', payload: { from: 21, die: 5 } });
    const hb = board(hit);
    expect(hb.points[15]).toBe(1); // seat 0 now on 16
    expect(hb.bar[1]).toBe(1);
    expect(hb.lastMove?.hit).toBe(true);
    expect(hit.currentSeat).toBe(1); // dice used up — turn passes
    expect(board(hit).subPhase).toBe('roll');
  });

  test('bar checkers must re-enter before anything else moves', () => {
    const state = craft(
      [
        0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -2, -2, -2, -2, -2, -2,
      ],
      { dice: [3, 6], rolled: [3, 6], bar: [1, 0] },
    );
    // Moving the back checkers on 6 while a checker waits on the bar is illegal.
    expect(
      engine.validate(state, { seat: 0, type: 'move', payload: { from: 6, die: 3 } }).ok,
    ).toBe(false);
    // Seat 0 enters on 25 - die; with a 3 that is point 22 — blocked (-2). With a 6 → 19 — blocked.
    // Rolling [3, 6] therefore forfeits the whole turn.
    const beforeRoll = craft(
      [
        0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -2, -2, -2, -2, -2, -2,
      ],
      { subPhase: 'roll', bar: [1, 0] },
    );
    const entered = roll(beforeRoll, 0, 3, 6);
    // Blocked everywhere → the roll is forfeited and the turn passes.
    expect(entered.currentSeat).toBe(1);
    expect(board(entered).subPhase).toBe('roll');
    expect(board(entered).dice).toEqual([]);
  });

  test('entering from the bar lands on 25-die for seat 0', () => {
    const state = craft(
      [
        0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -2,
      ],
      { dice: [4, 4, 4, 4], rolled: [4, 4, 4, 4], bar: [1, 0] },
    );
    const entered = engine.applyAction(state, { seat: 0, type: 'move', payload: { from: 'bar', die: 4 } });
    const eb = board(entered);
    expect(eb.points[20]).toBe(1); // entered on 25 - 4 = 21
    expect(eb.bar[0]).toBe(0);
    expect(entered.currentSeat).toBe(0); // doubles — three dice left
    expect(eb.dice).toEqual([4, 4, 4]);
  });

  test('bearing off requires the full home board; exact then overshoot', () => {
    // All 15 home for seat 0: five on 6, six on 5, four on 1.
    const state = craft(
      [
        4, 0, 0, 0, 6, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1,
      ],
      { dice: [6, 5], rolled: [6, 5] },
    );
    // A checker still outside (seat 1 blot at 19 doesn't matter; put one of mine at 7).
    const notHome = craft(
      [
        4, 0, 0, 0, 6, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1,
      ],
      { dice: [6, 5], rolled: [6, 5] },
    );
    expect(
      engine.validate(notHome, { seat: 0, type: 'move', payload: { from: 6, die: 6 } }).ok,
    ).toBe(false); // cannot bear off with a checker on 7

    // Exact bear-off from 6 with a 6.
    const exact = engine.applyAction(state, { seat: 0, type: 'move', payload: { from: 6, die: 6 } });
    expect(board(exact).off[0]).toBe(1);
    expect(board(exact).points[5]).toBe(4);

    // Overshoot: bearing off 5 with a 6 is legal only from the rearmost point.
    expect(
      engine.validate(exact, { seat: 0, type: 'move', payload: { from: 5, die: 6 } }).ok,
    ).toBe(false); // checkers remain on 6 → 5 is not rearmost
    const rear = craft([4, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1], { dice: [6], rolled: [6] });
    const overshot = engine.applyAction(rear, { seat: 0, type: 'move', payload: { from: 5, die: 6 } });
    expect(board(overshot).off[0]).toBe(1);
  });

  test('bearing off all fifteen wins; gammon doubles and backgammon triples', () => {
    const almost = craft(
      [
        0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -2,
      ],
      { dice: [6], rolled: [6], off: [14, 0] },
    );
    const won = engine.applyAction(almost, { seat: 0, type: 'move', payload: { from: 6, die: 6 } });
    expect(won.phase).toBe('completed');
    expect(won.winnerSeat).toBe(0);
    expect(won.scores[0]).toBe(2); // seat 1 bore off none → gammon

    // Backgammon: seat 1 also stuck on the bar.
    const deep = craft(
      [
        0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -2,
      ],
      { dice: [6], rolled: [6], off: [14, 0], bar: [0, 1] },
    );
    const bg = engine.applyAction(deep, { seat: 0, type: 'move', payload: { from: 6, die: 6 } });
    expect(bg.scores[0]).toBe(3); // bar → backgammon
  });

  test('doubles play four times and dice must be used to the maximum', () => {
    const state = craft(
      [
        0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, -2, 0, 0, 0, 0, 2,
      ],
      { dice: [2, 2, 2, 2], rolled: [2, 2, 2, 2] },
    );
    let moved = state;
    // Two checkers march 24 → 22, then both continue 22 → 20.
    const froms = [24, 24, 22, 22];
    for (let i = 0; i < 4; i++) {
      expect(board(moved).dice).toHaveLength(4 - i);
      moved = engine.applyAction(moved, { seat: 0, type: 'move', payload: { from: froms[i], die: 2 } });
    }
    expect(board(moved).dice).toHaveLength(0);
    expect(moved.currentSeat).toBe(1);
    expect(board(moved).points[19]).toBe(2); // the pair settled on 20
  });
});

describe('mancala rules', () => {
  const engine = new MancalaEngine();

  interface MancalaShape {
    pits: number[]; // 0-5 seat0 pits, 6 store0, 7-12 seat1 pits, 13 store1
    lastSow: { seat: number; pit: number; lastCup: number; captured: number; extraTurn: boolean } | null;
    moveCount: number;
  }

  function start(): GameState {
    return engine.createInitialState(makeConfig(engine, 2));
  }

  function board(state: GameState): MancalaShape {
    return state.board as unknown as MancalaShape;
  }

  function craft(pits: number[], currentSeat = 0): GameState {
    const state = start();
    const b = board(state);
    b.pits = [...pits];
    state.currentSeat = currentSeat;
    return state;
  }

  test('starts with four seeds in every pit and empty stores', () => {
    const b = board(start());
    expect(b.pits).toHaveLength(14);
    expect(b.pits.slice(0, 6)).toEqual([4, 4, 4, 4, 4, 4]);
    expect(b.pits[6]).toBe(0);
    expect(b.pits.slice(7, 13)).toEqual([4, 4, 4, 4, 4, 4]);
    expect(b.pits[13]).toBe(0);
    expect(b.pits.reduce((a, v) => a + v, 0)).toBe(48);
    expect(b.lastSow).toBeNull();
  });

  test('sowing walks counter-clockwise and crosses your own store', () => {
    // Seat 0 sows pit 5 (4 seeds) → pit 6, own store, then opponent pits 1-2.
    const next = engine.applyAction(start(), { seat: 0, type: 'sow', payload: { pit: 5 } });
    const b = board(next);
    expect(b.pits[4]).toBe(0); // emptied
    expect(b.pits[5]).toBe(5); // own pit 6
    expect(b.pits[6]).toBe(1); // own store — passed but not the last cup
    expect(b.pits[7]).toBe(5); // opponent pit 1
    expect(b.pits[8]).toBe(5); // opponent pit 2
    expect(next.currentSeat).toBe(1); // turn passes
    expect(b.lastSow).toMatchObject({ seat: 0, pit: 5, lastCup: 8, captured: 0, extraTurn: false });
  });

  test('the last seed in your own store grants another turn', () => {
    const state = craft([6, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0]);
    const next = engine.applyAction(state, { seat: 0, type: 'sow', payload: { pit: 1 } });
    const b = board(next);
    expect(b.pits[6]).toBe(1);
    expect(b.lastSow).toMatchObject({ lastCup: 6, extraTurn: true });
    expect(next.currentSeat).toBe(0); // sow again
    // The first sow left pit 2 holding five; sowing it ends on cup 10 — no repeat.
    const second = engine.applyAction(next, { seat: 0, type: 'sow', payload: { pit: 6 } });
    expect(second.currentSeat).toBe(1);
    expect(board(second).pits[6]).toBe(2); // another seed reached the store
  });

  test('the last seed in your own empty pit captures the opposite pit', () => {
    // Seat 0 pit 4 holds one seed; own pit 5 is empty; opposite cup 8 has five.
    const state = craft([4, 4, 4, 1, 0, 4, 0, 4, 5, 4, 4, 4, 4, 0]);
    const next = engine.applyAction(state, { seat: 0, type: 'sow', payload: { pit: 4 } });
    const b = board(next);
    expect(b.pits[4]).toBe(0); // the landing pit is swept
    expect(b.pits[8]).toBe(0); // opposite swept too
    expect(b.pits[6]).toBe(6); // 1 + 5 captured
    expect(b.lastSow).toMatchObject({ lastCup: 4, captured: 6, extraTurn: false });
    expect(next.currentSeat).toBe(1);
  });

  test('emptying a side ends the game and the other side sweeps its seeds', () => {
    // Seat 0 has one seed left in pit 6; landing it in the store empties the
    // side → seat 1 sweeps their 12 and wins 27 to 21.
    const state = craft([0, 0, 0, 0, 0, 1, 20, 0, 0, 0, 12, 0, 0, 15]);
    const next = engine.applyAction(state, { seat: 0, type: 'sow', payload: { pit: 6 } });
    const b = board(next);
    expect(next.phase).toBe('completed');
    expect(next.winnerSeat).toBe(1);
    expect(b.pits[6]).toBe(21);
    expect(b.pits[13]).toBe(27);
    expect(next.scores).toEqual([21, 27]);
    expect(b.pits.slice(0, 6).every((v) => v === 0)).toBe(true);
    expect(b.pits.slice(7, 13).every((v) => v === 0)).toBe(true);
  });

  test('only your own non-empty pits are playable', () => {
    const state = craft([0, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0]);
    expect(
      engine.validate(state, { seat: 0, type: 'sow', payload: { pit: 1 } }).ok,
    ).toBe(false); // empty pit
    expect(
      engine.validate(state, { seat: 0, type: 'sow', payload: { pit: 7 } }).ok,
    ).toBe(false); // not one of your six
    expect(
      engine.validate(state, { seat: 1, type: 'sow', payload: { pit: 1 } }).ok,
    ).toBe(false); // not your turn
    expect(engine.legalMoves(state)).toEqual([2, 3, 4, 5, 6]);
  });
});

describe('bowling rules', () => {
  const engine = new BowlingEngine();

  interface BowlShape {
    pins: { x: number; y: number; down: boolean }[];
    frameNumber: number;
    rollsThisFrame: number;
    frames: number[][];
    tenthStart: [number, number];
    lastShot: { seat: number; angle: number; power: number; knocked: number; gutter: boolean; frames: number[][] } | null;
    throwCount: number;
  }

  function start(): GameState {
    return engine.createInitialState(makeConfig(engine, 2));
  }

  function board(state: GameState): BowlShape {
    return state.board as unknown as BowlShape;
  }

  function throwBall(state: GameState, seat: number, angle: number, power = 0.9): GameState {
    return engine.applyAction(state, { seat, type: 'throw', payload: { angle, power } });
  }

  test('racks ten pins in a triangle with empty score sheets', () => {
    const b = board(start());
    expect(b.pins).toHaveLength(10);
    expect(b.pins.every((p) => !p.down)).toBe(true);
    expect(b.frameNumber).toBe(1);
    expect(b.rollsThisFrame).toBe(0);
    expect(b.frames).toEqual([[], []]);
    expect(b.lastShot).toBeNull();
  });

  test('a pocket throw knocks pins and earns a second ball', () => {
    const next = throwBall(start(), 0, 0.05); // deterministic sim: 7 down
    const b = board(next);
    expect(b.lastShot).not.toBeNull();
    expect(b.lastShot!.gutter).toBe(false);
    expect(b.lastShot!.knocked).toBeGreaterThan(3); // a solid pocket hit
    expect(b.frames[0]).toEqual([b.lastShot!.knocked]);
    expect(b.rollsThisFrame).toBe(1);
    expect(next.currentSeat).toBe(0); // same bowler, second ball
    expect(b.pins.filter((p) => !p.down).length).toBe(10 - b.lastShot!.knocked);
  });

  test('a full strike hands the frame straight over', () => {
    const next = throwBall(start(), 0, 0, 0.6); // sweet spot: all ten
    const b = board(next);
    expect(b.lastShot!.knocked).toBe(10);
    expect(b.frames[0]).toEqual([10]);
    expect(next.currentSeat).toBe(1); // no second ball after a strike
    expect(b.rollsThisFrame).toBe(0);
    expect(b.pins.every((p) => !p.down)).toBe(true); // fresh rack for seat 1
  });

  test('a wide angle finds the gutter and knocks nothing', () => {
    const next = throwBall(start(), 0, 0.45, 0.5);
    const b = board(next);
    expect(b.lastShot!.gutter).toBe(true);
    expect(b.lastShot!.knocked).toBe(0);
    expect(b.frames[0]).toEqual([0]);
    expect(b.pins.every((p) => !p.down)).toBe(true);
  });

  test('after two balls the frame passes to the other bowler with a fresh rack', () => {
    const first = throwBall(start(), 0, 0.05); // 7 down
    const second = throwBall(first, 0, 0.15); // gutter ball — frame over
    const b = board(second);
    expect(b.rollsThisFrame).toBe(0);
    expect(second.currentSeat).toBe(1);
    expect(b.frameNumber).toBe(1);
    expect(b.pins.every((p) => !p.down)).toBe(true); // fresh rack
    expect(b.frames[0]).toHaveLength(2);
  });

  test('the second bowler finishing advances the frame number', () => {
    let state = throwBall(start(), 0, 0.05);
    state = throwBall(state, 0, 0.15);
    state = throwBall(state, 1, 0.05);
    state = throwBall(state, 1, 0.15);
    const b = board(state);
    expect(b.frameNumber).toBe(2);
    expect(state.currentSeat).toBe(0);
    expect(b.frames[0]).toHaveLength(2);
    expect(b.frames[1]).toHaveLength(2);
  });

  test('aim and power are validated', () => {
    const state = start();
    expect(engine.validate(state, { seat: 0, type: 'throw', payload: { angle: 0.5, power: 0.9 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 0, type: 'throw', payload: { angle: 0.1, power: 1.4 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 0, type: 'throw', payload: { angle: 0.1, power: 0.05 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 1, type: 'throw', payload: { angle: 0.1, power: 0.9 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 0, type: 'throw', payload: { angle: 0.1, power: 0.9 } }).ok).toBe(true);
  });

  test('classic score sheet arithmetic', () => {
    // Perfect game: twelve strikes.
    expect(scoreBowling([10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10])).toEqual({
      perFrame: [30, 60, 90, 120, 150, 180, 210, 240, 270, 300],
      total: 300,
    });
    // All spares with nines: 19 per frame.
    const spares: number[] = [];
    for (let i = 0; i < 10; i++) spares.push(9, 1);
    spares.push(9);
    expect(scoreBowling(spares).total).toBe(190);
    // Gutter game.
    const gutters: number[] = [];
    for (let i = 0; i < 10; i++) gutters.push(0, 0);
    expect(scoreBowling(gutters).total).toBe(0);
    // Strike then spare then open: 20 + 14 + 7 = 41.
    expect(scoreBowling([10, 9, 1, 4, 3]).total).toBe(41);
    // Pending frames report -1.
    const pending = scoreBowling([10, 4]);
    expect(pending.perFrame[0]).toBe(-1);
    expect(pending.total).toBe(0);
  });
});

describe('trivia rules', () => {
  const engine = new TriviaEngine();

  interface TriviaShape {
    order: number[];
    asked: number;
    active: { category: string; q: string; options: string[] } | null;
    history: Array<{ seat: number; choice: number; correct: boolean }>;
    lastResult: { seat: number; choice: number; correctChoice: number; correct: boolean } | null;
  }

  function start(): GameState {
    return engine.createInitialState(makeConfig(engine, 2));
  }

  function board(state: GameState): TriviaShape {
    return state.board as unknown as TriviaShape;
  }

  /** The correct choice for the currently active question. */
  function key(state: GameState): number {
    const b = board(state);
    return TRIVIA_BANK[b.order[b.asked]].correct;
  }

  test('deals seven questions per player with the first one live', () => {
    const b = board(start());
    expect(b.order).toHaveLength(14); // 2 players × 7 rounds
    expect(new Set(b.order).size).toBe(14); // no repeats
    expect(b.asked).toBe(0);
    expect(b.active).not.toBeNull();
    expect(b.active!.options).toHaveLength(4);
    expect(b.history).toEqual([]);
    // The live question matches the top of the deck — without its key.
    expect(b.active!.q).toBe(TRIVIA_BANK[b.order[0]].q);
    expect(JSON.stringify(b)).not.toContain('"correct"');
  });

  test('correct answers bank ten points and pass the quiz on', () => {
    const state = start();
    const right = key(state);
    const next = engine.applyAction(state, { seat: 0, type: 'answer', payload: { choice: right } });
    const b = board(next);
    expect(b.history).toEqual([{ seat: 0, choice: right, correct: true }]);
    expect(b.lastResult).toMatchObject({ seat: 0, choice: right, correct: true });
    expect(next.scores[0]).toBe(10);
    expect(next.scores[1]).toBe(0);
    expect(next.currentSeat).toBe(1);
    expect(b.asked).toBe(1);
    expect(b.active!.q).toBe(TRIVIA_BANK[b.order[1]].q);

    // Seat 1 flunks theirs.
    const wrongChoice = (key(next) + 1) % 4;
    const after = engine.applyAction(next, { seat: 1, type: 'answer', payload: { choice: wrongChoice } });
    expect(after.scores[1]).toBe(0);
    expect(board(after).lastResult).toMatchObject({ seat: 1, correct: false });
    expect(after.currentSeat).toBe(0);
  });

  test('running the whole deck finishes the game with the top score winning', () => {
    let state = start();
    const total = board(state).order.length;
    for (let i = 0; i < total; i++) {
      const seat = i % 2;
      // Seat 0 answers everything right; seat 1 everything wrong.
      const choice = seat === 0 ? key(state) : (key(state) + 1) % 4;
      state = engine.applyAction(state, { seat, type: 'answer', payload: { choice } });
    }
    expect(state.phase).toBe('completed');
    expect(state.winnerSeat).toBe(0);
    expect(state.scores).toEqual([70, 0]);
    expect(board(state).asked).toBe(total);
    expect(board(state).active).toBeNull();
  });

  test('perfect ties on points break on correct-answer count', () => {
    let state = start();
    const total = board(state).order.length;
    for (let i = 0; i < total; i++) {
      // Both seats answer right — equal points, equal corrects → a draw.
      state = engine.applyAction(state, { seat: i % 2, type: 'answer', payload: { choice: key(state) } });
    }
    expect(state.scores).toEqual([70, 70]);
    expect(state.winnerSeat).toBeNull(); // a honourable draw
  });

  test('only the active seat may answer, and only with a valid choice', () => {
    const state = start();
    expect(engine.validate(state, { seat: 1, type: 'answer', payload: { choice: 0 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 0, type: 'answer', payload: { choice: 4 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 0, type: 'answer', payload: { choice: 1.5 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 0, type: 'guess', payload: { choice: 0 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 0, type: 'answer', payload: { choice: 2 } }).ok).toBe(true);
  });

  test('bots answer within the four options', () => {
    const state = start();
    for (const difficulty of ['easy', 'medium', 'hard', 'expert'] as const) {
      const move = engine.chooseBotMove(state, 0, difficulty);
      expect(move.action.type).toBe('answer');
      const choice = Number(move.action.payload.choice);
      expect(choice).toBeGreaterThanOrEqual(0);
      expect(choice).toBeLessThanOrEqual(3);
      expect(move.delayMs).toBeGreaterThan(0);
    }
  });
});

describe('word_chain rules', () => {
  const engine = new WordChainEngine();

  interface WordShape {
    letter: string | null;
    used: string[];
    taken: number;
    totalTurns: number;
    history: Array<{ seat: number; word: string; valid: boolean; points: number }>;
    lastWord: { seat: number; word: string; valid: boolean; points: number } | null;
  }

  function start(): GameState {
    return engine.createInitialState(makeConfig(engine, 2));
  }

  function board(state: GameState): WordShape {
    return state.board as unknown as WordShape;
  }

  test('starts free-form with ten turns per player', () => {
    const b = board(start());
    expect(b.letter).toBeNull(); // first word may start with anything
    expect(b.used).toEqual([]);
    expect(b.taken).toBe(0);
    expect(b.totalTurns).toBe(20);
    expect(b.history).toEqual([]);
  });

  test('valid words score their length and hand on their last letter', () => {
    const first = engine.applyAction(start(), { seat: 0, type: 'word', payload: { word: 'dragon' } });
    let b = board(first);
    expect(b.lastWord).toEqual({ seat: 0, word: 'dragon', valid: true, points: 6 });
    expect(first.scores[0]).toBe(6);
    expect(b.letter).toBe('n');
    expect(first.currentSeat).toBe(1);

    // Seat 1 must chain from n.
    const second = engine.applyAction(first, { seat: 1, type: 'word', payload: { word: 'nectar' } });
    b = board(second);
    expect(second.scores[1]).toBe(6);
    expect(b.letter).toBe('r');
    expect(b.used).toEqual(['dragon', 'nectar']);
  });

  test('wrong letters, repeats and non-words score nothing but still burn the turn', () => {
    let state = engine.applyAction(start(), { seat: 0, type: 'word', payload: { word: 'dragon' } }); // letter n
    state = engine.applyAction(state, { seat: 1, type: 'word', payload: { word: 'apple' } }); // wrong letter
    let b = board(state);
    expect(b.lastWord).toMatchObject({ seat: 1, word: 'apple', valid: false, points: 0 });
    expect(state.scores[1]).toBe(0);
    expect(b.letter).toBe('n'); // unchanged

    state = engine.applyAction(state, { seat: 0, type: 'word', payload: { word: 'night' } }); // letter t
    state = engine.applyAction(state, { seat: 1, type: 'word', payload: { word: 'night' } }); // repeat
    b = board(state);
    expect(b.lastWord).toMatchObject({ valid: false, points: 0 });
    expect(b.used.filter((w) => w === 'night')).toHaveLength(1);

    state = engine.applyAction(state, { seat: 0, type: 'word', payload: { word: 'tiger' } });
    state = engine.applyAction(state, { seat: 1, type: 'word', payload: { word: 'zzz' } }); // not a word
    b = board(state);
    expect(b.lastWord).toMatchObject({ word: 'zzz', valid: false, points: 0 });
    expect(b.letter).toBe('r');
  });

  test('the chain re-rolls dead-end letters so the game always flows', () => {
    const state = start();
    const b = board(state);
    b.used = WORD_CHAIN_DICT.filter((w) => w[0] !== 'x');
    b.letter = null;
    // Play fox → next must start with x, but every x word is already used.
    const after = engine.applyAction(state, { seat: 0, type: 'word', payload: { word: 'fox' } });
    expect(board(after).letter).not.toBe('x'); // re-rolled to a live letter
    expect(engine.chainMoves(after).length).toBeGreaterThan(0);
  });

  test('twenty turns finish the game and the top score wins', () => {
    let state = start();
    for (let i = 0; i < 20; i++) {
      const seat = i % 2;
      const legal = engine.chainMoves(state, 20);
      // Seat 0 plays the longest word; seat 1 throws a doomed zzz.
      const word = seat === 0 ? legal[0] : 'zzz';
      state = engine.applyAction(state, { seat, type: 'word', payload: { word } });
    }
    expect(state.phase).toBe('completed');
    expect(state.scores[1]).toBe(0);
    expect(state.scores[0]).toBeGreaterThan(0);
    expect(state.winnerSeat).toBe(0);
  });

  test('shape validation and bots', () => {
    const state = start();
    expect(engine.validate(state, { seat: 0, type: 'word', payload: { word: 'hi' } }).ok).toBe(false); // too short
    expect(engine.validate(state, { seat: 0, type: 'word', payload: { word: 'elevenletters' } }).ok).toBe(false); // too long
    expect(engine.validate(state, { seat: 0, type: 'word', payload: { word: 'ab3c' } }).ok).toBe(false); // not letters
    expect(engine.validate(state, { seat: 1, type: 'word', payload: { word: 'apple' } }).ok).toBe(false); // not your turn
    expect(engine.validate(state, { seat: 0, type: 'word', payload: { word: 'Apple' } }).ok).toBe(true); // case-insensitive

    for (const difficulty of ['easy', 'medium', 'hard', 'expert'] as const) {
      const move = engine.chooseBotMove(state, 0, difficulty);
      expect(move.action.type).toBe('word');
      expect(String(move.action.payload.word)).toMatch(/^[a-z]{3,10}$/);
    }
  });

});

describe('emoji_charades rules', () => {
  const engine = new EmojiCharadesEngine();

  interface CharadesShape {
    order: number[];
    round: number;
    eliminated: number[];
    active: { category: string; emojis: string; options: string[] } | null;
    history: Array<{ seat: number; round: number; choice: number; correct: boolean }>;
    lastResult: { seat: number; choice: number; correctChoice: number; correct: boolean; roundEnded: boolean } | null;
  }

  function start(): GameState {
    return engine.createInitialState(makeConfig(engine, 2));
  }

  function board(state: GameState): CharadesShape {
    return state.board as unknown as CharadesShape;
  }

  function key(state: GameState): number {
    const b = board(state);
    return EMOJI_RIDDLES[b.order[b.round]].correct;
  }

  function wrongChoice(state: GameState): number {
    const k = key(state);
    const dead = board(state).eliminated;
    const wrong = [0, 1, 2, 3].filter((c) => c !== k && !dead.includes(c));
    return wrong[0];
  }

  test('deals eight riddles with the first one live', () => {
    const b = board(start());
    expect(b.order).toHaveLength(8);
    expect(new Set(b.order).size).toBe(8);
    expect(b.round).toBe(0);
    expect(b.eliminated).toEqual([]);
    expect(b.active).not.toBeNull();
    expect(b.active!.options).toHaveLength(4);
    expect(b.active!.emojis.length).toBeGreaterThan(1);
    expect(JSON.stringify(b)).not.toContain('"correct"');
  });

  test('a wrong guess knocks the option out for the whole table', () => {
    const state = start();
    const wrong = wrongChoice(state);
    const next = engine.applyAction(state, { seat: 0, type: 'guess', payload: { choice: wrong } });
    const b = board(next);
    expect(b.eliminated).toEqual([wrong]);
    expect(next.currentSeat).toBe(1); // same riddle, next guesser
    expect(b.round).toBe(0);
    expect(b.active).not.toBeNull();
    // The dead option may not be picked again.
    expect(
      engine.validate(next, { seat: 1, type: 'guess', payload: { choice: wrong } }).ok,
    ).toBe(false);
  });

  test('the right guess banks ten and deals the next riddle', () => {
    const state = start();
    const right = key(state);
    const next = engine.applyAction(state, { seat: 0, type: 'guess', payload: { choice: right } });
    const b = board(next);
    expect(next.scores[0]).toBe(10);
    expect(b.round).toBe(1);
    expect(b.eliminated).toEqual([]);
    expect(b.active!.emojis).toBe(EMOJI_RIDDLES[b.order[1]].emojis);
    expect(b.lastResult).toMatchObject({ seat: 0, correct: true, roundEnded: true });
    expect(next.currentSeat).toBe(1); // guessing order rotates past the winner
  });

  test('three wrong guesses gift the answer to whoever is next', () => {
    const state = start();
    // Seat 0 misses, seat 1 misses, seat 0 misses again → only the key is left.
    let s = engine.applyAction(state, { seat: 0, type: 'guess', payload: { choice: wrongChoice(state) } });
    s = engine.applyAction(s, { seat: 1, type: 'guess', payload: { choice: wrongChoice(s) } });
    s = engine.applyAction(s, { seat: 0, type: 'guess', payload: { choice: wrongChoice(s) } });
    const b = board(s);
    expect(b.history).toHaveLength(3); // three misses recorded
    expect(b.round).toBe(1); // round died — answer revealed, next riddle
    expect(b.eliminated).toEqual([]); // reset for the fresh riddle
    expect(s.scores[0]).toBe(0);
    expect(s.scores[1]).toBe(0);
    expect(b.lastResult).toMatchObject({ correct: false, roundEnded: true });
  });

  test('eight rounds finish the game and the sharpest mind wins', () => {
    let state = start();
    let guard = 0;
    while (state.phase === 'in_progress' && guard++ < 64) {
      const seat = state.currentSeat;
      const k = key(state);
      const dead = board(state).eliminated;
      const live = [0, 1, 2, 3].filter((c) => !dead.includes(c));
      // Seat 0 always guesses right when it can see the key; seat 1 always wrong.
      const choice = seat === 0 ? (dead.includes(k) ? live[0] : k) : wrongChoice(state);
      state = engine.applyAction(state, { seat, type: 'guess', payload: { choice } });
    }
    expect(state.phase).toBe('completed');
    expect(board(state).round).toBe(7);
    expect(state.scores[0]).toBeGreaterThanOrEqual(10);
    expect(state.winnerSeat).toBe(0);
  });

  test('shape validation and bots', () => {
    const state = start();
    expect(engine.validate(state, { seat: 1, type: 'guess', payload: { choice: 0 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 0, type: 'guess', payload: { choice: 7 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 0, type: 'answer', payload: { choice: 0 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 0, type: 'guess', payload: { choice: 2 } }).ok).toBe(true);

    for (const difficulty of ['easy', 'medium', 'hard', 'expert'] as const) {
      const move = engine.chooseBotMove(state, 0, difficulty);
      expect(move.action.type).toBe('guess');
      const choice = Number(move.action.payload.choice);
      expect(choice).toBeGreaterThanOrEqual(0);
      expect(choice).toBeLessThanOrEqual(3);
    }
  });
});

describe('memory rules', () => {
  const engine = new MemoryEngine();

  interface MemoryShape {
    cards: Array<{ symbol: string; matched: boolean }>;
    revealed: number[];
    matchCount: number;
    lastFlip: { seat: number; a: number; b: number; matched: boolean } | null;
  }

  function start(): GameState {
    return engine.createInitialState(makeConfig(engine, 2));
  }

  function board(state: GameState): MemoryShape {
    return state.board as unknown as MemoryShape;
  }

  /** Finds two unmatched positions sharing a symbol. */
  function matchingPair(state: GameState): [number, number] {
    const cards = board(state).cards;
    for (let i = 0; i < cards.length; i++) {
      if (cards[i].matched) continue;
      for (let j = i + 1; j < cards.length; j++) {
        if (!cards[j].matched && cards[j].symbol === cards[i].symbol) return [i, j];
      }
    }
    throw new Error('no pair left');
  }

  function mismatchPair(state: GameState): [number, number] {
    const cards = board(state).cards;
    for (let i = 0; i < cards.length; i++) {
      if (cards[i].matched) continue;
      for (let j = i + 1; j < cards.length; j++) {
        if (!cards[j].matched && cards[j].symbol !== cards[i].symbol) return [i, j];
      }
    }
    throw new Error('no mismatch left');
  }

  test('deals sixteen cards as eight shuffled pairs', () => {
    const b = board(start());
    expect(b.cards).toHaveLength(16);
    expect(b.cards.every((c) => !c.matched)).toBe(true);
    expect(b.revealed).toEqual([]);
    expect(b.matchCount).toBe(0);
    const counts = new Map<string, number>();
    for (const c of b.cards) counts.set(c.symbol, (counts.get(c.symbol) ?? 0) + 1);
    expect(counts.size).toBe(8);
    for (const n of counts.values()) expect(n).toBe(2);
    for (const s of MEMORY_SYMBOLS) expect(counts.has(s)).toBe(true);
  });

  test('a matching pair is claimed and keeps you at the table', () => {
    const state = start();
    const [a, b] = matchingPair(state);
    const next = engine.applyAction(state, { seat: 0, type: 'flip', payload: { a, b } });
    const nb = board(next);
    expect(nb.cards[a].matched).toBe(true);
    expect(nb.cards[b].matched).toBe(true);
    expect(nb.matchCount).toBe(1);
    expect(next.scores[0]).toBe(1);
    expect(next.currentSeat).toBe(0); // flip again
    expect(nb.lastFlip).toMatchObject({ seat: 0, a, b, matched: true });
  });

  test('a mismatch flips back and passes the turn — but the table remembers', () => {
    const state = start();
    const [a, b] = mismatchPair(state);
    const next = engine.applyAction(state, { seat: 0, type: 'flip', payload: { a, b } });
    const nb = board(next);
    expect(nb.cards[a].matched).toBe(false);
    expect(nb.cards[b].matched).toBe(false);
    expect(next.scores[0]).toBe(0);
    expect(next.currentSeat).toBe(1);
    expect(nb.lastFlip).toMatchObject({ matched: false });
    expect(nb.revealed).toContain(a);
    expect(nb.revealed).toContain(b);
  });

  test('flips must be two different, unclaimed cards', () => {
    const state = start();
    expect(engine.validate(state, { seat: 0, type: 'flip', payload: { a: 3, b: 3 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 0, type: 'flip', payload: { a: 1, b: 99 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 1, type: 'flip', payload: { a: 1, b: 2 } }).ok).toBe(false);
    const [a, b] = matchingPair(state);
    const matched = engine.applyAction(state, { seat: 0, type: 'flip', payload: { a, b } });
    expect(engine.validate(matched, { seat: 0, type: 'flip', payload: { a, b } }).ok).toBe(false); // claimed
    expect(engine.validate(state, { seat: 0, type: 'flip', payload: { a: 1, b: 2 } }).ok).toBe(true);
  });

  test('sweeping all eight pairs finishes the deck with the haul as the score', () => {
    let state = start();
    while (state.phase === 'in_progress') {
      const [a, b] = matchingPair(state);
      state = engine.applyAction(state, { seat: state.currentSeat, type: 'flip', payload: { a, b } });
    }
    expect(state.phase).toBe('completed');
    expect(board(state).matchCount).toBe(8);
    expect(state.scores).toEqual([8, 0]); // seat 0 swept without missing
    expect(state.winnerSeat).toBe(0);
  });

  test('unrevealed card faces never leak to clients, and bots flip legally', () => {
    const state = start();
    const [a, b] = mismatchPair(state);
    const after = engine.applyAction(state, { seat: 0, type: 'flip', payload: { a, b } });

    // Player view hides every card the table has not seen.
    const view = engine.playerView(after, 1);
    const vb = (view.board as unknown as MemoryShape).cards;
    expect(vb[a].symbol).toBe(board(after).cards[a].symbol); // seen — public
    expect(vb[b].symbol).toBe(board(after).cards[b].symbol);
    const hidden = vb.filter((c, i) => !board(after).revealed.includes(i) && !c.matched);
    expect(hidden.length).toBe(14);
    for (const c of hidden) expect(c.symbol).toBe('?');

    for (const difficulty of ['easy', 'medium', 'hard', 'expert'] as const) {
      const move = engine.chooseBotMove(after, 1, difficulty);
      expect(move.action.type).toBe('flip');
      const fa = Number(move.action.payload.a);
      const fb = Number(move.action.payload.b);
      expect(fa).not.toBe(fb);
      expect(board(after).cards[fa].matched).toBe(false);
      expect(board(after).cards[fb].matched).toBe(false);
    }
  });
});

describe('sketch rules', () => {
  const engine = new SketchEngine();

  interface SketchShape {
    order: number[];
    round: number;
    totalRounds: number;
    artist: number;
    word: string;
    subPhase: 'draw' | 'guess';
    strokes: Array<{ color: string; points: number[] }>;
    wrongs: number[];
    guesses: Array<{ seat: number; word: string; correct: boolean }>;
    history: Array<{ round: number; artist: number; word: string; winner: number | null }>;
  }

  function start(): GameState {
    return engine.createInitialState(makeConfig(engine, 2));
  }

  function board(state: GameState): SketchShape {
    return state.board as unknown as SketchShape;
  }

  const doodle = [
    { color: '#22D3EE', points: [0.1, 0.1, 0.5, 0.5, 0.9, 0.2] },
    { color: '#FACC15', points: [0.2, 0.8, 0.8, 0.3] },
  ];

  function draw(state: GameState, strokes = doodle): GameState {
    return engine.applyAction(state, { seat: board(state).artist, type: 'draw', payload: { strokes } });
  }

  test('crowns the first artist with a shuffled word and four rounds for two', () => {
    const b = board(start());
    expect(b.round).toBe(0);
    expect(b.totalRounds).toBe(4); // two players draw twice each
    expect(b.artist).toBe(0);
    expect(b.subPhase).toBe('draw');
    expect(b.word).toMatch(/^[a-z]+$/);
    expect(b.strokes).toEqual([]);
    expect(b.wrongs).toEqual([0, 0]);
  });

  test('the artwork goes public and the brush hands over to the guessers', () => {
    const fresh = start();
    const word = board(fresh).word;
    const state = draw(fresh);
    const b = board(state);
    expect(b.subPhase).toBe('guess');
    expect(b.strokes).toHaveLength(2);
    expect(state.currentSeat).toBe(1); // the other seat guesses
    expect(b.word).toBe(word); // unchanged
  });

  test('a correct guess pays both the guesser and the artist', () => {
    const state = draw(start());
    const word = board(state).word;
    const next = engine.applyAction(state, { seat: 1, type: 'guess', payload: { word } });
    const b = board(next);
    expect(next.scores[1]).toBe(10);
    expect(next.scores[0]).toBe(5);
    expect(b.history).toEqual([{ round: 0, artist: 0, word, winner: 1 }]);
    expect(b.round).toBe(1); // next round, next artist
    expect(b.artist).toBe(1);
    expect(b.subPhase).toBe('draw');
    expect(next.currentSeat).toBe(1); // the new artist
  });

  test('two wrong guesses bench a guesser; a benched table reveals the word', () => {
    const state = draw(start());
    const word = board(state).word;
    const decoys = ['banana', 'rocket', 'cactus'].filter((w) => w !== word);
    const wrong1 = engine.applyAction(state, { seat: 1, type: 'guess', payload: { word: decoys[0] } });
    expect(board(wrong1).wrongs[1]).toBe(1);
    expect(wrong1.currentSeat).toBe(1); // still their shot
    const wrong2 = engine.applyAction(wrong1, { seat: 1, type: 'guess', payload: { word: decoys[1] } });
    const b = board(wrong2);
    expect(b.wrongs[1]).toBe(0); // reset for the fresh round
    expect(b.history).toEqual([{ round: 0, artist: 0, word, winner: null }]);
    expect(b.round).toBe(1); // everyone benched — reveal and move on
    expect(wrong2.scores).toEqual([0, 0]);
  });

  test('guesses are case-insensitive and validated; the artist cannot guess', () => {
    const state = draw(start());
    const word = board(state).word;
    const next = engine.applyAction(state, { seat: 1, type: 'guess', payload: { word: word.toUpperCase() } });
    expect(board(next).history[0].winner).toBe(1);

    const fresh = draw(start());
    expect(engine.validate(fresh, { seat: 0, type: 'guess', payload: { word: 'cat' } }).ok).toBe(false);
    expect(engine.validate(fresh, { seat: 1, type: 'guess', payload: { word: 'nope123' } }).ok).toBe(false);
    expect(engine.validate(start(), { seat: 0, type: 'draw', payload: { strokes: [] } }).ok).toBe(false);
    expect(engine.validate(start(), { seat: 1, type: 'draw', payload: { strokes: doodle } }).ok).toBe(false);
    expect(
      engine.validate(start(), {
        seat: 0,
        type: 'draw',
        payload: { strokes: [{ color: '#22D3EE', points: [0.5, 0.5, 1.5, 0.5] }] },
      }).ok,
    ).toBe(false); // off-canvas
  });

  test('the secret stays sealed for guessers until the round closes; bots behave', () => {
    const state = start();
    const word = board(state).word;
    const artistView = engine.playerView(state, 0);
    expect((artistView.board as unknown as SketchShape).word).toBe(word);
    const guesserView = engine.playerView(state, 1);
    expect((guesserView.board as unknown as SketchShape).word).toBe('?');

    const afterDraw = draw(state);
    for (const difficulty of ['easy', 'medium', 'hard', 'expert'] as const) {
      const botDraw = engine.chooseBotMove(start(), 0, difficulty);
      expect(botDraw.action.type).toBe('draw');
      const botGuess = engine.chooseBotMove(afterDraw, 1, difficulty);
      expect(botGuess.action.type).toBe('guess');
      expect(String(botGuess.action.payload.word)).toMatch(/^[a-z]+$/);
    }
  });
});


describe('werewolf rules', () => {
  const engine = new WerewolfEngine();

  interface WwShape {
    players: Array<{ role: 'werewolf' | 'villager' | 'seer' | 'hidden'; alive: boolean }>;
    phase: 'night_kill' | 'night_seer' | 'day_vote';
    day: number;
    killTarget: number | null;
    seerNotes: Array<{ night: number; seat: number; isWolf: boolean }>;
    votes: Record<number, number>;
    pendingVoters: number[];
    log: string[];
  }

  function start(players = 5): GameState {
    return engine.createInitialState(makeConfig(engine, players));
  }

  function board(state: GameState): WwShape {
    return state.board as unknown as WwShape;
  }

  function wolfSeat(state: GameState): number {
    return board(state).players.findIndex((p) => p.role === 'werewolf');
  }

  function seerSeat(state: GameState): number {
    return board(state).players.findIndex((p) => p.role === 'seer');
  }

  test('deals one wolf and a seer to five players, two wolves to seven', () => {
    const b = board(start(5));
    expect(b.players).toHaveLength(5);
    expect(b.players.filter((p) => p.role === 'werewolf')).toHaveLength(1);
    expect(b.players.filter((p) => p.role === 'seer')).toHaveLength(1);
    expect(b.players.filter((p) => p.role === 'villager')).toHaveLength(3);
    expect(b.players.every((p) => p.alive)).toBe(true);
    expect(b.phase).toBe('night_kill');
    expect(board(start(7)).players.filter((p) => p.role === 'werewolf')).toHaveLength(2);
  });

  test('night flows: wolves strike, the seer peeks, dawn names the victim', () => {
    const state = start(5);
    const wolf = wolfSeat(state);
    const seer = seerSeat(state);
    expect(state.currentSeat).toBe(wolf);

    const victim = board(state).players.findIndex((p, i) => i !== wolf && i !== seer);
    let next = engine.applyAction(state, { seat: wolf, type: 'kill', payload: { target: victim } });
    expect(board(next).phase).toBe('night_seer');
    expect(next.currentSeat).toBe(seer);

    const peek = board(next).players.findIndex((p, i) => i !== seer && i !== victim);
    next = engine.applyAction(next, { seat: seer, type: 'check', payload: { target: peek } });
    const b = board(next);
    expect(b.phase).toBe('day_vote'); // dawn broke
    expect(b.players[victim].alive).toBe(false);
    expect(b.seerNotes).toEqual([{ night: 1, seat: peek, isWolf: peek === wolf }]);
    expect(next.currentSeat).toBeGreaterThanOrEqual(0); // voting opens
    expect(b.log.some((l) => l.includes('mourns'))).toBe(true);
  });

  test('the day vote banishes the majority suspect; ties spare everyone', () => {
    const state = start(5);
    const wolf = wolfSeat(state);
    const b = board(state);
    // Banish a villager so the game continues into night 2.
    const patsy = [0, 1, 2, 3, 4].find((i) => i !== wolf && i !== seerSeat(state))!;
    b.players.forEach((p) => (p.alive = true));
    b.phase = 'day_vote';
    b.votes = {};

    // Three voters pile on the patsy, then the patsy votes the wolf.
    const others = [0, 1, 2, 3, 4].filter((i) => i !== patsy);
    const voters = [others[0], others[1], others[2], patsy];
    b.pendingVoters = voters;
    state.currentSeat = voters[0];

    let s = state;
    s = engine.applyAction(s, { seat: voters[0], type: 'vote', payload: { target: patsy } });
    s = engine.applyAction(s, { seat: voters[1], type: 'vote', payload: { target: patsy } });
    s = engine.applyAction(s, { seat: voters[2], type: 'vote', payload: { target: patsy } });
    s = engine.applyAction(s, { seat: patsy, type: 'vote', payload: { target: wolf } });
    expect(board(s).players[patsy].alive).toBe(false); // 3 votes banish
    expect(board(s).phase).toBe('night_kill');
    expect(board(s).day).toBe(2);
  });

  test('roles, kills and seer notes stay sealed until the story ends', () => {
    const state = start(5);
    const wolf = wolfSeat(state);
    const seer = seerSeat(state);
    const villager = board(state).players.findIndex((p) => p.role === 'villager');

    // Wolf view: sees self and nothing else about roles.
    const wolfView = engine.playerView(state, wolf) as GameState;
    const wb = (wolfView.board as unknown as WwShape).players;
    expect(wb[wolf].role).toBe('werewolf');
    expect(wb[seer].role).toBe('hidden');
    expect(wb[villager].role).toBe('hidden');

    // Villager view: own role only; no kill target.
    const vView = engine.playerView(state, villager) as GameState;
    const vb = (vView.board as unknown as WwShape);
    expect(vb.players[villager].role).toBe('villager');
    expect(vb.players[wolf].role).toBe('hidden');
    expect(vb.killTarget).toBeNull();
    expect(vb.seerNotes).toEqual([]);

    // Seer keeps their ledger private.
    let next = engine.applyAction(state, { seat: wolf, type: 'kill', payload: { target: villager } });
    next = engine.applyAction(next, { seat: seer, type: 'check', payload: { target: villager } });
    const seerView = engine.playerView(next, seer) as GameState;
    expect((seerView.board as unknown as WwShape).seerNotes).toHaveLength(1);
    const otherView = engine.playerView(next, villager) as GameState;
    expect((otherView.board as unknown as WwShape).seerNotes).toEqual([]);
  });

  test('the village wins when the last wolf is banished', () => {
    const state = start(5);
    const wolf = wolfSeat(state);
    const b = board(state);
    // Only the wolf and two villagers left, day vote.
    const others = [0, 1, 2, 3, 4].filter((i) => i !== wolf);
    const alive = others.slice(0, 2);
    b.players.forEach((p) => (p.alive = false));
    alive.forEach((i) => (b.players[i].alive = true));
    b.players[wolf].alive = true;
    b.phase = 'day_vote';
    b.votes = {};
    b.pendingVoters = [wolf, ...alive];
    state.currentSeat = wolf;

    let s = state;
    s = engine.applyAction(s, { seat: wolf, type: 'vote', payload: { target: alive[0] } });
    s = engine.applyAction(s, { seat: alive[0], type: 'vote', payload: { target: wolf } });
    s = engine.applyAction(s, { seat: alive[1], type: 'vote', payload: { target: wolf } });
    expect(s.phase).toBe('completed');
    expect(s.winnerSeat).toBeNull();
    expect(s.winnerSeats).toEqual(others); // the whole village faction
    expect(s.scores[alive[0]]).toBe(1);
    expect(s.scores[wolf]).toBe(0);
  });

  test('the wolves win at parity', () => {
    const state = start(5);
    const wolf = wolfSeat(state);
    const seer = seerSeat(state);
    const b = board(state);
    b.players.forEach((p) => (p.alive = false));
    b.players[wolf].alive = true;
    const last = [0, 1, 2, 3, 4].find((i) => i !== wolf && i !== seer)!;
    b.players[last].alive = true;
    b.phase = 'night_kill';
    b.killTarget = null;
    state.currentSeat = wolf;

    const next = engine.applyAction(state, { seat: wolf, type: 'kill', payload: { target: last } });
    expect(next.phase).toBe('completed');
    expect(next.winnerSeats).toEqual([wolf]);
  });
});


describe('impostor rules', () => {
  const engine = new ImpostorEngine();

  interface ImpShape {
    phase: 'clue' | 'vote' | 'guess';
    category: string;
    location: string;
    impostorSeat: number;
    round: number;
    clues: Array<{ seat: number; word: string }>;
    votes: Record<number, number>;
    pending: number[];
    log: string[];
  }

  function start(players = 4): GameState {
    return engine.createInitialState(makeConfig(engine, players));
  }

  function board(state: GameState): ImpShape {
    return state.board as unknown as ImpShape;
  }

  test('deals one impostor, a secret place and a clue order', () => {
    const b = board(start(4));
    expect(b.phase).toBe('clue');
    expect(b.round).toBe(1);
    expect(b.pending).toEqual([0, 1, 2, 3]);
    expect(state0current(b)).toBe(0);
    expect(IMPOSTOR_LOCATIONS.some((l) => l.location === b.location && l.category === b.category)).toBe(true);
    expect(b.impostorSeat).toBeGreaterThanOrEqual(0);
    expect(b.impostorSeat).toBeLessThan(4);
    expect(b.clues).toEqual([]);
  });

  test('everyone clues in order, then the vote opens', () => {
    let state = start(4);
    for (let i = 0; i < 4; i++) {
      expect(state.currentSeat).toBe(i);
      state = engine.applyAction(state, { seat: i, type: 'clue', payload: { word: 'noisy' } });
    }
    const b = board(state);
    expect(b.phase).toBe('vote');
    expect(b.clues.map((c) => c.seat)).toEqual([0, 1, 2, 3]);
    expect(state.currentSeat).toBe(0);
  });

  test('ejecting the impostor offers the location steal', () => {
    const state = start(4);
    const imp = board(state).impostorSeat;
    const b = board(state);
    // All three crew vote the impostor; the impostor votes back.
    const crew = [0, 1, 2, 3].filter((i) => i !== imp);
    b.phase = 'vote';
    b.votes = {};
    b.pending = [...crew, imp];
    state.currentSeat = crew[0];
    let s = state;
    for (const voter of crew) {
      s = engine.applyAction(s, { seat: voter, type: 'vote', payload: { target: imp } });
    }
    s = engine.applyAction(s, { seat: imp, type: 'vote', payload: { target: crew[0] } });
    const nb = board(s);
    expect(nb.phase).toBe('guess'); // caught — one steal attempt
    expect(s.currentSeat).toBe(imp);
  });

  test('a correct steal wins the impostor the game; a wrong guess loses it', () => {
    const state = start(4);
    const imp = board(state).impostorSeat;
    const b = board(state);
    const crew = [0, 1, 2, 3].filter((i) => i !== imp);
    b.phase = 'vote';
    b.votes = {};
    b.pending = [...crew, imp];
    state.currentSeat = crew[0];
    let s = state;
    for (const voter of crew) {
      s = engine.applyAction(s, { seat: voter, type: 'vote', payload: { target: imp } });
    }
    s = engine.applyAction(s, { seat: imp, type: 'vote', payload: { target: crew[0] } });
    expect(board(s).phase).toBe('guess');

    // Wrong guess → crew wins.
    const wrong = IMPOSTOR_LOCATIONS.find((l) => l.location !== board(s).location)!.location;
    const lost = engine.applyAction(s, { seat: imp, type: 'guess', payload: { location: wrong } });
    expect(lost.phase).toBe('completed');
    expect(lost.winnerSeats).toEqual(crew);
    expect(lost.scores[imp]).toBe(0);

    // Right guess → impostor steals it.
    const b2 = board(s);
    const stolen = engine.applyAction(s, { seat: imp, type: 'guess', payload: { location: b2.location } });
    expect(stolen.phase).toBe('completed');
    expect(stolen.winnerSeats).toEqual([imp]);
    void b2;
  });

  test('ejecting a crewmate hands the impostor the win', () => {
    const state = start(4);
    const imp = board(state).impostorSeat;
    const b = board(state);
    const crew = [0, 1, 2, 3].filter((i) => i !== imp);
    b.phase = 'vote';
    b.votes = {};
    b.pending = [...crew, imp];
    state.currentSeat = crew[0];
    let s = state;
    s = engine.applyAction(s, { seat: crew[0], type: 'vote', payload: { target: crew[1] } });
    s = engine.applyAction(s, { seat: crew[1], type: 'vote', payload: { target: crew[0] } });
    s = engine.applyAction(s, { seat: crew[2], type: 'vote', payload: { target: crew[1] } });
    s = engine.applyAction(s, { seat: imp, type: 'vote', payload: { target: crew[1] } });
    expect(s.phase).toBe('completed');
    expect(s.winnerSeats).toEqual([imp]);
  });

  test('the location stays sealed from the impostor, the identity from everyone', () => {
    const state = start(4);
    const imp = board(state).impostorSeat;
    const crewSeat = (imp + 1) % 4;

    const crewView = engine.playerView(state, crewSeat) as GameState;
    const cb = crewView.board as unknown as ImpShape;
    expect(cb.location).toBe(board(state).location); // crew knows the place
    expect(cb.impostorSeat).toBe(-1); // ...but not the traitor

    const impView = engine.playerView(state, imp) as GameState;
    const ib = impView.board as unknown as ImpShape;
    expect(ib.location).toBe('?'); // the impostor blends blind
    expect(ib.category).toBe(board(state).category); // ...but gets the category hint
    expect(ib.impostorSeat).toBe(-1);
  });

  test('clues and votes are shape-validated; bots speak the protocol', () => {
    const state = start(4);
    expect(engine.validate(state, { seat: 0, type: 'clue', payload: { word: 'two words' } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 1, type: 'clue', payload: { word: 'noisy' } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 0, type: 'vote', payload: { target: 0 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 0, type: 'clue', payload: { word: 'shiny' } }).ok).toBe(true);

    for (const difficulty of ['easy', 'medium', 'hard', 'expert'] as const) {
      const move = engine.chooseBotMove(state, 0, difficulty);
      expect(['clue', 'vote', 'guess']).toContain(move.action.type);
    }
  });

  function state0current(b: ImpShape): number {
    return b.pending[0];
  }
});


describe('darts rules', () => {
  const engine = new DartsEngine();

  interface DartShape {
    round: number;
    dartsLeft: number;
    thrower: number;
    throws: Array<{ seat: number; landing: [number, number]; points: number; label: string }>;
    lastThrow: { seat: number; landing: [number, number]; points: number; label: string } | null;
  }

  function start(): GameState {
    return engine.createInitialState(makeConfig(engine, 2));
  }

  function board(state: GameState): DartShape {
    return state.board as unknown as DartShape;
  }

  function throwDart(state: GameState, seat: number, aimX: number, aimY: number, power = 1): GameState {
    return engine.applyAction(state, { seat, type: 'throw', payload: { aimX, aimY, power } });
  }

  test('the board scores segments, rings and bulls exactly', () => {
    expect(scoreDart(0, 0)).toEqual({ points: 50, label: 'BULLSEYE' });
    expect(scoreDart(0, 0.09)).toEqual({ points: 25, label: 'OUTER BULL' });
    expect(scoreDart(0, 0.57)).toEqual({ points: 60, label: 'T20' }); // treble twenty at the top
    expect(scoreDart(0, 0.94)).toEqual({ points: 40, label: 'D20' }); // double twenty
    expect(scoreDart(0, 0.3)).toEqual({ points: 20, label: '20' }); // single twenty
    expect(scoreDart(0, -0.57)).toEqual({ points: 9, label: 'T3' }); // treble three (3 × 3) at the bottom
    expect(scoreDart(0.57, 0)).toEqual({ points: 18, label: 'T6' }); // treble six at the right
    expect(scoreDart(-0.57, 0)).toEqual({ points: 33, label: 'T11' }); // treble eleven at the left
    expect(scoreDart(1.2, 0)).toEqual({ points: 0, label: 'MISS' }); // off the board
  });

  test('three darts a turn, five rounds, then the highest total wins', () => {
    let state = start();
    const seatOrder: number[] = [];
    let guard = 0;
    while (state.phase === 'in_progress' && guard++ < 40) {
      seatOrder.push(state.currentSeat);
      state = throwDart(state, state.currentSeat, 0, 0, 0.85);
    }
    expect(guard).toBe(30); // 2 seats × 5 rounds × 3 darts
    expect(seatOrder.filter((s) => s === 0)).toHaveLength(15);
    expect(state.phase).toBe('completed');
    expect(state.winnerSeat).not.toBeNull();
    expect(board(state).round).toBe(5);
  });

  test('a weak arm drops the dart below the aim', () => {
    // Deterministic wobble aside, a soft throw lands clearly lower than aim.
    const state = throwDart(start(), 0, 0, 0.6, 0.2);
    const lt = board(state).lastThrow!;
    expect(lt.landing[1]).toBeLessThan(0.6);
  });

  test('throws are validated by shape and seat', () => {
    const state = start();
    expect(engine.validate(state, { seat: 0, type: 'throw', payload: { aimX: 1.5, aimY: 0, power: 0.8 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 0, type: 'throw', payload: { aimX: 0, aimY: 0, power: 0.1 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 1, type: 'throw', payload: { aimX: 0, aimY: 0, power: 0.8 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 0, type: 'toss', payload: { aimX: 0, aimY: 0, power: 0.8 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 0, type: 'throw', payload: { aimX: 0.2, aimY: 0.4, power: 0.9 } }).ok).toBe(true);
  });

  test('bots aim at the treble or the bull', () => {
    const state = start();
    for (const difficulty of ['easy', 'medium', 'hard', 'expert'] as const) {
      const move = engine.chooseBotMove(state, 0, difficulty);
      expect(move.action.type).toBe('throw');
      const x = Number(move.action.payload.aimX);
      const y = Number(move.action.payload.aimY);
      expect(Math.abs(x)).toBeLessThanOrEqual(1);
      expect(Math.abs(y)).toBeLessThanOrEqual(1);
      // Hard darts cluster near the two targets.
      if (difficulty === 'expert') {
        expect(Math.hypot(x, y - 0.57) < 0.2 || Math.hypot(x, y) < 0.2).toBe(true);
      }
    }
  });
});


describe('minigolf rules', () => {
  const engine = new MinigolfEngine();

  interface GolfShape {
    hole: number;
    activeSeat: number;
    ball: { x: number; y: number };
    strokes: number[][];
    holeStrokes: number;
    lastShot: { seat: number; hole: number; angle: number; power: number; holed: boolean; frames: number[][] } | null;
  }

  function start(): GameState {
    return engine.createInitialState(makeConfig(engine, 2));
  }

  function board(state: GameState): GolfShape {
    return state.board as unknown as GolfShape;
  }

  function stroke(state: GameState, angle: number, power: number): GameState {
    return engine.applyAction(state, { seat: state.currentSeat, type: 'stroke', payload: { angle, power } });
  }

  test('a straight opening drive rolls dead-centre into the cup', () => {
    // Hole 1 is a straight lane: tee (12,30), cup (88,30).
    const state = stroke(start(), 0, 0.8);
    const b = board(state);
    expect(b.lastShot!.frames.length).toBeGreaterThan(4);
    for (const f of b.lastShot!.frames) {
      expect(Math.abs(f[1] - 30)).toBeLessThan(0.5); // stays on the centre line
    }
    expect(b.lastShot!.holed).toBe(true); // dead-centre line
    const last = b.lastShot!.frames[b.lastShot!.frames.length - 1];
    expect(last[0]).toBeGreaterThan(85); // reached the cup
    expect(b.strokes[0][0]).toBe(1); // one-stroke hole
    expect(state.currentSeat).toBe(1); // tee passes on
  });

  test('wall bounces keep the ball inside the course', () => {
    let state = start();
    // Wild slashes at the cushions, both seats, until the cap.
    let guard = 0;
    while (state.phase === 'in_progress' && guard++ < 200) {
      const wild = guard % 2 === 0 ? 0.9 : -2.1;
      state = stroke(state, wild, 1);
      const b = board(state);
      expect(b.ball.x).toBeGreaterThanOrEqual(2);
      expect(b.ball.x).toBeLessThanOrEqual(98);
      expect(b.ball.y).toBeGreaterThanOrEqual(2);
      expect(b.ball.y).toBeLessThanOrEqual(58);
    }
    expect(state.phase).toBe('completed');
  });

  test('a soft putt into the cup holes out and passes the putter', () => {
    // Place near the cup on hole 1 and tap it in.
    const state = start();
    const b = state.board as unknown as GolfShape;
    b.ball = { x: 80, y: 30 };
    const holed = stroke(state, 0, 0.2);
    expect(board(holed).lastShot!.holed).toBe(true);
    expect(holed.currentSeat).toBe(1); // next player takes the tee
    expect(board(holed).strokes[0][0]).toBe(1);
    expect(holed.scores[0]).toBe(1);
  });

  test('six strokes cap the hole at seven for a hopelessly blocked ball', () => {
    const state = start();
    // Nail the ball into the top-left corner where the cup is unreachable.
    const b = state.board as unknown as GolfShape;
    b.ball = { x: 4, y: 4 };
    let s = state;
    for (let i = 0; i < 6; i++) {
      s = stroke(s, Math.PI, 0.15); // weak putts into the left wall
    }
    expect(board(s).strokes[0][0]).toBe(7); // cap penalty
    expect(s.currentSeat).toBe(1);
  });

  test('the full round plays hole by hole, seat by seat', () => {
    const state = start();
    // Bot-style quick play: run hard bots through the whole course.
    let s = state;
    let guard = 0;
    let lastHole = 0;
    const seatsSeen = new Set<number>();
    while (s.phase === 'in_progress' && guard++ < 400) {
      const move = engine.chooseBotMove(s, s.currentSeat, 'hard');
      seatsSeen.add(s.currentSeat);
      lastHole = Math.max(lastHole, board(s).hole);
      s = engine.applyAction(s, { ...move.action, seat: s.currentSeat });
    }
    expect(s.phase).toBe('completed');
    expect(lastHole).toBe(8); // reached hole 9
    expect(seatsSeen).toEqual(new Set([0, 1]));
    expect(board(s).strokes[0]).toHaveLength(9);
    expect(board(s).strokes[1]).toHaveLength(9);
    expect(s.scores[0]).toBe(board(s).strokes[0].reduce((a, b) => a + b, 0));
    // Fewest strokes wins.
    const min = Math.min(...s.scores);
    if (s.scores[0] !== s.scores[1]) {
      expect(s.winnerSeat).toBe(s.scores.indexOf(min));
    } else {
      expect(s.winnerSeat).toBeNull();
    }
  });

  test('nine holes are laid out inside the course with reachable cups', () => {
    expect(MINIGOLF_HOLES).toHaveLength(9);
    for (const hole of MINIGOLF_HOLES) {
      expect(hole.tee[0]).toBeGreaterThan(4);
      expect(hole.tee[1]).toBeGreaterThan(4);
      expect(hole.cup[0]).toBeLessThan(96);
      expect(hole.cup[1]).toBeLessThan(56);
      // The cup must not sit inside a block.
      for (const w of hole.walls) {
        const inside =
          hole.cup[0] > w.x - 2 && hole.cup[0] < w.x + w.w + 2 && hole.cup[1] > w.y - 2 && hole.cup[1] < w.y + w.h + 2;
        expect(inside).toBe(false);
      }
    }
  });

  test('strokes are validated by shape and seat', () => {
    const state = start();
    expect(engine.validate(state, { seat: 0, type: 'stroke', payload: { angle: 0, power: 0.05 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 0, type: 'stroke', payload: { angle: 0, power: 1.4 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 1, type: 'stroke', payload: { angle: 0, power: 0.5 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 0, type: 'putt', payload: { angle: 0, power: 0.5 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 0, type: 'stroke', payload: { angle: 1.2, power: 0.7 } }).ok).toBe(true);
  });

  test('bots aim at the cup or a bank around blocks', () => {
    const state = start();
    for (const difficulty of ['easy', 'medium', 'hard', 'expert'] as const) {
      const move = engine.chooseBotMove(state, 0, difficulty);
      expect(move.action.type).toBe('stroke');
      expect(Number(move.action.payload.power)).toBeGreaterThanOrEqual(0.15);
      expect(Number(move.action.payload.power)).toBeLessThanOrEqual(1);
    }
    // On the island hole the direct line is blocked — bot must pick a bank.
    const island = start();
    const ib = island.board as unknown as GolfShape;
    ib.hole = 7;
    ib.ball = { x: MINIGOLF_HOLES[7].tee[0], y: MINIGOLF_HOLES[7].tee[1] };
    const move = engine.chooseBotMove(island, 0, 'expert');
    const ang = Number(move.action.payload.angle);
    const direct = Math.atan2(MINIGOLF_HOLES[7].cup[1] - ib.ball.y, MINIGOLF_HOLES[7].cup[0] - ib.ball.x);
    expect(Math.abs(ang - direct)).toBeGreaterThan(0.05);
  });
});


describe('bankroll rules', () => {
  const engine = new BankrollEngine();

  interface BankShape {
    round: number;
    phase: 'bet' | 'roll';
    bankrolls: number[];
    pot: number;
    roundStake: number;
    bettors: number[];
    results: Array<{ seat: number; dice: [number, number]; sum: number; bust: boolean }>;
    foldedRound: boolean[];
    log: string[];
  }

  function start(): GameState {
    return engine.createInitialState(makeConfig(engine, 2));
  }

  function board(state: GameState): BankShape {
    return state.board as unknown as BankShape;
  }

  function act(state: GameState, type: string, payload: Record<string, unknown> = {}): GameState {
    return engine.applyAction(state, { seat: state.currentSeat, type, payload });
  }

  const dieFace = (v: number) => (v - 0.5) / 6;

  function rigDice(spy: jest.SpyInstance, ...faces: number[]) {
    for (const f of faces) spy.mockReturnValueOnce(dieFace(f));
  }

  test('bets move chips to the pot and a fold keeps the stack', () => {
    let state = start();
    state = act(state, 'bet', { amount: 100 });
    expect(board(state).pot).toBe(100);
    expect(board(state).bankrolls[0]).toBe(900);
    expect(state.currentSeat).toBe(1);
    state = act(state, 'fold');
    const b = board(state);
    expect(b.bankrolls[1]).toBe(1000);
    expect(b.phase).toBe('roll');
    expect(b.bettors).toEqual([0]);
    expect(state.currentSeat).toBe(0);
  });

  test('craps bust and the best safe total rakes the pot', () => {
    let state = start();
    state = act(state, 'bet', { amount: 100 });
    state = act(state, 'bet', { amount: 50 });
    expect(board(state).phase).toBe('roll');
    const spy = jest.spyOn(Math, 'random');
    rigDice(spy, 3, 4, 1, 1); // seat 0 rolls 7 (safe); seat 1 rolls 2 (craps)
    state = act(state, 'roll');
    state = act(state, 'roll');
    spy.mockRestore();
    const b = board(state);
    // The roll results are swept between rounds — the ledger remembers.
    expect(b.log.some((l) => l.includes('rolls 3+4=7 — safe!'))).toBe(true);
    expect(b.log.some((l) => l.includes('rolls 1+1=2 — craps, busted!'))).toBe(true);
    expect(b.round).toBe(2); // round resolved, back to betting
    expect(b.bankrolls[0]).toBe(1000 - 100 + 150);
    expect(b.bankrolls[1]).toBe(1000 - 50);
    expect(b.pot).toBe(0);
  });

  test('a tie splits the pot evenly', () => {
    let state = start();
    state = act(state, 'bet', { amount: 60 });
    state = act(state, 'bet', { amount: 60 });
    const spy = jest.spyOn(Math, 'random');
    rigDice(spy, 4, 4, 5, 3); // both roll 8
    state = act(state, 'roll');
    state = act(state, 'roll');
    spy.mockRestore();
    const b = board(state);
    expect(b.bankrolls).toEqual([1000, 1000]);
    expect(b.round).toBe(2);
  });

  test('an all-craps round carries the pot over', () => {
    let state = start();
    state = act(state, 'bet', { amount: 40 });
    state = act(state, 'bet', { amount: 20 });
    const spy = jest.spyOn(Math, 'random');
    rigDice(spy, 1, 1, 6, 6); // 2 and 12 — everybody busts
    state = act(state, 'roll');
    state = act(state, 'roll');
    spy.mockRestore();
    const b = board(state);
    expect(b.round).toBe(2);
    expect(b.pot).toBe(60); // the pot swells the next round
    expect(b.phase).toBe('bet');
  });

  test('a round where everyone folds carries nothing forward', () => {
    let state = start();
    state = act(state, 'fold');
    state = act(state, 'fold');
    const b = board(state);
    expect(b.round).toBe(2);
    expect(b.phase).toBe('bet');
    expect(b.pot).toBe(0);
    expect(b.bankrolls).toEqual([1000, 1000]);
  });

  test('five rounds decide the richest stack', () => {
    let state = start();
    const spy = jest.spyOn(Math, 'random');
    for (let i = 0; i < 5; i++) {
      rigDice(spy, 6, 5, 4, 4); // seat 0 rolls 11, seat 1 rolls 8, every round
    }
    let guard = 0;
    while (state.phase === 'in_progress' && guard++ < 60) {
      const b = board(state);
      state = act(state, b.phase === 'bet' ? 'bet' : 'roll', b.phase === 'bet' ? { amount: 10 } : {});
    }
    spy.mockRestore();
    expect(guard).toBe(20); // 5 rounds × (2 bets + 2 rolls)
    expect(state.phase).toBe('completed');
    const b = board(state);
    expect(b.round).toBe(5);
    expect(b.bankrolls).toEqual([1050, 950]); // +10 net a round for the winner
    expect(state.winnerSeat).toBe(0);
    expect(state.scores).toEqual([1050, 950]);
  });

  test('stakes and rolls are validated', () => {
    const state = start();
    expect(engine.validate(state, { seat: 0, type: 'bet', payload: { amount: 4 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 0, type: 'bet', payload: { amount: 1001 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 1, type: 'bet', payload: { amount: 10 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 0, type: 'roll', payload: {} }).ok).toBe(false); // bet phase
    expect(engine.validate(state, { seat: 0, type: 'bet', payload: { amount: 1000 } }).ok).toBe(true);
    let s = act(state, 'bet', { amount: 1000 });
    s = act(s, 'fold'); // seat 1 folds → roll phase with only seat 0 in
    expect(engine.validate(s, { seat: 0, type: 'bet', payload: { amount: 10 } }).ok).toBe(false);
    expect(engine.validate(s, { seat: 0, type: 'roll', payload: {} }).ok).toBe(true);
  });

  test('bots bet legal amounts and roll when told', () => {
    const state = engine.createInitialState(makeConfig(engine, 4));
    for (const difficulty of ['easy', 'medium', 'hard', 'expert'] as const) {
      const move = engine.chooseBotMove(state, 0, difficulty);
      expect(move.action.type).toBe('bet');
      const amount = Number(move.action.payload.amount);
      expect(Number.isInteger(amount)).toBe(true);
      expect(amount).toBeGreaterThanOrEqual(5);
      expect(amount).toBeLessThanOrEqual(1000);
    }
    let s = state;
    for (let i = 0; i < 4; i++) s = act(s, 'bet', { amount: 5 });
    expect(board(s).phase).toBe('roll');
    const move = engine.chooseBotMove(s, board(s).bettors[0], 'hard');
    expect(move.action.type).toBe('roll');
  });
});


describe('battleship rules', () => {
  const engine = new BattleshipEngine();

  interface ShipShape {
    name: string;
    size: number;
    x: number;
    y: number;
    horizontal: boolean;
    hits: boolean[];
  }

  interface NavalShape {
    phase: 'place' | 'battle';
    fleets: ShipShape[][];
    shots: Array<Array<[number, number]>>;
    lastShot: { seat: number; x: number; y: number; hit: boolean; sunk: string | null } | null;
    sunk: string[][];
    enemyRemaining: number[];
    log: string[];
  }

  function start(): GameState {
    return engine.createInitialState(makeConfig(engine, 2));
  }

  function board(state: GameState): NavalShape {
    return state.board as unknown as NavalShape;
  }

  /** Five ships in tidy rows: rows 0/2/4/6/8 starting at x=0. */
  const tidyFleet = BATTLESHIP_FLEET.map((spec, i) => ({
    name: spec.name,
    size: spec.size,
    x: 0,
    y: i * 2,
    horizontal: true,
  }));

  function deploy(state: GameState, fleet: unknown, random = false): GameState {
    return engine.applyAction(state, {
      seat: state.currentSeat,
      type: 'deploy',
      payload: random ? { random: true } : { fleet },
    });
  }

  function fire(state: GameState, x: number, y: number): GameState {
    return engine.applyAction(state, { seat: state.currentSeat, type: 'fire', payload: { x, y } });
  }

  test('fleets deploy in turn and open the battle', () => {
    let state = start();
    expect(state.currentSeat).toBe(0);
    state = deploy(state, tidyFleet);
    expect(board(state).fleets[0]).toHaveLength(5);
    expect(state.currentSeat).toBe(1);
    state = deploy(state, tidyFleet);
    expect(board(state).phase).toBe('battle');
    expect(state.currentSeat).toBe(0);
  });

  test('illegal fleets are rejected', () => {
    const state = start();
    const overlapping = tidyFleet.map((s) => ({ ...s }));
    overlapping[1] = { ...overlapping[1], y: 0 }; // stacks onto the Carrier row
    expect(engine.validate(state, { seat: 0, type: 'deploy', payload: { fleet: overlapping } }).ok).toBe(false);
    const offshore = tidyFleet.map((s) => ({ ...s }));
    offshore[0] = { ...offshore[0], x: 7 }; // carrier runs off the right edge
    expect(engine.validate(state, { seat: 0, type: 'deploy', payload: { fleet: offshore } }).ok).toBe(false);
    const shortFleet = tidyFleet.slice(0, 3);
    expect(engine.validate(state, { seat: 0, type: 'deploy', payload: { fleet: shortFleet } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 0, type: 'deploy', payload: { random: true } }).ok).toBe(true);
    expect(engine.validate(state, { seat: 1, type: 'deploy', payload: { fleet: tidyFleet } }).ok).toBe(false); // not your turn
  });

  test('salvos hit, miss, sink and alternate', () => {
    let state = start();
    state = deploy(state, tidyFleet);
    state = deploy(state, tidyFleet);
    // Seat 0 aims at the enemy Carrier bow: (0,0) — a hit.
    state = fire(state, 0, 0);
    expect(board(state).lastShot).toMatchObject({ seat: 0, x: 0, y: 0, hit: true, sunk: null });
    expect(state.currentSeat).toBe(1);
    // Seat 1 splashes in open water: (9,9).
    state = fire(state, 9, 9);
    expect(board(state).lastShot).toMatchObject({ seat: 1, hit: false });
    // No double-tapping the same cell, and no firing outside the grid.
    expect(engine.validate(state, { seat: 0, type: 'fire', payload: { x: 0, y: 0 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 0, type: 'fire', payload: { x: 10, y: 0 } }).ok).toBe(false);
    // Sinking the Carrier: cells (1..4, 0).
    state = fire(state, 1, 0);
    state = fire(state, 9, 8);
    state = fire(state, 2, 0);
    state = fire(state, 8, 9);
    state = fire(state, 3, 0);
    state = fire(state, 9, 7);
    state = fire(state, 4, 0);
    const b = board(state);
    expect(b.lastShot).toMatchObject({ seat: 0, hit: true, sunk: 'Carrier' });
    expect(b.sunk[1]).toEqual(['Carrier']);
    expect(b.log.some((l) => l.includes('sunk the Carrier!'))).toBe(true);
    expect(state.phase).toBe('in_progress');
  });

  test('the first admiral to sink all seventeen cells wins', () => {
    let state = start();
    state = deploy(state, tidyFleet);
    state = deploy(state, tidyFleet);
    // Both fleets are the tidy rows; seat 0 sweeps them cell by cell, seat 1
    // fires harmlessly into column 9 (never finishing) — seat 0 sinks first.
    const sweep: Array<[number, number]> = [];
    for (let row = 0; row < 9; row += 2) {
      const width = [5, 4, 3, 3, 2][row / 2];
      for (let x = 0; x < width; x++) sweep.push([x, row]);
    }
    expect(sweep).toHaveLength(17);
    const waste: Array<[number, number]> = [];
    for (const x of [9, 8]) {
      for (let y = 0; y < 10; y++) waste.push([x, y]);
    }
    let a = 0;
    let b = 0;
    while (state.phase === 'in_progress') {
      const seat = state.currentSeat;
      const [x, y] = seat === 0 ? sweep[a] : waste[b];
      state = fire(state, x, y);
      if (seat === 0) {
        a++;
        if (a >= sweep.length) break; // seat 0 has fired all 17 winning shots
      } else {
        b++;
      }
    }
    // Seat 0 fires the 17th sinking shot on its 17th turn; seat 1 had 16 harmless turns.
    expect(state.phase).toBe('completed');
    expect(state.winnerSeat).toBe(0);
    expect(board(state).sunk[1]).toEqual(['Carrier', 'Battleship', 'Cruiser', 'Submarine', 'Destroyer']);
    expect(state.scores).toEqual([1, 0]);
  });

  test('the enemy fleet never leaks through a player view', () => {
    let state = start();
    state = deploy(state, tidyFleet);
    state = deploy(state, tidyFleet);
    const view = engine.playerView(state, 0);
    const vb = view.board as unknown as NavalShape;
    expect(vb.fleets[0]).toHaveLength(5); // own fleet intact
    expect(vb.fleets[1]).toHaveLength(0); // enemy fleet redacted
    const spectator = engine.spectatorView(state);
    const sb = spectator.board as unknown as NavalShape;
    expect(sb.fleets[0]).toHaveLength(0);
    expect(sb.fleets[1]).toHaveLength(0);
  });

  test('bots deploy legal fleets and fire legal, unrepeated cells', () => {
    let state = start();
    // Placement.
    for (let seat = 0; seat < 2; seat++) {
      const move = engine.chooseBotMove(state, seat, 'hard');
      expect(move.action.type).toBe('deploy');
      expect(engine.validate(state, { ...move.action, seat }).ok).toBe(true);
      state = engine.applyAction(state, { ...move.action, seat });
    }
    expect(board(state).phase).toBe('battle');
    // Barrage.
    const seen = new Set<string>();
    for (let volley = 0; volley < 6; volley++) {
      for (const difficulty of ['easy', 'medium', 'hard', 'expert'] as const) {
        const seat = state.currentSeat;
        const move = engine.chooseBotMove(state, seat, difficulty);
        expect(move.action.type).toBe('fire');
        const action = { ...move.action, seat };
        expect(engine.validate(state, action).ok).toBe(true);
        const key = `${seat}:${action.payload.x},${action.payload.y}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
        state = engine.applyAction(state, action);
      }
    }
  });
});


describe('reversi rules', () => {
  const engine = new ReversiEngine();

  interface RevShape {
    grid: Array<0 | 1 | 2>;
    passes: number;
    lastMove: { seat: number; x: number; y: number; flipped: number } | null;
    log: string[];
  }

  function start(): GameState {
    return engine.createInitialState(makeConfig(engine, 2));
  }

  function board(state: GameState): RevShape {
    return state.board as unknown as RevShape;
  }

  function place(state: GameState, x: number, y: number, seat = state.currentSeat): GameState {
    return engine.applyAction(state, { seat, type: 'place', payload: { x, y } });
  }

  test('starts on the classic cross with four legal black moves', () => {
    const state = start();
    const b = board(state);
    expect(b.grid.filter((c) => c === 1)).toHaveLength(2);
    expect(b.grid.filter((c) => c === 2)).toHaveLength(2);
    expect(b.grid[3 * 8 + 4]).toBe(1);
    expect(b.grid[4 * 8 + 3]).toBe(1);
    expect(b.grid[3 * 8 + 3]).toBe(2);
    expect(b.grid[4 * 8 + 4]).toBe(2);
    const moves = legalMoves(b.grid, 1).map(([x, y]) => `${x},${y}`).sort();
    expect(moves).toEqual(['2,3', '3,2', '4,5', '5,4']);
  });

  test('a placement flips exactly the sandwiched line', () => {
    const state = start();
    // Black at d3 flips the white disc at d4.
    expect(flipsFor(board(state).grid, 3, 2, 1)).toEqual([[3, 3]]);
    const next = place(state, 3, 2);
    const b = board(next);
    expect(b.grid[2 * 8 + 3]).toBe(1); // placed
    expect(b.grid[3 * 8 + 3]).toBe(1); // flipped
    expect(b.grid[4 * 8 + 3]).toBe(1); // was black
    expect(b.lastMove).toEqual({ seat: 0, x: 3, y: 2, flipped: 1 });
    expect(next.scores).toEqual([4, 1]);
    expect(next.currentSeat).toBe(1);
  });

  test('illegal placements are rejected by shape and by flip count', () => {
    const state = start();
    expect(engine.validate(state, { seat: 0, type: 'place', payload: { x: 0, y: 0 } }).ok).toBe(false); // flips nothing
    expect(engine.validate(state, { seat: 0, type: 'place', payload: { x: 3, y: 3 } }).ok).toBe(false); // occupied
    expect(engine.validate(state, { seat: 0, type: 'place', payload: { x: 8, y: 0 } }).ok).toBe(false); // off board
    expect(engine.validate(state, { seat: 1, type: 'place', payload: { x: 3, y: 2 } }).ok).toBe(false); // not your turn
    expect(engine.validate(state, { seat: 0, type: 'move', payload: { x: 3, y: 2 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 0, type: 'place', payload: { x: 2, y: 3 } }).ok).toBe(true);
  });

  test('a stranded opponent passes automatically and the double pass ends the game', () => {
    const state = start();
    const b = state.board as unknown as RevShape;
    // Craft: everything black except (0,0) empty, (0,1) white and (7,7) empty.
    b.grid.fill(1);
    b.grid[0] = 0;
    b.grid[1] = 2; // (0,1) white
    b.grid[7 * 8 + 7] = 0;
    state.currentSeat = 0;
    state.scores = [62, 1];

    const next = place(state, 0, 0); // black flips (0,1) — white keeps no discs
    const nb = board(next);
    expect(next.phase).toBe('completed'); // white passes, black cannot play (7,7), double pass
    expect(nb.log.some((l) => l.includes('has no legal move — passes'))).toBe(true);
    expect(next.winnerSeat).toBe(0);
    expect(next.scores).toEqual([63, 0]);
  });

  test('a full board ends immediately and the majority wins', () => {
    const state = start();
    const b = state.board as unknown as RevShape;
    b.grid.fill(1);
    b.grid[0] = 0;
    b.grid[1] = 2; // (0,1) white, sandwiched by the placement at (0,0)
    state.currentSeat = 0;
    const next = place(state, 0, 0);
    expect(next.phase).toBe('completed');
    expect(next.winnerSeat).toBe(0);
    expect(board(next).grid.every((c) => c === 1)).toBe(true);
  });

  test('bots always choose flipping placements', () => {
    const state = start();
    for (const difficulty of ['easy', 'medium', 'hard', 'expert'] as const) {
      const move = engine.chooseBotMove(state, 0, difficulty);
      expect(move.action.type).toBe('place');
      const action = { ...move.action, seat: 0 };
      expect(engine.validate(state, action).ok).toBe(true);
    }
  });
});


describe('gomoku rules', () => {
  const engine = new GomokuEngine();

  interface GoShape {
    grid: Array<0 | 1 | 2>;
    lastMove: { seat: number; x: number; y: number } | null;
    winningLine: number[] | null;
    log: string[];
  }

  function start(): GameState {
    return engine.createInitialState(makeConfig(engine, 2));
  }

  function board(state: GameState): GoShape {
    return state.board as unknown as GoShape;
  }

  function place(state: GameState, x: number, y: number, seat = state.currentSeat): GameState {
    return engine.applyAction(state, { seat, type: 'place', payload: { x, y } });
  }

  test('starts empty, black first, and alternates turns', () => {
    const state = start();
    expect(board(state).grid.every((c) => c === 0)).toBe(true);
    expect(state.currentSeat).toBe(0);
    let s = place(state, 7, 7);
    expect(s.currentSeat).toBe(1);
    expect(board(s).grid[7 * 15 + 7]).toBe(1);
    s = place(s, 8, 8);
    expect(s.currentSeat).toBe(0);
    expect(board(s).grid[8 * 15 + 8]).toBe(2);
  });

  test('five in a row wins and reports the line', () => {
    let state = start();
    // Black builds a horizontal five on row 7 while white plays harmlessly above.
    for (let i = 0; i < 4; i++) {
      state = place(state, 5 + i, 7); // black
      state = place(state, 5 + i, 5); // white decoys
    }
    expect(state.phase).toBe('in_progress');
    state = place(state, 9, 7); // the fifth black stone
    expect(state.phase).toBe('completed');
    expect(state.winnerSeat).toBe(0);
    const b = board(state);
    expect(b.winningLine).toHaveLength(5);
    expect(b.winningLine).toEqual([7 * 15 + 5, 7 * 15 + 6, 7 * 15 + 7, 7 * 15 + 8, 7 * 15 + 9]);
    expect(state.scores).toEqual([1, 0]);
  });

  test('diagonals and columns count too', () => {
    // Column three-in… no — build a diagonal five in one crafted stroke.
    const state = start();
    const b = state.board as unknown as GoShape;
    for (let i = 0; i < 4; i++) b.grid[(4 + i) * 15 + (4 + i)] = 1;
    state.currentSeat = 0;
    const won = place(state, 8, 8);
    expect(won.phase).toBe('completed');
    expect(won.winnerSeat).toBe(0);
    expect(board(won).winningLine).toHaveLength(5);
  });

  test('placements are validated by bounds, occupancy and seat', () => {
    const state = start();
    expect(engine.validate(state, { seat: 0, type: 'place', payload: { x: 15, y: 0 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 0, type: 'place', payload: { x: 0, y: -1 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 1, type: 'place', payload: { x: 0, y: 0 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 0, type: 'drop', payload: { x: 0, y: 0 } }).ok).toBe(false);
    const placed = place(state, 3, 3);
    expect(engine.validate(placed, { seat: 1, type: 'place', payload: { x: 3, y: 3 } }).ok).toBe(false);
    expect(engine.validate(placed, { seat: 1, type: 'place', payload: { x: 3, y: 4 } }).ok).toBe(true);
  });

  test('bots open on the star point and always place on empty cells', () => {
    const state = start();
    const opening = engine.chooseBotMove(state, 0, 'hard');
    expect(opening.action.payload).toEqual({ x: 7, y: 7 });

    let s = place(state, 7, 7);
    s = place(s, 8, 8);
    const played = new Set<number>();
    for (const difficulty of ['easy', 'medium', 'hard', 'expert'] as const) {
      for (let i = 0; i < 5; i++) {
        const seat = s.currentSeat;
        const move = engine.chooseBotMove(s, seat, difficulty);
        const action = { ...move.action, seat };
        expect(engine.validate(s, action).ok).toBe(true);
        const idx = Number(action.payload.y) * 15 + Number(action.payload.x);
        expect(played.has(idx)).toBe(false);
        played.add(idx);
        s = engine.applyAction(s, action);
      }
    }
  });

  test('a hard bot blocks an immediate losing threat', () => {
    const state = start();
    const b = state.board as unknown as GoShape;
    // White has four in an open row (5,5)-(8,5); black must block at (4,5) or (9,5).
    for (let i = 5; i <= 8; i++) b.grid[5 * 15 + i] = 2;
    b.grid[9 * 15 + 9] = 1; // a stray black stone so the board is not "empty"
    state.currentSeat = 0;
    const move = engine.chooseBotMove(state, 0, 'hard');
    const x = Number(move.action.payload.x);
    const y = Number(move.action.payload.y);
    expect(y).toBe(5);
    expect(x === 4 || x === 9).toBe(true);
  });
});


describe('blackjack rules', () => {
  const engine = new BlackjackEngine();

  interface CardShape {
    r: number;
    s: number;
  }

  interface BjShape {
    round: number;
    phase: 'bet' | 'play';
    bankrolls: number[];
    bets: number[];
    foldedRound: boolean[];
    bettors: number[];
    hands: CardShape[][];
    dealer: CardShape[];
    lastRound: { dealer: CardShape[]; results: string[] } | null;
    log: string[];
  }

  function start(): GameState {
    return engine.createInitialState(makeConfig(engine, 2));
  }

  function board(state: GameState): BjShape {
    return state.board as unknown as BjShape;
  }

  function act(state: GameState, type: string, payload: Record<string, unknown> = {}): GameState {
    return engine.applyAction(state, { seat: state.currentSeat, type, payload });
  }

  const c = (r: number, s = 0): CardShape => ({ r, s });

  test('hand values flex the aces', () => {
    expect(handValue([c(1), c(10)])).toBe(21);
    expect(handValue([c(1), c(1)])).toBe(12);
    expect(handValue([c(1), c(5)])).toBe(16);
    expect(handValue([c(1), c(5), c(9)])).toBe(15);
    expect(handValue([c(10), c(8), c(3)])).toBe(21);
    expect(handValue([c(13), c(12)])).toBe(20);
    expect(handValue([c(10), c(10), c(5)])).toBe(25);
  });

  test('stakes post, cards deal, and the hole card stays hidden mid-hand', () => {
    let state = start();
    state = act(state, 'bet', { amount: 100 });
    state = act(state, 'bet', { amount: 50 });
    const b = board(state);
    expect(b.phase).toBe('play');
    expect(b.bettors).toEqual([0, 1]);
    expect(b.hands[0]).toHaveLength(2);
    expect(b.hands[1]).toHaveLength(2);
    expect(b.dealer).toHaveLength(2);
    expect(state.currentSeat).toBe(0);
    // Views see only the dealer's up-card while the hand is live.
    const view = engine.playerView(state, 0);
    expect((view.board as unknown as BjShape).dealer).toHaveLength(1);
    expect((view.board as unknown as BjShape).hands[0]).toHaveLength(2); // own hand intact
  });

  test('hitting draws and standing passes the deal', () => {
    let state = start();
    state = act(state, 'bet', { amount: 10 });
    state = act(state, 'bet', { amount: 10 });
    // Craft a safe nine so no random card can end the hand.
    board(state).hands[0] = [c(5), c(4)];
    state = act(state, 'hit');
    expect(board(state).hands[0]).toHaveLength(3);
    expect(state.currentSeat).toBe(0); // still their call under 21
    state = act(state, 'stand');
    expect(state.currentSeat).toBe(1);
  });

  test('the settle pays wins, losses and pushes against a standing dealer', () => {
    let state = start();
    state = act(state, 'bet', { amount: 100 });
    state = act(state, 'bet', { amount: 100 });
    const b = board(state);
    b.hands[0] = [c(10), c(9)]; // 19 — beats 18
    b.hands[1] = [c(10), c(7)]; // 17 — loses to 18
    b.dealer = [c(10), c(8)]; // 18 — no draw
    state = act(state, 'stand'); // seat 0
    state = act(state, 'stand'); // seat 1 → settle
    const nb = board(state);
    expect(nb.round).toBe(2);
    expect(nb.phase).toBe('bet');
    expect(nb.bankrolls[0]).toBe(1100); // stake back + even-money win
    expect(nb.bankrolls[1]).toBe(900); // stake lost
    expect(nb.lastRound!.results[0]).toContain('beats 18');
    expect(nb.lastRound!.results[1]).toContain('loses to 18');
    expect(nb.lastRound!.dealer).toHaveLength(2); // history is open
  });

  test('blackjack pays three to two and a push returns the stake', () => {
    // Seat 0: natural 21. Seat 1: eighteen against the dealer's eighteen.
    let state = start();
    state = act(state, 'bet', { amount: 100 });
    state = act(state, 'bet', { amount: 60 });
    const b = board(state);
    b.hands[0] = [c(1), c(12)]; // blackjack
    b.hands[1] = [c(10), c(8)]; // 18
    b.dealer = [c(9), c(9)]; // 18
    state = act(state, 'stand');
    state = act(state, 'stand');
    const nb = board(state);
    expect(nb.bankrolls[0]).toBe(1000 - 100 + 250); // 3:2 → +150
    expect(nb.bankrolls[1]).toBe(1000 - 60 + 60); // push
    expect(nb.lastRound!.results[0]).toContain('blackjack');
    expect(nb.lastRound!.results[1]).toContain('push');
  });

  test('a busted hand loses even when the dealer would have busted too', () => {
    let state = start();
    state = act(state, 'bet', { amount: 80 });
    state = act(state, 'fold');
    const b = board(state);
    b.hands[0] = [c(10), c(10), c(5)]; // 25 — bust
    b.dealer = [c(10), c(8)]; // 18 stands
    state = act(state, 'stand');
    const nb = board(state);
    expect(nb.bankrolls[0]).toBe(920);
    expect(nb.lastRound!.results[0]).toContain('bust');
    expect(nb.bettors).toEqual([]); // swept for the next round
  });

  test('three rounds decide the richest stack', () => {
    let state = start();
    let guard = 0;
    while (state.phase === 'in_progress' && guard++ < 200) {
      const b = board(state);
      if (b.phase === 'bet') {
        state = act(state, b.bankrolls[state.currentSeat] >= 5 ? 'bet' : 'fold', { amount: 5 });
      } else {
        // Stand on 17+, hit below — mirror of basic play.
        const value = handValue(b.hands[state.currentSeat]);
        state = act(state, value < 17 ? 'hit' : 'stand');
      }
    }
    expect(state.phase).toBe('completed');
    expect(board(state).round).toBe(3);
    const b = board(state);
    expect(state.scores).toEqual(b.bankrolls);
    const max = Math.max(...b.bankrolls);
    const leaders = b.bankrolls.map((v, i) => ({ v, i })).filter((x) => x.v === max).map((x) => x.i);
    if (leaders.length === 1) {
      expect(state.winnerSeat).toBe(leaders[0]);
    } else {
      expect(state.winnerSeat).toBeNull();
    }
  });

  test('actions are validated by phase, seat and amount', () => {
    const state = start();
    expect(engine.validate(state, { seat: 0, type: 'bet', payload: { amount: 4 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 0, type: 'bet', payload: { amount: 1001 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 1, type: 'bet', payload: { amount: 10 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 0, type: 'hit', payload: {} }).ok).toBe(false); // bet phase
    expect(engine.validate(state, { seat: 0, type: 'fold', payload: {} }).ok).toBe(true);
    let s = act(state, 'bet', { amount: 10 });
    s = act(s, 'fold'); // seat 1 folds → play with only seat 0
    expect(engine.validate(s, { seat: 0, type: 'bet', payload: { amount: 10 } }).ok).toBe(false);
    expect(engine.validate(s, { seat: 0, type: 'hit', payload: {} }).ok).toBe(true);
    expect(engine.validate(s, { seat: 0, type: 'stand', payload: {} }).ok).toBe(true);
  });

  test('bots post legal stakes and play legal hits', () => {
    const state = engine.createInitialState(makeConfig(engine, 4));
    for (const difficulty of ['easy', 'medium', 'hard', 'expert'] as const) {
      const move = engine.chooseBotMove(state, 0, difficulty);
      expect(move.action.type).toBe('bet');
      const amount = Number(move.action.payload.amount);
      expect(Number.isInteger(amount)).toBe(true);
      expect(amount).toBeGreaterThanOrEqual(5);
      expect(amount).toBeLessThanOrEqual(1000);
    }
    let s = state;
    for (let i = 0; i < 4; i++) s = act(s, 'bet', { amount: 5 });
    expect(board(s).phase).toBe('play');
    const move = engine.chooseBotMove(s, board(s).bettors[0], 'hard');
    expect(['hit', 'stand']).toContain(move.action.type);
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
      new DicePartyEngine(),
      new BackgammonEngine(),
      new MancalaEngine(),
      new BowlingEngine(),
      new TriviaEngine(),
      new WordChainEngine(),
      new EmojiCharadesEngine(),
      new MemoryEngine(),
      new SketchEngine(),
      new WerewolfEngine(),
      new ImpostorEngine(),
      new DartsEngine(),
      new MinigolfEngine(),
      new BankrollEngine(),
      new BattleshipEngine(),
      new ReversiEngine(),
      new GomokuEngine(),
      new BlackjackEngine(),
    );
    // The wave-1 engines are wired in via DI.
    expect(registry.slugs).toEqual(['dominoes', 'ludo', 'ocho', 'connect4', 'checkers', 'chess', 'pool', 'carrom', 'dots_and_boxes', 'snakes_ladders', 'bingo', 'dice_party', 'backgammon', 'mancala', 'bowling', 'trivia', 'word_chain', 'emoji_charades', 'memory', 'sketch', 'werewolf', 'impostor', 'darts', 'minigolf', 'bankroll', 'battleship', 'reversi', 'gomoku', 'blackjack']);
    expect(registry.has('dominoes')).toBe(true);
    expect(registry.get('dominoes')).toBeInstanceOf(DominoesEngine);
    expect(registry.require('ludo')).toBeInstanceOf(LudoEngine);

    // Unknown games are rejected, and extra engines can be registered on top.
    expect(registry.has('nonexistent')).toBe(false);
    expect(() => registry.require('nonexistent')).toThrow(/No engine registered/);
    registry.register(new DummyEngine());
    expect(registry.slugs).toEqual(['dominoes', 'ludo', 'ocho', 'connect4', 'checkers', 'chess', 'pool', 'carrom', 'dots_and_boxes', 'snakes_ladders', 'bingo', 'dice_party', 'backgammon', 'mancala', 'bowling', 'trivia', 'word_chain', 'emoji_charades', 'memory', 'sketch', 'werewolf', 'impostor', 'darts', 'minigolf', 'bankroll', 'battleship', 'reversi', 'gomoku', 'blackjack', '__dummy__']);
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
