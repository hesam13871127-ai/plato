import { PokerEngine, bestFive } from '../src/game/engine/poker.engine';
import { GoFishEngine } from '../src/game/engine/gofish.engine';
import { MinesweeperEngine } from '../src/game/engine/minesweeper.engine';
import { BankrollEngine, BANKROLL_TILES } from '../src/game/engine/bankroll.engine';
import type { GameState, MatchConfig } from '../src/game/engine/types';

/**
 * White-box rules audit for the four games added in the Plato-parity rebuild:
 * Poker (No-limit Hold'em), Go Fish, Minesweepers and Bankroll (property
 * trading). Each suite probes exact rule behaviour — hand ranking, betting
 * math, side pots, draw/pass flows, scoring, elimination, liquidation — the
 * subtleties the generic bot play-through cannot prove.
 */

function cfg(n: number): MatchConfig {
  return {
    matchId: `m-${Math.random().toString(36).slice(2)}`,
    gameSlug: 'test',
    isLive: false,
    seats: Array.from({ length: n }, (_, i) => ({
      playerId: `user-${i}`,
      seatNumber: i,
      isBot: i > 0,
      displayName: `P${i}`,
      avatarUrl: null,
    })),
  };
}

const board = (state: GameState): Record<string, any> => state.board as Record<string, any>;

/* ─────────────────────────── poker hand ranking ─────────────────────────── */

describe('poker hand evaluator', () => {
  const scoreOf = (cards: string[]) => bestFive(cards).score;

  it('orders categories correctly', () => {
    const highCard = ['2H', '5D', '9S', 'JC', 'KH'];
    const pair = ['2H', '2D', '5S', '9C', 'KH'];
    const twoPair = ['2H', '2D', '9S', '9C', 'KH'];
    const trips = ['2H', '2D', '2S', '9C', 'KH'];
    const straight = ['5H', '6D', '7S', '8C', '9H'];
    const flush = ['2H', '5H', '9H', 'JH', 'KH'];
    const fullHouse = ['2H', '2D', '2S', '9C', '9H'];
    const quads = ['2H', '2D', '2S', '2C', 'KH'];
    const straightFlush = ['5H', '6H', '7H', '8H', '9H'];
    const royal = ['10H', 'JH', 'QH', 'KH', 'AH'];

    expect(scoreOf(highCard)).toBeLessThan(scoreOf(pair));
    expect(scoreOf(pair)).toBeLessThan(scoreOf(twoPair));
    expect(scoreOf(twoPair)).toBeLessThan(scoreOf(trips));
    expect(scoreOf(trips)).toBeLessThan(scoreOf(straight));
    expect(scoreOf(straight)).toBeLessThan(scoreOf(flush));
    expect(scoreOf(flush)).toBeLessThan(scoreOf(fullHouse));
    expect(scoreOf(fullHouse)).toBeLessThan(scoreOf(quads));
    expect(scoreOf(quads)).toBeLessThan(scoreOf(straightFlush));
    expect(scoreOf(straightFlush)).toBeLessThan(scoreOf(royal));
  });

  it('supports the wheel (A-2-3-4-5) as the lowest straight', () => {
    const wheel = ['AH', '2D', '3S', '4C', '5H'];
    const sixHigh = ['2H', '3D', '4S', '5C', '6H'];
    expect(bestFive(wheel).label).toBe('Straight');
    expect(scoreOf(wheel)).toBeLessThan(scoreOf(sixHigh));
  });

  it('breaks ties by kickers', () => {
    const aces = ['AH', 'AD', '4S', '6C', '8H'];
    const kings = ['KH', 'KD', '4S', '6C', '8H'];
    expect(scoreOf(aces)).toBeGreaterThan(scoreOf(kings));

    const pairHighKicker = ['9H', '9D', 'AS', '4C', '5H'];
    const pairLowKicker = ['9H', '9D', 'KS', '4C', '5H'];
    expect(scoreOf(pairHighKicker)).toBeGreaterThan(scoreOf(pairLowKicker));
  });

  it('picks the best five out of seven', () => {
    // Hole + community where the best hand is the flush, not the pair.
    const seven = ['2H', '9H', 'JH', 'KH', '2D', '7C', '4H'];
    const picked = bestFive(seven);
    expect(picked.label).toBe('Flush');
    expect(picked.cards.sort()).toEqual(['2H', '4H', '9H', 'JH', 'KH'].sort());

    // Board plays: no hole card improves two pair on the board.
    const boardPlays = ['2C', '3D', '2H', '2S', '2D', '9C', '9H'];
    expect(bestFive(boardPlays).label).toBe('Four of a Kind');
  });

  it('full house takes the best trips+pair from seven cards', () => {
    const seven = ['3H', '3D', '3S', '9C', '9H', '9D', '2C'];
    const picked = bestFive(seven);
    expect(picked.label).toBe('Full House');
    // Best combination is 999 over 33.
    expect(picked.score).toBe(bestFive(['9H', '9D', '9S', '3H', '3D']).score);
  });
});

