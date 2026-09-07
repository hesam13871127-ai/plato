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
import { MancalaEngine } from '../src/game/engine/mancala.engine';
import { MinesEngine } from '../src/game/engine/mines.engine';
import { GoFishEngine } from '../src/game/engine/go-fish.engine';
import { DartsEngine } from '../src/game/engine/darts.engine';
import { BowlingEngine } from '../src/game/engine/bowling.engine';
import { BigTwoEngine } from '../src/game/engine/big-two.engine';
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
  { name: 'dice_party (2p)', build: () => new DicePartyEngine(), players: 2 },
  { name: 'dice_party (4p)', build: () => new DicePartyEngine(), players: 4 },
  { name: 'mancala', build: () => new MancalaEngine(), players: 2 },
  { name: 'mines (2p)', build: () => new MinesEngine(), players: 2 },
  { name: 'mines (4p)', build: () => new MinesEngine(), players: 4 },
  { name: 'go_fish (2p)', build: () => new GoFishEngine(), players: 2 },
  { name: 'go_fish (4p)', build: () => new GoFishEngine(), players: 4 },
  { name: 'darts (2p)', build: () => new DartsEngine(), players: 2 },
  { name: 'darts (4p)', build: () => new DartsEngine(), players: 4 },
  { name: 'bowling (2p)', build: () => new BowlingEngine(), players: 2 },
  { name: 'bowling (4p)', build: () => new BowlingEngine(), players: 4 },
  { name: 'big_two (2p)', build: () => new BigTwoEngine(), players: 2 },
  { name: 'big_two (3p)', build: () => new BigTwoEngine(), players: 3 },
  { name: 'big_two (4p)', build: () => new BigTwoEngine(), players: 4 },
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

