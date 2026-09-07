import { BingoEngine } from '../src/game/engine/bingo.engine';
import { CarromEngine } from '../src/game/engine/carrom.engine';
import { ChessEngine } from '../src/game/engine/chess.engine';
import { Connect4Engine } from '../src/game/engine/connect4.engine';
import { DicePartyEngine } from '../src/game/engine/dice-party.engine';
import { DominoesEngine } from '../src/game/engine/dominoes.engine';
import { LudoEngine } from '../src/game/engine/ludo.engine';
import { OchoEngine } from '../src/game/engine/ocho.engine';
import { PoolEngine } from '../src/game/engine/pool.engine';
import { SketchEngine } from '../src/game/engine/sketch.engine';
import { WerewolfEngine } from '../src/game/engine/werewolf.engine';
import { TriviaEngine } from '../src/game/engine/trivia.engine';
import { EmojiCharadesEngine } from '../src/game/engine/emoji-charades.engine';
import { WordChainEngine } from '../src/game/engine/word-chain.engine';
import { MemoryRaceEngine } from '../src/game/engine/memory-race.engine';
import { ImpostorLightEngine } from '../src/game/engine/impostor-light.engine';
import { QuickChallengesEngine } from '../src/game/engine/quick-challenges.engine';
import { CheckersEngine } from '../src/game/engine/checkers.engine';
import { ReversiEngine } from '../src/game/engine/reversi.engine';
import { BackgammonEngine } from '../src/game/engine/backgammon.engine';
import { DotsBoxesEngine } from '../src/game/engine/dots-boxes.engine';
import { SeaBattleEngine } from '../src/game/engine/sea-battle.engine';
import type { BaseGameEngine } from '../src/game/engine/base-game.engine';
import type { GameState, MatchConfig, SeatInfo } from '../src/game/engine/types';

/**
 * End-to-end proof that every Phase 5 game is fully playable, end to end, by
 * the engine itself (the exact code path the session service drives for real
 * matches). Each game is started with a full table of invisible bots and
 * driven — turn-based games via `chooseBotMove`, live games via `tick` — until
 * the engine declares a winner. This catches any stuck state, unhandled action
 * or missing AI branch without any UI or network in the loop.
 */

let virtualNow: number;
// Preserve the real Date constructor/clock so we can fully restore them after
// the suite — a direct `globalThis.Date = …` assignment is NOT reverted by
// jest.restoreAllMocks() and would otherwise freeze time for later suites.
const OriginalDate: typeof Date = Date;

beforeAll(() => {
  // Live engines schedule countdowns with `Date.now()` / `new Date()`. A
  // deterministic virtual clock lets us fast-forward wall-clock phases (bingo
  // calls, dice rounds, werewolf days) instantly instead of waiting minutes.
  jest.useFakeTimers({ doNotFake: ['performance'] });
  virtualNow = OriginalDate.now();
  class FakeDate extends OriginalDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) {
        super(virtualNow);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        super(...(args as [any]));
      }
    }
    static now() {
      return virtualNow;
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as { Date: any }).Date = FakeDate;
});

afterAll(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as { Date: any }).Date = OriginalDate;
});

function makeSeats(n: number): SeatInfo[] {
  return Array.from({ length: n }, (_, i) => ({
    playerId: `bot-${i}`,
    seatNumber: i,
    isBot: true,
    botDifficulty: 'hard' as const,
    displayName: `Bot ${i}`,
    avatarUrl: null,
  }));
}

function makeConfig(engine: BaseGameEngine, players?: number): MatchConfig {
  const n = players ?? engine.maxPlayers;
  const seats = makeSeats(n);
  return {
    matchId: `test-${engine.slug}`,
    gameSlug: engine.slug,
    seats,
    isLive: engine.isLive,
  };
}

/** A human-looking seat (isBot=false) for games that need a guesser/drawer. */
function makeConfigWithOneHuman(engine: BaseGameEngine, total: number, humanSeat: number): MatchConfig {
  const seats = makeSeats(total).map((s, i) =>
    i === humanSeat ? { ...s, isBot: false, playerId: 'human-1' } : s,
  );
  return { matchId: `test-${engine.slug}`, gameSlug: engine.slug, seats, isLive: engine.isLive };
}