/* ───────────────────────────── betting rules ───────────────────────────── */

describe('poker betting rules', () => {
  it('posts blinds and starts preflop action (heads-up: button acts first)', () => {
    const engine = new PokerEngine();
    const state = engine.createInitialState(cfg(2));
    const b = board(state);
    expect(b.handNumber).toBe(1);
    const dealer = b.dealer as number;
    expect(b.chips[dealer]).toBe(1000 - 10); // small blind
    expect(b.chips[1 - dealer]).toBe(1000 - 20); // big blind
    expect(b.currentBet).toBe(20);
    expect(state.currentSeat).toBe(dealer); // heads-up preflop
  });

  it('rejects actions out of turn, checks facing a bet and tiny raises', () => {
    const engine = new PokerEngine();
    const state = engine.createInitialState(cfg(2));
    const notToAct = (state.currentSeat + 1) % 2;
    expect(engine.validate(state, { seat: notToAct, type: 'fold', payload: {} }).ok).toBe(false);
    // Facing the big blind, a check is illegal.
    expect(engine.validate(state, { seat: state.currentSeat, type: 'check', payload: {} }).ok).toBe(false);
    // A raise below min-raise (to < 40) is illegal.
    expect(engine.validate(state, { seat: state.currentSeat, type: 'raise', payload: { to: 30 } }).ok).toBe(false);
    expect(engine.validate(state, { seat: state.currentSeat, type: 'raise', payload: { to: 40 } }).ok).toBe(true);
  });

  it('completes a clean betting round and reveals the flop', () => {
    const engine = new PokerEngine();
    const state = engine.createInitialState(cfg(2));
    const b0 = board(state);
    const dealer = b0.dealer as number;
    // Dealer (SB) completes, BB checks.
    let next = engine.applyAction(state, { seat: state.currentSeat, type: 'call', payload: {} });
    next = engine.applyAction(next, { seat: next.currentSeat, type: 'check', payload: {} });
    const b = board(next);
    expect(b.subPhase).toBe('flop');
    expect((b.community as string[]).length).toBe(3);
    expect(b.currentBet).toBe(0);
    // Postflop heads-up: non-dealer acts first.
    expect(next.currentSeat).toBe(1 - dealer);
    // Street bets were collected into contributions.
    expect((b.contribution as number[]).every((c) => c === 20)).toBe(true);
  });

  it('awards the pot when everyone folds and deals the next hand', () => {
    const engine = new PokerEngine();
    let state = engine.createInitialState(cfg(2));
    const firstDealer = board(state).dealer as number;
    // SB folds; BB takes the pot; the next hand deals immediately.
    state = engine.applyAction(state, { seat: state.currentSeat, type: 'fold', payload: {} });
    const b = board(state);
    // The hand ended (uncontested) and hand #2 dealt immediately.
    expect(b.handNumber).toBe(2);
    expect(b.dealer).toBe(1 - firstDealer);
    expect(b.lastHand.winners).toEqual([1 - firstDealer]);
    expect(b.lastHand.amount).toBe(30);
    expect(b.pot).toBe(30); // fresh hand, blinds posted
    // Winner (now SB) 1010 − 10; folder (now BB) 990 − 20.
    expect(b.chips[1 - firstDealer]).toBe(1000);
    expect(b.chips[firstDealer]).toBe(970);
    // scores snapshot the settlement (before hand #2 blinds).
    expect(state.scores.sort((a: number, b2: number) => a - b2)).toEqual([990, 1010]);
  });

  it('runs an all-in confrontation to showdown and pays the right winner', () => {
    const engine = new PokerEngine();
    let state = engine.createInitialState(cfg(2));
    const b = board(state);
    // Rig the hand for dealer = 1 (heads-up: dealer posts SB 10, acts first).
    b.hole[0] = ['AH', 'AD'];
    b.hole[1] = ['KH', 'KD'];
    b.dealer = 1;
    b.chips = [980, 990];
    b.bet = [20, 10];
    b.contribution = [20, 10];
    b.pot = 30;
    b.currentBet = 20;
    state.currentSeat = 1;
    // Brick run-out: aces make two pair (aces & twos), kings only two pair kings.
    b.deck = ['2D', '2H', '3D', '7C', '9S'];

    // Dealer (seat 1, SB) shoves; seat 0 calls all-in.
    expect(state.currentSeat).toBe(1);
    state = engine.applyAction(state, { seat: 1, type: 'raise', payload: { to: 1000 } });
    expect(state.currentSeat).toBe(0);
    state = engine.applyAction(state, { seat: 0, type: 'allin', payload: {} });

    // Run-out continues automatically to showdown; seat 1 is busted → match over.
    expect(state.phase).toBe('completed');
    expect(state.winnerSeat).toBe(0); // aces hold
    expect(state.scores).toEqual([2000, 0]);
    const last = board(state).lastHand;
    expect(last.amount).toBe(2000);
    expect(last.winners).toEqual([0]);
  });

  it('splits a chopped pot evenly', () => {
    const engine = new PokerEngine();
    let state = engine.createInitialState(cfg(2));
    const b = board(state);
    // Straight on the board plays for both players.
    b.hole[0] = ['2H', '3D'];
    b.hole[1] = ['2S', '3C'];
    b.deck.splice(0, b.deck.length, ['4H', '5D', '6S', '7H', '9D'][0] === '4' ? ['4H', '5D', '6S', '7H', '9D'] : []);
    b.deck = ['4H', '5D', '6S', '7H', '9D'];

    state = engine.applyAction(state, { seat: state.currentSeat, type: 'raise', payload: { to: 1000 } });
    state = engine.applyAction(state, { seat: state.currentSeat, type: 'allin', payload: {} });
    // 3-7 on board is a straight for both → chopped, and the match continues.
    const last = board(state).lastHand;
    expect(last.winners.sort()).toEqual([0, 1]);
    expect(last.amount).toBe(2000);
    // Chips are level again: 1000 each, then hand #2 posts 10/20 blinds.
    expect((board(state).chips as number[]).sort((a, b) => a - b)).toEqual([980, 990]);
    expect(board(state).handNumber).toBe(2);
    expect(state.phase).toBe('in_progress');
  });

  it('builds a side pot when a shorter stack calls all-in', () => {
    const engine = new PokerEngine();
    let state = engine.createInitialState(cfg(3));
    const b = board(state);
    // Rig the hand for dealer = 2 in three-handed: SB = 0, BB = 1, UTG = 2.
    b.dealer = 2;
    b.chips = [990, 980, 200];
    b.bet = [10, 20, 0];
    b.contribution = [10, 20, 0];
    b.pot = 30;
    b.currentBet = 20;
    state.currentSeat = 2;
    expect(state.currentSeat).toBe(2);
    // Make seat 2 the short stack, then let them just call the blind.
    b.chips[2] = 200;
    b.hole[0] = ['AH', 'AD'];
    b.hole[1] = ['2C', '3C'];
    b.hole[2] = ['7H', '8D'];
    // Run-out cannot beat aces: board pairs twos, no straight/flush around 7-8.
    b.deck = ['2D', '2H', '6D', '9S', 'JC'];
    state = engine.applyAction(state, { seat: 2, type: 'call', payload: {} });
    // Seat 0 isolates with a big raise; seat 1 folds; seat 2 is all-in for less.
    state = engine.applyAction(state, { seat: 0, type: 'raise', payload: { to: 500 } });
    expect(state.currentSeat).toBe(1);
    state = engine.applyAction(state, { seat: 1, type: 'fold', payload: {} });
    expect(state.currentSeat).toBe(2);
    state = engine.applyAction(state, { seat: 2, type: 'allin', payload: {} });

    // Seat 0 still has chips and betting rights — they check it down.
    for (let i = 0; i < 3; i++) {
      if (state.phase !== 'in_progress' || (board(state).subPhase as string) === 'showdown') break;
      if (state.currentSeat !== 0) break;
      state = engine.applyAction(state, { seat: 0, type: 'check', payload: {} });
    }

    // Run-out proceeds to showdown, hand #2 deals without seat 2.
    expect(board(state).handNumber).toBe(2);
    expect(board(state).sittingOut[2]).toBe(true);
    const last = board(state).lastHand;
    expect(last.winners).toEqual([0]);
    expect(last.amount).toBe(720); // 60 + 360 + 300 across the three pots
    // Aces held: 500 remaining + 720 won = 1220 · folder keeps 980 · seat 2 busted.
    expect(state.scores[0]).toBe(1220);
    expect(state.scores[1]).toBe(980);
    expect(state.scores[2]).toBe(0);
    // Total chips conserved (rigged stacks sum to 2170 with 30 in the pot).
    expect(state.scores.reduce((a, c) => a + c, 0)).toBe(2200);
  });

  it('hides hidden information in seat views', () => {
    const engine = new PokerEngine();
    const state = engine.createInitialState(cfg(3));
    const view = engine.playerView(state, 0);
    const vb = board(view);
    expect((vb.hole as string[][])[0]).toHaveLength(2);
    expect((vb.hole as string[][])[1]).toEqual(['??', '??']);
    expect(vb.deck).toEqual([]);
    expect(vb.community.length).toBe(0);
  });
});