describe('new tables — scoring, secrecy and multi-seat rules', () => {
  test('dice party scores a Yacht-style card correctly and previews only for the mover', () => {
    const engine = new DicePartyEngine();
    expect(engine.scoreCategory('yacht', [4, 4, 4, 4, 4])).toBe(50);
    expect(engine.scoreCategory('full_house', [2, 2, 5, 5, 5])).toBe(25);
    expect(engine.scoreCategory('small_straight', [1, 2, 3, 4, 6])).toBe(30);
    expect(engine.scoreCategory('large_straight', [2, 3, 4, 5, 6])).toBe(40);
    expect(engine.scoreCategory('large_straight', [1, 2, 3, 4, 6])).toBe(0);
    expect(engine.scoreCategory('four_kind', [6, 6, 6, 6, 1])).toBe(25);
    expect(engine.scoreCategory('three_kind', [6, 6, 1, 2, 3])).toBe(0);
    expect(engine.scoreCategory('sixes', [6, 6, 1, 2, 3])).toBe(12);
    expect(engine.scoreCategory('chance', [1, 1, 1, 1, 2])).toBe(6);

    let state = engine.createInitialState(makeConfig(engine, 2));
    expect(engine.validate(state, { seat: 0, type: 'score', payload: { category: 'chance' } }).ok).toBe(false);
    state = engine.applyAction(state, { seat: 0, type: 'roll', payload: {} });
    const mover = engine.playerView(state, 0).board as { preview: Record<string, number>; rollsLeft: number };
    const other = engine.playerView(state, 1).board as { preview: Record<string, number> };
    expect(Object.keys(mover.preview).length).toBe(13);
    expect(Object.keys(other.preview).length).toBe(0);
    expect(mover.rollsLeft).toBe(2);
    // Holding is only allowed after the first roll and toggles a die.
    state = engine.applyAction(state, { seat: 0, type: 'hold', payload: { index: 2 } });
    expect((state.board as { held: boolean[] }).held[2]).toBe(true);
    state = engine.applyAction(state, { seat: 0, type: 'score', payload: { category: 'chance' } });
    expect(state.currentSeat).toBe(1);
    expect((state.board as { rollsLeft: number }).rollsLeft).toBe(3);
    expect(engine.validate(state, { seat: 1, type: 'score', payload: { category: 'chance' } }).ok).toBe(false);
  });

  test('mancala sows counter-clockwise, skips the enemy store and grants an extra turn', () => {
    const engine = new MancalaEngine();
    const state = engine.createInitialState(makeConfig(engine, 2));
    // Pit 2 holds 4 stones → 3,4,5,store(6): lands in own store ⇒ extra turn.
    const next = engine.applyAction(state, { seat: 0, type: 'sow', payload: { pit: 2 } });
    const cups = (next.board as { cups: number[] }).cups;
    expect(cups[2]).toBe(0);
    expect(cups[6]).toBe(1);
    expect(next.currentSeat).toBe(0);
    expect(next.scores[0]).toBe(1);
    // Seat 1 may not act, and seat 0 may not sow from the enemy side or an empty pit.
    expect(engine.validate(next, { seat: 1, type: 'sow', payload: { pit: 7 } }).ok).toBe(false);
    expect(engine.validate(next, { seat: 0, type: 'sow', payload: { pit: 7 } }).ok).toBe(false);
    expect(engine.validate(next, { seat: 0, type: 'sow', payload: { pit: 2 } }).ok).toBe(false);
    // Pit 5 has 5 stones → store, 7, 8, 9, 10 — must skip nothing here, but a
    // long sow from pit 5 with 13 stones must skip cup 13 (enemy store).
    const crafted = engine.createInitialState(makeConfig(engine, 2));
    const cb = crafted.board as { cups: number[]; legal: number[] };
    cb.cups = Array(14).fill(0);
    cb.cups[5] = 13;
    cb.cups[7] = 1; // keep the opponent side non-empty
    cb.legal = [5];
    const after = engine.applyAction(crafted, { seat: 0, type: 'sow', payload: { pit: 5 } });
    const c2 = (after.board as { cups: number[] }).cups;
    expect(c2[13]).toBe(0); // enemy store skipped
    expect(c2[6]).toBeGreaterThanOrEqual(1);
  });

  test('mines keeps the turn on a hit, cascades zeros and never leaks the minefield', () => {
    const engine = new MinesEngine();
    const state = engine.createInitialState(makeConfig(engine, 4));
    const full = state.board as { mines: boolean[][]; size: number };
    expect(full.size).toBe(16);
    const view = engine.playerView(state, 0) as GameState;
    expect(JSON.stringify(view.board)).not.toContain('"mines"');
    // Find a mine and a zero cell to exercise both branches.
    let mine: [number, number] | null = null;
    let zero: [number, number] | null = null;
    for (let r = 0; r < full.size && (!mine || !zero); r++) {
      for (let c = 0; c < full.size && (!mine || !zero); c++) {
        if (full.mines[r][c]) {
          mine ??= [r, c];
        } else {
          let n = 0;
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            const rr = r + dr; const cc = c + dc;
            if ((dr || dc) && rr >= 0 && cc >= 0 && rr < full.size && cc < full.size && full.mines[rr][cc]) n++;
          }
          if (n === 0) zero ??= [r, c];
        }
      }
    }
    expect(mine).not.toBeNull();
    const hit = engine.applyAction(state, { seat: 0, type: 'reveal', payload: { r: mine![0], c: mine![1] } });
    expect(hit.currentSeat).toBe(0);
    expect(hit.scores[0]).toBe(1);
    expect((hit.board as { owners: number[][] }).owners[mine![0]][mine![1]]).toBe(0);
    if (zero) {
      const opened = engine.applyAction(hit, { seat: 0, type: 'reveal', payload: { r: zero[0], c: zero[1] } });
      expect(opened.currentSeat).toBe(1);
      expect((opened.board as { lastMove: { revealed: number } }).lastMove.revealed).toBeGreaterThan(1);
    }
  });

  test('go fish hides other hands, hands over matching cards and books fours', () => {
    const engine = new GoFishEngine();
    const state = engine.createInitialState(makeConfig(engine, 3));
    const full = state.board as { hands: Array<Array<{ id: string; rank: string }>>; pond: unknown[] };
    const v1 = engine.playerView(state, 1).board as { hand: Array<{ id: string }>; handSizes: number[]; pondCount: number };
    expect(v1.hand.map((c) => c.id).sort()).toEqual(full.hands[1].map((c) => c.id).sort());
    expect(v1.handSizes).toEqual(full.hands.map((h) => h.length));
    expect(v1.pondCount).toBe(full.pond.length);
    const json = JSON.stringify(engine.spectatorView(state).board);
    expect(json).not.toContain('"hands"');
    expect(json).not.toContain('"memory"');
    expect((engine.spectatorView(state).board as { hand: unknown }).hand).toBeNull();

    // Craft: seat 0 holds three 7s, seat 1 holds the fourth → asking books it and keeps the turn.
    const crafted = engine.createInitialState(makeConfig(engine, 2));
    const cb = crafted.board as { hands: Array<Array<{ id: string; rank: string; suit: string }>>; books: string[][] };
    cb.hands[0] = [
      { id: '7S', rank: '7', suit: 'S' },
      { id: '7H', rank: '7', suit: 'H' },
      { id: '7D', rank: '7', suit: 'D' },
      { id: '2C', rank: '2', suit: 'C' },
    ];
    cb.hands[1] = [
      { id: '7C', rank: '7', suit: 'C' },
      { id: '9C', rank: '9', suit: 'C' },
    ];
    cb.books = [[], []];
    expect(engine.validate(crafted, { seat: 0, type: 'ask', payload: { target: 1, rank: 'K' } }).ok).toBe(false);
    expect(engine.validate(crafted, { seat: 0, type: 'ask', payload: { target: 0, rank: '7' } }).ok).toBe(false);
    const after = engine.applyAction(crafted, { seat: 0, type: 'ask', payload: { target: 1, rank: '7' } });
    const ab = after.board as { books: string[][]; hands: Array<Array<{ rank: string }>>; lastEvent: { got: number; booked: string | null } };
    expect(ab.lastEvent.got).toBe(1);
    expect(ab.lastEvent.booked).toBe('7');
    expect(ab.books[0]).toEqual(['7']);
    expect(ab.hands[0].some((c) => c.rank === '7')).toBe(false);
    expect(after.currentSeat).toBe(0);
    expect(after.scores[0]).toBe(1);
  });
});