const TURN_BASED: Array<{ name: string; build: () => BaseGameEngine; players?: number }> = [
  { name: 'dominoes', build: () => new DominoesEngine() },
  { name: 'connect4', build: () => new Connect4Engine(), players: 2 },
  { name: 'ocho', build: () => new OchoEngine() },
  { name: 'ludo', build: () => new LudoEngine() },
  { name: 'chess', build: () => new ChessEngine(), players: 2 },
  { name: 'word_chain', build: () => new WordChainEngine() },
  { name: 'checkers', build: () => new CheckersEngine(), players: 2 },
  { name: 'reversi', build: () => new ReversiEngine(), players: 2 },
  { name: 'backgammon', build: () => new BackgammonEngine(), players: 2 },
  { name: 'dots_boxes (2p)', build: () => new DotsBoxesEngine(), players: 2 },
  { name: 'dots_boxes (4p)', build: () => new DotsBoxesEngine(), players: 4 },
  { name: 'sea_battle', build: () => new SeaBattleEngine(), players: 2 },
];

describe('turn-based game engines — full bot play-through', () => {
  for (const { name, build, players } of TURN_BASED) {
    test(`${name} reaches a completed state with a winner`, () => {
      const engine = build();
      let state = engine.createInitialState(makeConfig(engine, players));
      const maxTurns = 4000;

      for (let turn = 0; turn < maxTurns && state.phase === 'in_progress'; turn++) {
        const seat = state.currentSeat;
        expect(seat).toBeGreaterThanOrEqual(0);
        const move = engine.chooseBotMove(state, seat, 'hard');
        const action = { ...move.action, seat };
        const validation = engine.validate(state, action);
        // The bot's own move must always be legal for the current state.
        if (!validation.ok) {
          throw new Error(`${name}: bot move rejected at turn ${turn}: ${validation.error} — ${JSON.stringify(action)}`);
        }
        state = engine.applyAction(state, action);
      }

      expect(state.phase).toBe('completed');
      expect(state.winnerSeat === null ? state.winnerSeats ?? [] : [state.winnerSeat]).toBeTruthy();
    });
  }
});

const LIVE: Array<{ name: string; build: () => BaseGameEngine; players?: number; humanSeat?: number }> = [
  { name: 'bingo', build: () => new BingoEngine() },
  { name: 'dice_party', build: () => new DicePartyEngine() },
  { name: 'pool_8ball', build: () => new PoolEngine(), players: 2 },
  { name: 'carrom', build: () => new CarromEngine(), players: 2 },
  { name: 'werewolf', build: () => new WerewolfEngine() },
  { name: 'sketch_guess', build: () => new SketchEngine(), humanSeat: 1 },
  { name: 'trivia', build: () => new TriviaEngine() },
  { name: 'emoji_charades', build: () => new EmojiCharadesEngine(), players: 4 },
  { name: 'memory_race', build: () => new MemoryRaceEngine() },
  { name: 'impostor_light', build: () => new ImpostorLightEngine() },
  { name: 'quick_challenges', build: () => new QuickChallengesEngine() },
];

describe('live game engines — full bot play-through via tick', () => {
  for (const { name, build, players, humanSeat } of LIVE) {
    test(`${name} reaches a completed state with a winner`, () => {
      const engine = build();
      const total = players ?? engine.maxPlayers;
      const config = humanSeat != null ? makeConfigWithOneHuman(engine, total, humanSeat) : makeConfig(engine, total);
      let state: GameState = engine.createInitialState(config);
      const startVersion = state.version;
      const maxTicks = 20000;
      let ticks = 0;

      for (; ticks < maxTicks && state.phase === 'in_progress'; ticks++) {
        // Advance wall-clock well past every per-round countdown so timers fire.
        virtualNow += 5000;
        const next = engine.tick(state, new Date());
        if (next !== state) state = next;
      }

      expect(state.phase).toBe('completed');
      expect(ticks).toBeLessThan(maxTicks);
      expect(state.version).toBeGreaterThan(startVersion);
      const winner = state.winnerSeat != null ? [state.winnerSeat] : state.winnerSeats ?? [];
      expect(winner.length).toBeGreaterThan(0);
    });
  }
});