/* ─────────────────────────────── go fish ─────────────────────────────── */

describe('go fish rules', () => {
  it('deals 7 cards heads-up and 5 cards with 3–4 players', () => {
    for (const n of [2, 3, 4]) {
      const engine = new GoFishEngine();
      const state = engine.createInitialState(cfg(n));
      const hands = board(state).hands as string[][];
      expect(hands.every((h) => h.length === (n <= 2 ? 7 : 5))).toBe(true);
      expect((board(state).deck as string[]).length).toBe(52 - n * (n <= 2 ? 7 : 5));
    }
  });

  it('transfers all cards of the asked rank and lets the asker go again', () => {
    const engine = new GoFishEngine();
    let state = engine.createInitialState(cfg(2));
    const b = board(state);
    // Rig: seat 0 holds two kings, seat 1 holds one king.
    b.hands[0] = ['KH', 'KD', '2S', '3S', '4S', '5S', '6S'];
    b.hands[1] = ['KS', '2H', '3H', '4H', '5H', '6H', '7H'];
    b.deck = ['9D'];

    state = engine.applyAction(state, { seat: 0, type: 'ask', payload: { target: 1, rank: 'K' } });
    const after = board(state);
    expect(after.hands[0].filter((c: string) => c.startsWith('K'))).toHaveLength(3);
    expect(after.hands[1].filter((c: string) => c.startsWith('K'))).toHaveLength(0);
    expect(state.currentSeat).toBe(0); // hit → ask again
    expect(after.lastEvent.kind).toBe('ask_hit');
  });

  it('sends the asker fishing on a miss and passes the turn', () => {
    const engine = new GoFishEngine();
    let state = engine.createInitialState(cfg(2));
    const b = board(state);
    b.hands[0] = ['KH', 'KD', '2S', '3S', '4S', '5S', '6S'];
    b.hands[1] = ['2H', '3H', '4H', '5H', '6H', '7H', '8H'];
    b.deck = ['9D', '9C'];

    state = engine.applyAction(state, { seat: 0, type: 'ask', payload: { target: 1, rank: 'K' } });
    const after = board(state);
    expect(after.lastEvent.kind).toBe('go_fish');
    expect(after.hands[0]).toHaveLength(8); // drew one
    expect(state.currentSeat).toBe(1); // missed → turn passes
  });

  it('grants another turn when the fish draws the asked rank', () => {
    const engine = new GoFishEngine();
    let state = engine.createInitialState(cfg(2));
    const b = board(state);
    b.hands[0] = ['KH', '2S', '3S', '4S', '5S', '6S', '7S'];
    b.hands[1] = ['2H', '3H', '4H', '5H', '6H', '7H', '8H'];
    b.deck = ['KD'];

    state = engine.applyAction(state, { seat: 0, type: 'ask', payload: { target: 1, rank: 'K' } });
    expect(board(state).lastEvent.kind).toBe('lucky_draw');
    expect(state.currentSeat).toBe(0);
  });

  it('lays down books automatically and scores them', () => {
    const engine = new GoFishEngine();
    let state = engine.createInitialState(cfg(2));
    const b = board(state);
    b.hands[0] = ['KH', 'KD', 'KS', 'KC', '2S', '3S', '4S'];
    b.hands[1] = ['2H', '3H', '4H', '5H', '6H', '7H', '8H'];
    b.deck = ['9D'];

    state = engine.applyAction(state, { seat: 0, type: 'ask', payload: { target: 1, rank: 'K' } });
    const after = board(state);
    expect(after.books[0]).toEqual(['K']);
    expect(state.scores).toEqual([1, 0]);
  });

  it('rejects asking for a rank you do not hold and asking yourself', () => {
    const engine = new GoFishEngine();
    const state = engine.createInitialState(cfg(2));
    (state.board as Record<string, any>).hands = [
      ['2H', '3H', '4H', '5H', '6H', '7H', '8H'],
      ['2S', '3S', '4S', '5S', '6S', '7S', '8S'],
    ];
    expect(engine.validate(state, { seat: 0, type: 'ask', payload: { target: 1, rank: 'A' } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 0, type: 'ask', payload: { target: 1, rank: '9' } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 0, type: 'ask', payload: { target: 0, rank: '2' } }).ok).toBe(false);
    expect(engine.validate(state, { seat: 1, type: 'ask', payload: { target: 0, rank: '2' } }).ok).toBe(false); // out of turn
    expect(engine.validate(state, { seat: 0, type: 'ask', payload: { target: 1, rank: '2' } }).ok).toBe(true);
  });

  it('finishes at thirteen books with the most books winning', () => {
    const engine = new GoFishEngine();
    let state = engine.createInitialState(cfg(2));
    const b = board(state);
    // Seat 0 has 12 books' worth already laid + the last four cards to complete book 13.
    b.books[0] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    b.hands[0] = ['AH', 'AD'];
    b.hands[1] = ['AS', 'AC'];
    b.deck = [];
    b.knownRanks = [[], []];

    state = engine.applyAction(state, { seat: 0, type: 'ask', payload: { target: 1, rank: 'A' } });
    expect(state.phase).toBe('completed');
    expect(state.winnerSeat).toBe(0);
    expect(state.scores).toEqual([13, 0]);
  });
});