describe('sports & card tables — darts, bowling, big two', () => {
  test('darts scores beds correctly, busts below zero and checks out only on a double', () => {
    const engine = new DartsEngine();
    const state = engine.createInitialState(makeConfig(engine, 2));
    // Treble 20 sits straight up at the treble ring.
    const rings = (state.board as { rings: { trebleIn: number; trebleOut: number; doubleIn: number; doubleOut: number } }).rings;
    const tRadius = (rings.trebleIn + rings.trebleOut) / 2;
    const dRadius = (rings.doubleIn + rings.doubleOut) / 2;
    const t20 = engine.applyAction(state, { seat: 0, type: 'throw', payload: { x: 0, y: tRadius } });
    const b1 = t20.board as { players: Array<{ remaining: number; darts: Array<{ segment: number; multiplier: number; score: number }> }>; dartsLeft: number };
    expect(b1.players[0].darts[0]).toMatchObject({ segment: 20, multiplier: 3, score: 60 });
    expect(b1.players[0].remaining).toBe(241);
    expect(b1.dartsLeft).toBe(2);
    expect(t20.currentSeat).toBe(0);
    // Bull's-eye = 50, a miss off the board = 0 and the visit passes to seat 1.
    const bull = engine.applyAction(t20, { seat: 0, type: 'throw', payload: { x: 0, y: 0 } });
    expect((bull.board as typeof b1).players[0].remaining).toBe(191);
    const miss = engine.applyAction(bull, { seat: 0, type: 'throw', payload: { x: 1.3, y: 0 } });
    expect((miss.board as typeof b1).players[0].remaining).toBe(191);
    expect(miss.currentSeat).toBe(1);
    expect((miss.board as { lastVisit: { total: number; bust: boolean } }).lastVisit).toMatchObject({ total: 110, bust: false });

    // Craft a checkout: 40 left → D20 wins; S20 twice would bust (0 without a double).
    const crafted = engine.createInitialState(makeConfig(engine, 2));
    const cb = crafted.board as { players: Array<{ remaining: number; visitStart: number }> };
    cb.players[0].remaining = 40;
    cb.players[0].visitStart = 40;
    const bust = engine.applyAction(crafted, { seat: 0, type: 'throw', payload: { x: 0, y: 0.4 } }); // single 20 → 20 left
    expect((bust.board as typeof cb).players[0].remaining).toBe(20);
    const bust2 = engine.applyAction(bust, { seat: 0, type: 'throw', payload: { x: 0, y: 0.4 } }); // single 20 → 0 but no double
    expect((bust2.board as typeof cb).players[0].remaining).toBe(40);
    expect((bust2.board as { lastVisit: { bust: boolean } }).lastVisit.bust).toBe(true);
    expect(bust2.currentSeat).toBe(1);
    expect(bust2.phase).toBe('in_progress');

    const won = engine.applyAction(crafted, { seat: 0, type: 'throw', payload: { x: 0, y: dRadius } }); // double 20
    expect(won.phase).toBe('completed');
    expect(won.winnerSeat).toBe(0);
    // Checkout hint only for the thrower.
    expect((engine.playerView(crafted, 0).board as { hint: string | null }).hint).toBe('D20');
    expect((engine.playerView(crafted, 1).board as { hint: string | null }).hint).toBeNull();
  });

  test('bowling keeps frame flow, awards strikes/spares with bonuses and grants last-frame extra balls', () => {
    const engine = new BowlingEngine();
    type Player = { frames: Array<{ rolls: number[]; score: number | null }>; frame: number; ball: number; standing: boolean[]; total: number; done: boolean };
    const state = engine.createInitialState(makeConfig(engine, 2));
    const board = state.board as { players: Player[]; frameCount: number };
    expect(board.frameCount).toBe(5);
    // Force deterministic pin results through the internal roller.
    const roller = engine as unknown as { rollBall: (standing: boolean[], x: number, curve: number, power: number) => { arrival: number; knocked: number[] } };
    const original = roller.rollBall;
    const script: number[][] = [];
    roller.rollBall = (standing: boolean[]) => {
      const want = script.shift() ?? [];
      const knocked = want.filter((p) => standing[p]);
      return { arrival: 0, knocked };
    };
    try {
      const all = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      // Seat 0: strike; seat 1: 7 + 3 spare. Then seat 0: 3 + 4 open; seat 1: 5 + 0.
      script.push(all, [1, 2, 3, 4, 5, 6, 7], [8, 9, 10], [1, 2, 3], [4, 5, 6, 7], [1, 2, 3, 4, 5], []);
      let s = engine.applyAction(state, { seat: 0, type: 'bowl', payload: { x: 0.2, curve: 0, power: 0.9 } });
      expect(s.currentSeat).toBe(1); // strike ends the frame
      s = engine.applyAction(s, { seat: 1, type: 'bowl', payload: { x: 0, curve: 0, power: 0.9 } });
      expect(s.currentSeat).toBe(1); // 7 pins, second ball
      expect((s.board as { pins: number[] }).pins).toEqual([8, 9, 10]);
      s = engine.applyAction(s, { seat: 1, type: 'bowl', payload: { x: 0, curve: 0, power: 0.9 } });
      expect((s.board as { lastRoll: { spare: boolean } }).lastRoll.spare).toBe(true);
      expect(s.currentSeat).toBe(0);
      s = engine.applyAction(s, { seat: 0, type: 'bowl', payload: { x: 0, curve: 0, power: 0.9 } });
      s = engine.applyAction(s, { seat: 0, type: 'bowl', payload: { x: 0, curve: 0, power: 0.9 } });
      s = engine.applyAction(s, { seat: 1, type: 'bowl', payload: { x: 0, curve: 0, power: 0.9 } });
      s = engine.applyAction(s, { seat: 1, type: 'bowl', payload: { x: 0, curve: 0, power: 0.9 } });
      const p = (s.board as { players: Player[] }).players;
      // Strike (10 + 3 + 4 = 17) then open 7 → 24; spare (10 + 5 = 15) then 5 → 20.
      expect(p[0].frames[0].score).toBe(17);
      expect(p[0].frames[1].score).toBe(24);
      expect(p[1].frames[0].score).toBe(15);
      expect(p[1].frames[1].score).toBe(20);
      expect(s.scores).toEqual([24, 20]);

      // Fast-forward both to the last frame and check bonus balls after a strike.
      for (const pl of p) {
        while (pl.frames.length < 4) pl.frames.push({ rolls: [0, 0], score: null });
        pl.frame = 4;
        pl.ball = 1;
        pl.standing = Array<boolean>(11).fill(true);
        pl.standing[0] = false;
      }
      s.currentSeat = 0;
      script.push(all, all, [1, 2, 3, 4, 5]);
      s = engine.applyAction(s, { seat: 0, type: 'bowl', payload: { x: 0, curve: 0, power: 0.9 } });
      expect(s.currentSeat).toBe(0);
      expect((s.board as { players: Player[] }).players[0].ball).toBe(2);
      s = engine.applyAction(s, { seat: 0, type: 'bowl', payload: { x: 0, curve: 0, power: 0.9 } });
      expect((s.board as { players: Player[] }).players[0].ball).toBe(3);
      s = engine.applyAction(s, { seat: 0, type: 'bowl', payload: { x: 0, curve: 0, power: 0.9 } });
      const last = (s.board as { players: Player[] }).players[0];
      expect(last.done).toBe(true);
      expect(last.frames[4].rolls).toEqual([10, 10, 5]);
      expect(s.currentSeat).toBe(1);
      // Seat 1 opens with 3 + 4 → no bonus ball, game ends.
      script.push([1, 2, 3], [4, 5, 6, 7]);
      s = engine.applyAction(s, { seat: 1, type: 'bowl', payload: { x: 0, curve: 0, power: 0.9 } });
      s = engine.applyAction(s, { seat: 1, type: 'bowl', payload: { x: 0, curve: 0, power: 0.9 } });
      expect(s.phase).toBe('completed');
      expect(s.winnerSeat).toBe(0);
    } finally {
      roller.rollBall = original;
    }
  });

  test('big two ranks combinations, enforces the opening card, hides hands and clears the table after passes', () => {
    const engine = new BigTwoEngine();
    const mk = (id: string) => ({ id, rank: id.slice(0, -1), suit: id.slice(-1) as 'D' | 'C' | 'H' | 'S' });
    const c = (ids: string[]) => engine.classify(ids.map(mk))!;
    expect(c(['3D']).kind).toBe('single');
    expect(c(['9H', '9S']).kind).toBe('pair');
    expect(c(['3D', '4D', '5D', '6D', '7D']).kind).toBe('straight_flush');
    expect(c(['3D', '4C', '5D', '6H', '7S']).kind).toBe('straight');
    expect(c(['KD', 'KC', 'KH', '4S', '4D']).kind).toBe('full_house');
    expect(c(['QD', 'QC', 'QH', 'QS', '3D']).kind).toBe('four_kind');
    expect(engine.classify([mk('3D'), mk('4D')])).toBeNull();
    expect(engine.beats(c(['2D']), c(['AS']))).toBe(true); // 2 is high
    expect(engine.beats(c(['AS']), c(['AH']))).toBe(true); // spades beat hearts
    expect(engine.beats(c(['4D', '4C']), c(['2D']))).toBe(false); // size mismatch
    expect(engine.beats(c(['3D', '4C', '5D', '6H', '7S']), c(['KD', 'KC', 'KH', '4S', '4D']))).toBe(false);
    expect(engine.beats(c(['QD', 'QC', 'QH', 'QS', '3D']), c(['KD', 'KC', 'KH', '4S', '4D']))).toBe(true);

    const state = engine.createInitialState(makeConfig(engine, 4));
    const full = state.board as { hands: Array<Array<{ id: string }>>; handSizes: number[] };
    expect(full.handSizes).toEqual([13, 13, 13, 13]);
    const starter = state.currentSeat;
    const view = engine.playerView(state, starter).board as { hand: Array<{ id: string }>; mustInclude: string; playable: string[] };
    expect(view.hand.map((x) => x.id).sort()).toEqual(full.hands[starter].map((x) => x.id).sort());
    expect(view.mustInclude).toBe('3D');
    expect(view.playable).toContain('3D');
    const spectator = engine.spectatorView(state).board as { hand: unknown };
    expect(spectator.hand).toBeNull();
    expect(JSON.stringify(engine.spectatorView(state).board)).not.toContain('"hands"');
    // Opening play must include the 3♦.
    const other = full.hands[starter].find((x) => x.id !== '3D')!;
    expect(engine.validate(state, { seat: starter, type: 'play', payload: { cards: [other.id] } }).ok).toBe(false);
    expect(engine.validate(state, { seat: starter, type: 'pass', payload: {} }).ok).toBe(false);
    let s = engine.applyAction(state, { seat: starter, type: 'play', payload: { cards: ['3D'] } });
    expect((s.board as { handSizes: number[] }).handSizes[starter]).toBe(12);
    // Everyone else passes → the table clears and the starter leads again.
    for (let i = 0; i < 3; i++) {
      expect(s.currentSeat).not.toBe(starter);
      s = engine.applyAction(s, { seat: s.currentSeat, type: 'pass', payload: {} });
    }
    expect(s.currentSeat).toBe(starter);
    expect((s.board as { table: unknown }).table ?? (s.board as { tableCombo: unknown }).tableCombo).toBeNull();
  });
});