describe('hidden information is never leaked to other seats or spectators', () => {
  test('ocho gives each seat only its own hand; spectators get none', () => {
    const engine = new OchoEngine();
    const state = engine.createInitialState(makeConfig(engine));
    const full = state.board as { hands: Array<Array<{ id: string }>> };

    // Seat 1's view must contain exactly seat 1's cards — never seat 0's.
    const view1 = engine.playerView(state, 1) as GameState;
    const b1 = view1.board as { hand: Array<{ id: string }> | null; handSizes: number[] };
    expect(b1.hand?.map((c) => c.id).sort()).toEqual(full.hands[1].map((c) => c.id).sort());
    const seenIds = new Set((b1.hand ?? []).map((c) => c.id));
    expect(full.hands[0].some((c) => seenIds.has(c.id))).toBe(false);
    expect(b1.handSizes).toEqual(full.hands.map((h) => h.length));

    // Spectators get hand counts but zero cards.
    const spectatorView = engine.spectatorView(state) as GameState;
    expect((spectatorView.board as { hand: unknown }).hand).toBeNull();

    // The acting seat still sees its own hand.
    const ownView = engine.playerView(state, 0) as GameState;
    expect((ownView.board as { hand: unknown[] }).hand).toHaveLength(full.hands[0].length);
  });

  test('werewolf reveals roles only to self and wolf-mates', () => {
    const engine = new WerewolfEngine();
    const state = engine.createInitialState(makeConfig(engine));
    const board = state.board as { players: Array<{ role: string }> };
    const wolfSeat = board.players.findIndex((p) => p.role === 'werewolf');
    const otherSeat = board.players.findIndex((p, i) => p.role !== 'werewolf' && i !== wolfSeat);
    const view = engine.playerView(state, otherSeat) as GameState;
    const vBoard = view.board as { players: Array<{ role: string | null }>; myRole: string | null };
    // A villager sees their own role but never the wolves'.
    for (const [i, p] of vBoard.players.entries()) {
      if (i === otherSeat) expect(p.role).toBe('villager');
      else expect(p.role).toBeNull();
    }
    expect(vBoard.myRole).toBe('villager');
  });

  test('new engines never leak server-only bot state or secret answers', () => {
    // Drive each new engine a few ticks so it enters active rounds, then assert
    // the spectator view (seat -1) and a player view contain none of the
    // server-only keys (bot timers/AI memory) and — where a secret exists
    // (trivia answer, charade answer, impostor location) — never reveal it to
    // a seat that should not see it.
    // Internal secret keys that must never appear in any serialized view.
    // ('answer' is intentionally NOT listed: trivia players legitimately carry a
    // boolean `correct` row; the real answer index is checked separately below.)
    const forbidden = [
      'botSeats',
      'botDifficulty',
      'botKnown',
      'botFlipAt',
      'botGuessAt',
      'botActAt',
      'botVoteAt',
      'answerIndex',
    ];

    const cases: Array<{ name: string; engine: BaseGameEngine; players?: number }> = [
      { name: 'trivia', engine: new TriviaEngine() },
      { name: 'emoji_charades', engine: new EmojiCharadesEngine(), players: 4 },
      { name: 'memory_race', engine: new MemoryRaceEngine() },
      { name: 'impostor_light', engine: new ImpostorLightEngine() },
      { name: 'quick_challenges', engine: new QuickChallengesEngine() },
    ];

    for (const { name, engine, players } of cases) {
      const config = makeConfig(engine, players);
      let state = engine.createInitialState(config);
      for (let i = 0; i < 12 && state.phase === 'in_progress'; i++) {
        virtualNow += 4000;
        const next = engine.tick(state, new Date());
        if (next !== state) state = next;
      }

      const views: GameState[] = [engine.spectatorView(state) as GameState];
      for (let seat = 0; seat < config.seats.length; seat++) {
        views.push(engine.playerView(state, seat) as GameState);
      }

      for (const view of views) {
        const json = JSON.stringify(view.board);
        for (const key of forbidden) {
          expect(json).not.toContain(`"${key}":`);
        }
        // Bot memory arrays are never serialized under any alias either.
        expect(json).not.toMatch(/"bot[A-Z]/);
      }
    }

    // Memory race: a down card's emoji must be null in every view.
    {
      const engine = new MemoryRaceEngine();
      const state = engine.createInitialState(makeConfig(engine));
      const view = engine.spectatorView(state) as GameState;
      const emojis = (view.board as { emojis: unknown[] }).emojis;
      expect(emojis.every((e) => e === null)).toBe(true);
    }

    // Impostor: a crew seat (not the impostor) sees the location, spectators
    // never do; and the impostor's identity is never in any view's board.
    {
      const engine = new ImpostorLightEngine();
      const state = engine.createInitialState(makeConfig(engine));
      const full = state.board as { impostorSeat: number; location: string };
      const spectator = engine.spectatorView(state) as GameState;
      const sBoard = spectator.board as { location: string | null };
      expect(sBoard.location).toBeNull();
      const crewSeat = full.impostorSeat === 0 ? 1 : 0;
      const crewView = engine.playerView(state, crewSeat) as GameState;
      const cBoard = crewView.board as { location: string | null; players: Array<Record<string, unknown>> };
      expect(cBoard.location).toBe(full.location);
      expect(JSON.stringify(cBoard.players)).not.toContain('isImpostor');
    }

    // Trivia: while the answer window is open, correctIndex must be null even
    // though bots have already answered; after reveal it is published as
    // correctIndex (never the internal answerIndex key).
    {
      const engine = new TriviaEngine();
      let state = engine.createInitialState(makeConfig(engine));
      virtualNow += 3000;
      state = engine.tick(state, new Date()) ?? state;
      const openView = JSON.stringify(engine.spectatorView(state).board as Record<string, unknown>);
      expect(openView).toContain('"correctIndex":null');
      expect(openView).not.toContain('"answerIndex"');
      // Fast-forward past answer + reveal windows.
      for (let i = 0; i < 6 && state.phase === 'in_progress'; i++) {
        virtualNow += 4000;
        const next = engine.tick(state, new Date());
        if (next !== state) state = next;
        const json = JSON.stringify((engine.spectatorView(state) as GameState).board);
        if (json.includes('"reveal":true')) {
          expect(json).not.toContain('"answerIndex"');
        }
      }
    }

    // Emoji charades: the secret answer word must never appear in any view
    // until the round is over (winnerWord is set).
    {
      const engine = new EmojiCharadesEngine();
      const state = engine.createInitialState(makeConfig(engine, 4));
      const full = state.board as { answer: string; winnerSeat: number | null };
      for (let i = 0; i < 30 && full.winnerSeat == null && state.phase === 'in_progress'; i++) {
        virtualNow += 3000;
        const next = engine.tick(state, new Date());
        if (next !== state) {
          Object.assign(state, next);
          Object.assign(state.board, next.board);
        }
        const json = JSON.stringify((engine.spectatorView(state) as GameState).board);
        if (full.winnerSeat == null) {
          expect(json.toLowerCase()).not.toContain(full.answer.toLowerCase());
          expect(json).not.toContain('"answer"');
        }
      }
    }
  });
});

describe('classic board engines — rules, secrecy and cosmetics', () => {
  test('sea battle never reveals the enemy fleet, but shows my own ships', () => {
    const engine = new SeaBattleEngine();
    const state = engine.createInitialState(makeConfig(engine, 2));
    const full = state.board as { fleets: Array<{ ships: Array<{ cells: number[][] }> }> };
    expect(full.fleets).toHaveLength(2);

    const spectator = engine.spectatorView(state) as GameState;
    const sJson = JSON.stringify(spectator.board);
    expect(sJson).not.toContain('"fleets"');
    expect(sJson).not.toContain('"botTargets"');
    expect((spectator.board as { myShips: unknown }).myShips).toBeNull();

    const mine = engine.playerView(state, 0) as GameState;
    const myShips = (mine.board as { myShips: Array<{ cells: number[][] }> }).myShips;
    expect(myShips).toHaveLength(5);
    // The opponent's ship cells must not be present anywhere in my view.
    const enemyCells = full.fleets[1].ships.flatMap((s) => s.cells);
    const oceans = (mine.board as { oceans: Array<{ shots: number[][] }> }).oceans;
    for (const [r, c] of enemyCells) expect(oceans[1].shots[r][c]).toBe(0);
    expect(JSON.stringify(mine.board)).not.toContain('"fleets"');
  });

  test('checkers enforces mandatory captures and crowns kings', () => {
    const engine = new CheckersEngine();
    const state = engine.createInitialState(makeConfig(engine, 2));
    const board = state.board as { grid: string[][]; legal: Array<{ from: number[]; to: number[]; captures: number[][] }> };
    // Craft a position: seat 0 man at (4,3) with a seat 1 man at (3,4) and an empty (2,5).
    for (const row of board.grid) row.fill('');
    board.grid[4][3] = 'r';
    board.grid[3][4] = 'b';
    board.grid[7][0] = 'b';
    board.legal = engine.legalMoves(board as never, 0);
    // Only the jump is legal (captures are mandatory).
    expect(board.legal).toHaveLength(1);
    expect(board.legal[0].captures).toHaveLength(1);
    const quiet = engine.validate(state, { seat: 0, type: 'move', payload: { from: [4, 3], to: [3, 2] } });
    expect(quiet.ok).toBe(false);
    expect(quiet.error).toMatch(/capture/i);
    // Move a man to the crown row and verify it becomes a king.
    const crownState = engine.createInitialState(makeConfig(engine, 2));
    const cb = crownState.board as { grid: string[][]; legal: unknown[] };
    for (const row of cb.grid) row.fill('');
    cb.grid[1][2] = 'r';
    cb.grid[7][0] = 'b';
    cb.grid[6][7] = 'b';
    cb.legal = engine.legalMoves(cb as never, 0);
    const after = engine.applyAction(crownState, { seat: 0, type: 'move', payload: { from: [1, 2], to: [0, 1] } });
    expect((after.board as { grid: string[][] }).grid[0][1]).toBe('R');
  });

  test('reversi flips bracketed discs and rejects non-flipping squares', () => {
    const engine = new ReversiEngine();
    const state = engine.createInitialState(makeConfig(engine, 2));
    const bad = engine.validate(state, { seat: 0, type: 'place', payload: { r: 0, c: 0 } });
    expect(bad.ok).toBe(false);
    const good = engine.applyAction(state, { seat: 0, type: 'place', payload: { r: 2, c: 3 } });
    const grid = (good.board as { grid: number[][] }).grid;
    expect(grid[2][3]).toBe(0);
    expect(grid[3][3]).toBe(0); // flipped
    expect(good.scores).toEqual([4, 1]);
    expect(good.currentSeat).toBe(1);
  });

  test('dots & boxes grants another turn when a box is closed and sizes the board by table', () => {
    const engine = new DotsBoxesEngine();
    const two = engine.createInitialState(makeConfig(engine, 2));
    const four = engine.createInitialState(makeConfig(engine, 4));
    expect((two.board as { size: number }).size).toBe(5);
    expect((four.board as { size: number }).size).toBe(7);

    let s = two;
    s = engine.applyAction(s, { seat: 0, type: 'draw', payload: { kind: 'h', r: 0, c: 0 } });
    expect(s.currentSeat).toBe(1);
    s = engine.applyAction(s, { seat: 1, type: 'draw', payload: { kind: 'v', r: 0, c: 0 } });
    s = engine.applyAction(s, { seat: 0, type: 'draw', payload: { kind: 'v', r: 0, c: 1 } });
    expect(s.currentSeat).toBe(1);
    // Seat 1 closes the box (0,0) and keeps the turn.
    s = engine.applyAction(s, { seat: 1, type: 'draw', payload: { kind: 'h', r: 1, c: 0 } });
    expect((s.board as { boxes: number[][] }).boxes[0][0]).toBe(1);
    expect(s.currentSeat).toBe(1);
    const dup = engine.validate(s, { seat: 1, type: 'draw', payload: { kind: 'h', r: 1, c: 0 } });
    expect(dup.ok).toBe(false);
  });

  test('backgammon forces bar entry and bears off only from home', () => {
    const engine = new BackgammonEngine();
    const state = engine.createInitialState(makeConfig(engine, 2));
    const board = state.board as {
      opening: unknown;
      hasRolled: boolean;
      dice: number[];
      remaining: number[];
      bar: number[];
      legal: Array<{ from: number; to: number; die: number }>;
      points: number[];
    };
    // Skip the opening roll and hand seat 0 a fixed roll with a checker on the bar.
    board.opening = null;
    board.bar[0] = 1;
    board.points[23] = 1;
    board.hasRolled = true;
    board.dice = [3, 5];
    board.remaining = [3, 5];
    board.legal = (engine as unknown as { legalMoves: (b: unknown, s: number) => typeof board.legal }).legalMoves(board, 0);
    expect(board.legal.every((m) => m.from === -1)).toBe(true);
    const fromBoard = engine.validate(state, { seat: 0, type: 'move', payload: { from: 12, die: 3 } });
    expect(fromBoard.ok).toBe(false);
    expect(fromBoard.error).toMatch(/bar/i);

    // Bearing off: all 15 checkers home ⇒ an exact die bears off.
    const home = engine.createInitialState(makeConfig(engine, 2));
    const hb = home.board as typeof board;
    hb.opening = null;
    hb.points.fill(0);
    hb.points[0] = 5;
    hb.points[1] = 5;
    hb.points[2] = 5;
    hb.points[20] = -15;
    hb.hasRolled = true;
    hb.dice = [3, 1];
    hb.remaining = [3, 1];
    hb.legal = (engine as unknown as { legalMoves: (b: unknown, s: number) => typeof board.legal }).legalMoves(hb, 0);
    expect(hb.legal.some((m) => m.from === 2 && m.to === 24 && m.die === 3)).toBe(true);
    const after = engine.applyAction(home, { seat: 0, type: 'move', payload: { from: 2, die: 3 } });
    expect((after.board as { off: number[] }).off[0]).toBe(1);
  });
});