/* ───────────────────────────── minesweepers ───────────────────────────── */

describe('minesweepers rules', () => {
  it('buries exactly 22 mines with correct adjacency counts', () => {
    const engine = new MinesweeperEngine();
    const state = engine.createInitialState(cfg(3));
    const b = board(state);
    expect((b.mines as boolean[]).filter(Boolean)).toHaveLength(22);
    expect(b.revealed.every((r: boolean) => r === false)).toBe(true);
    for (let i = 0; i < 144; i++) {
      const x = i % 12;
      const y = Math.floor(i / 12);
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= 12 || ny >= 12 || (dx === 0 && dy === 0)) continue;
          if (b.mines[ny * 12 + nx]) n++;
        }
      }
      expect(b.adjacent[i]).toBe(n);
    }
  });

  it('never leaks the mine map through seat or spectator views', () => {
    const engine = new MinesweeperEngine();
    const state = engine.createInitialState(cfg(2));
    for (const seat of [0, 1]) {
      const view = engine.playerView(state, seat);
      expect(board(view).mines).toEqual([]);
      expect(board(view).adjacent).toEqual([]);
      expect((board(view).visible as number[]).every((v) => v === -1)).toBe(true);
    }
    const spec = engine.spectatorView(state);
    expect(board(spec).mines).toEqual([]);
  });

  it('flood-reveals zero pockets and scores +1 per cleared cell', () => {
    const engine = new MinesweeperEngine();
    let state = engine.createInitialState(cfg(2));
    const b = board(state);
    // Hand-build a tiny deterministic field: mines on the top two rows only.
    b.mines.fill(false);
    b.adjacent.fill(0);
    for (let x = 0; x < 12; x++) {
      b.mines[x] = true;
      b.mines[12 + x] = x % 2 === 0;
    }
    for (let i = 0; i < 144; i++) {
      const x = i % 12;
      const y = Math.floor(i / 12);
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= 12 || ny >= 12 || (dx === 0 && dy === 0)) continue;
          if (b.mines[ny * 12 + nx]) n++;
        }
      }
      b.adjacent[i] = n;
    }
    // Dig the bottom-left corner: the whole bottom area is a zero pocket.
    const safe = 11 * 12; // row 11, col 0 — far from the mined top rows
    expect(b.mines[safe]).toBe(false);
    const before = state.scores[0];
    state = engine.applyAction(state, { seat: 0, type: 'reveal', payload: { index: safe } });
    const cleared = (board(state).lastReveal.cleared as number[]).length;
    expect(cleared).toBeGreaterThan(10); // big pocket opened
    expect(state.scores[0]).toBe(before + cleared);
    expect(state.currentSeat).toBe(1); // turn passed
  });

  it('eliminates a player who digs a mine and locks their score', () => {
    const engine = new MinesweeperEngine();
    let state = engine.createInitialState(cfg(3));
    const b = board(state);
    // First covered cell is a mine.
    const mineIdx = b.mines.findIndex(Boolean);
    state.scores[0] = 5; // some prior points
    state.seats[0].score = 5;

    state = engine.applyAction(state, { seat: 0, type: 'reveal', payload: { index: mineIdx } });
    const after = board(state);
    expect(after.eliminated[0]).toBe(true);
    expect(state.scores[0]).toBe(5); // locked, not zeroed
    expect(state.currentSeat).toBe(1);
    expect(engine.validate(state, { seat: 0, type: 'reveal', payload: { index: 0 } }).ok).toBe(false);
  });

  it('hands the field to the last player standing', () => {
    const engine = new MinesweeperEngine();
    let state = engine.createInitialState(cfg(3));
    const b = board(state);
    const mines = (b.mines as boolean[]).map(Boolean);
    const firstMine = mines.findIndex(Boolean);
    state = engine.applyAction(state, { seat: 0, type: 'reveal', payload: { index: firstMine } });
    expect(state.phase).toBe('in_progress');
    const secondMine = mines.findIndex((m, i) => m && !board(state).revealed[i]);
    state = engine.applyAction(state, { seat: state.currentSeat, type: 'reveal', payload: { index: secondMine } });
    expect(state.phase).toBe('completed');
    expect(state.winnerSeat).toBe(2); // the only player who never blew up
  });

  it('toggles flags and clears them when the cell is revealed', () => {
    const engine = new MinesweeperEngine();
    let state = engine.createInitialState(cfg(2));
    const b = board(state);
    state = engine.applyAction(state, { seat: 0, type: 'flag', payload: { index: 50 } });
    expect((board(state).flags as Array<number | null>)[50]).toBe(0);
    expect(state.currentSeat).toBe(0); // flagging does not burn the turn
    state = engine.applyAction(state, { seat: 0, type: 'flag', payload: { index: 50 } });
    expect((board(state).flags as Array<number | null>)[50]).toBe(null);

    // Flag then reveal: allowed, flag disappears.
    state = engine.applyAction(state, { seat: 0, type: 'flag', payload: { index: 50 } });
    state = engine.applyAction(state, { seat: 0, type: 'reveal', payload: { index: 50 } });
    expect((board(state).flags as Array<number | null>)[50]).toBe(null);
    expect((board(state).revealed as boolean[])[50]).toBe(true);
  });
});

/* ─────────────────────────── bankroll (property) ─────────────────────────── */

describe('bankroll rules (property trading)', () => {
  it('builds a 24-tile board with 9 priced groups and fixed service tiles', () => {
    expect(BANKROLL_TILES).toHaveLength(24);
    expect(BANKROLL_TILES[0].kind).toBe('start');
    const props = BANKROLL_TILES.filter((t) => t.kind === 'property');
    expect(props).toHaveLength(18);
    const groups = new Map<number, number>();
    for (const p of props) groups.set(p.group, (groups.get(p.group) ?? 0) + 1);
    expect([...groups.values()].every((c) => c === 2)).toBe(true);
    expect(BANKROLL_TILES.filter((t) => t.kind === 'chance')).toHaveLength(3);
    expect(BANKROLL_TILES.filter((t) => t.kind === 'tax')).toHaveLength(2);
    // Rents track price and rise along the board.
    expect(props[0].price).toBe(120);
    expect(props[props.length - 1].price).toBe(440);
    expect(props.every((p) => p.rent === Math.round(p.price * 0.45))).toBe(true);
  });

  it('pays salary when passing Start and rolls 2d6 movement', () => {
    const engine = new BankrollEngine();
    let state = engine.createInitialState(cfg(2));
    board(state).positions[0] = 18;
    const cashBefore = (board(state).cash as number[])[0];
    // Deterministic dice: d1 = 1 (random 0), d2 = 6 (random 0.99) → 7 steps.
    const rnd = jest.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.99);
    state = engine.applyAction(state, { seat: 0, type: 'roll', payload: {} });
    rnd.mockRestore();
    const roll = board(state).lastRoll;
    expect(roll.dice).toEqual([1, 6]);
    expect(roll.from).toBe(18);
    expect(roll.to).toBe(1); // 18 + 7 = 25 → wraps to 1
    expect(roll.passedStart).toBe(true);
    expect((board(state).cash as number[])[0]).toBe(cashBefore + 300);
  });

  it('opens a purchase decision on unowned property and closes it on buy', () => {
    const engine = new BankrollEngine();
    let state = engine.createInitialState(cfg(2));
    const b = board(state);
    // Land seat 0 on the first property by rolling until it happens.
    for (let guard = 0; guard < 200; guard++) {
      if (state.phase !== 'in_progress') return;
      if (state.currentSeat !== 0) {
        const move = engine.chooseBotMove(state, state.currentSeat, 'hard');
        state = engine.applyAction(state, { ...move.action, seat: state.currentSeat });
        continue;
      }
      if (board(state).pendingBuy) break;
      state = engine.applyAction(state, { seat: 0, type: 'roll', payload: {} });
    }
    const pending = board(state).pendingBuy;
    expect(pending).toBeTruthy();
    expect(pending.seat).toBe(0);
    const price = pending.price as number;
    const cashBefore = (board(state).cash as number[])[0];
    // While the decision is open, rolling is rejected.
    expect(engine.validate(state, { seat: 0, type: 'roll', payload: {} }).ok).toBe(false);
    state = engine.applyAction(state, { seat: 0, type: 'buy', payload: {} });
    expect((board(state).owner as Array<number | null>)[pending.tile]).toBe(0);
    expect((board(state).cash as number[])[0]).toBe(cashBefore - price);
    expect(board(state).pendingBuy).toBe(null);
    expect(state.currentSeat).toBe(1);
  });

  it('charges doubled rent when the owner owns the whole group', () => {
    const engine = new BankrollEngine();
    let state = engine.createInitialState(cfg(2));
    const b = board(state);
    // Seat 1 owns both Market lots (group 3: tiles 10 & 11, rent 108).
    const g3 = BANKROLL_TILES.map((t, i) => ({ t, i })).filter((x) => x.t.kind === 'property' && x.t.group === 3);
    for (const { i } of g3) b.owner[i] = 1;
    const rent = g3[0].t.rent;
    // Seat 0 sits on tile 5; dice mocked to d1=2, d2=3 → steps 5 → lands tile 10.
    b.positions[0] = 5;
    b.cash[0] = 500;
    const rnd = jest.spyOn(Math, 'random').mockReturnValueOnce(0.2).mockReturnValueOnce(0.4);
    state = engine.applyAction(state, { seat: 0, type: 'roll', payload: {} });
    rnd.mockRestore();
    // Rent charged automatically; cash went down by the doubled rent.
    expect((board(state).cash as number[])[0]).toBe(500 - rent * 2);
    expect((board(state).cash as number[])[1]).toBe(1000 + rent * 2);
  });

  it('liquidates districts at half price when short on cash', () => {
    const engine = new BankrollEngine();
    let state = engine.createInitialState(cfg(2));
    const b = board(state);
    // Seat 1 owns both Old Town lots (group 1, price 160, rent 72).
    const g1 = BANKROLL_TILES.map((t, i) => ({ t, i })).filter((x) => x.t.kind === 'property' && x.t.group === 1);
    for (const { i } of g1) b.owner[i] = 1;
    // Seat 0 owns one cheap district (their lifeline) and lands on Old Town I
    // with less cash than the doubled rent.
    b.owner[1] = 0;
    b.positions[0] = 0; // Start → dice 4 lands on tile 4 = Old Town I
    b.cash[0] = 100; // doubled rent is 144 → forced liquidation
    const rnd = jest.spyOn(Math, 'random').mockReturnValueOnce(0.2).mockReturnValueOnce(0.2);
    state = engine.applyAction(state, { seat: 0, type: 'roll', payload: {} });
    rnd.mockRestore();
    expect((board(state).owner as Array<number | null>)[1]).toBe(null); // sold back
    // 100 + 60 (half of 120... tile 1 is Harbor I at 120 → +60) = 160 ≥ 144 → 16 left.
    expect((board(state).cash as number[])[0]).toBe(16);
    expect((board(state).cash as number[])[1]).toBe(1000 + 144);
  });

  it('bankrupts players who cannot pay even after liquidation', () => {
    const engine = new BankrollEngine();
    let state = engine.createInitialState(cfg(2));
    const b = board(state);
    const g1 = BANKROLL_TILES.map((t, i) => ({ t, i })).filter((x) => x.t.kind === 'property' && x.t.group === 1);
    for (const { i } of g1) b.owner[i] = 1;
    b.positions[0] = 0; // Start → dice 4 lands on tile 4 = Old Town I
    b.cash[0] = 10; // cannot cover 144 even by selling
    const rnd = jest.spyOn(Math, 'random').mockReturnValueOnce(0.2).mockReturnValueOnce(0.2);
    state = engine.applyAction(state, { seat: 0, type: 'roll', payload: {} });
    rnd.mockRestore();
    const after = board(state);
    expect(after.bankrupt[0]).toBe(true);
    expect(after.owner[1]).toBe(null); // assets returned to the bank
    expect(state.phase).toBe('completed');
    expect(state.winnerSeat).toBe(1); // last one standing
  });

  it('finishes the match when a player reaches the net-worth goal', () => {
    const engine = new BankrollEngine();
    let state = engine.createInitialState(cfg(2));
    const b = board(state);
    b.owner[1] = 0; // Harbor I: net worth +120
    b.cash[0] = 3000 - 120; // exactly at the goal
    // Any turn end re-checks the goal — buy nothing, just roll (and pass on
    // any purchase decision the landing opens).
    const rnd = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    state = engine.applyAction(state, { seat: 0, type: 'roll', payload: {} });
    if (state.phase === 'in_progress' && (state.board as Record<string, any>).pendingBuy) {
      state = engine.applyAction(state, { seat: 0, type: 'pass', payload: {} });
    }
    rnd.mockRestore();
    expect(state.phase).toBe('completed');
    expect(state.winnerSeat).toBe(0);
  });
});
