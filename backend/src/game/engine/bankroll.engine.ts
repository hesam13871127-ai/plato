import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

/** Starting cash and the net-worth target (Plato Bankroll style). */
const START_CASH = 1000;
const GOAL = 3000;
const SALARY = 300;
const TAX = 120;

export type TileKind = 'start' | 'property' | 'chance' | 'tax';

export interface BankrollTile {
  kind: TileKind;
  /** Display name. */
  name: string;
  /** Colour group for properties (0..8), -1 otherwise. */
  group: number;
  /** Purchase price for properties, 0 otherwise. */
  price: number;
  /** Base rent (doubled when the owner holds the whole group). */
  rent: number;
}

const GROUP_NAMES = ['Harbor', 'Old Town', 'Green Park', 'Market', 'Copper Hill', 'Museum Row', 'Skyline', 'Palm Bay', 'Crown Center'];

function buildTiles(): BankrollTile[] {
  const tiles: BankrollTile[] = BANKROLL_TILES_LAYOUT.map((kind) => {
    if (kind === 'start') return { kind, name: 'Start', group: -1, price: 0, rent: 0 };
    if (kind === 'chance') return { kind, name: 'Chance', group: -1, price: 0, rent: 0 };
    if (kind === 'tax') return { kind, name: 'Tax Office', group: -1, price: 0, rent: 0 };
    // Property placeholder — replaced with the real district below.
    return { kind: 'property', name: '?', group: -1, price: 0, rent: 0 };
  });
  // Assign the 18 property slots to 9 groups of 2, cheapest near Start.
  const propSlots = [1, 2, 4, 5, 7, 8, 10, 11, 12, 13, 15, 16, 18, 19, 20, 21, 22, 23];
  propSlots.forEach((slot, n) => {
    const group = Math.floor(n / 2);
    const price = 120 + group * 40;
    tiles[slot] = {
      kind: 'property',
      name: `${GROUP_NAMES[group]} ${n % 2 === 0 ? 'I' : 'II'}`,
      group,
      price,
      rent: Math.round(price * 0.45),
    };
  });
  return tiles;
}

/** Circular board layout: 1 Start + 18 properties + 3 Chance + 2 Tax. */
const BANKROLL_TILES_LAYOUT: TileKind[] = [
  'start',       // 0
  'property', 'property', // 1,2  g0
  'chance',      // 3
  'property', 'property', // 4,5  g1
  'tax',         // 6
  'property', 'property', // 7,8  g2
  'chance',      // 9
  'property', 'property', // 10,11 g3
  'property', 'property', // 12,13 g4
  'tax',         // 14
  'property', 'property', // 15,16 g5
  'chance',      // 17
  'property', 'property', // 18,19 g6
  'property', 'property', // 20,21 g7
  'property', 'property', // 22,23 g8
];

/** Public tile layout (exported for the rules suite and mirrored on board). */
export const BANKROLL_TILES: BankrollTile[] = buildTiles();

/** Chance deck: each effect runs twice through the deck. */
type ChanceEffect =
  | { kind: 'cash'; amount: number }
  | { kind: 'to_start' }
  | { kind: 'advance'; steps: number }
  | { kind: 'collect'; amount: number }
  | { kind: 'pay_each'; amount: number };

const CHANCE_DECK: ChanceEffect[] = [
  { kind: 'cash', amount: 200 },
  { kind: 'cash', amount: -80 },
  { kind: 'to_start' },
  { kind: 'advance', steps: 3 },
  { kind: 'collect', amount: 150 },
  { kind: 'pay_each', amount: 40 },
  { kind: 'cash', amount: 120 },
  { kind: 'cash', amount: -120 },
  { kind: 'advance', steps: -4 },
  { kind: 'collect', amount: 60 },
  { kind: 'pay_each', amount: 25 },
  { kind: 'cash', amount: -60 },
];

interface BankrollBoard extends Record<string, unknown> {
  tiles: BankrollTile[];
  /** Tile → owning seat, null = bank. */
  owner: Array<number | null>;
  positions: number[];
  cash: number[];
  bankrupt: boolean[];
  /** Server-only shuffled chance deck. Stripped from client views. */
  chanceDeck: ChanceEffect[];
  /** Public description of the most recent chance draw. */
  lastChance: { seat: number; text: string } | null;
  /** Pending purchase decision (engine waits for buy/pass). */
  pendingBuy: { seat: number; tile: number; price: number } | null;
  lastRoll: { seat: number; dice: [number, number]; from: number; to: number; passedStart: boolean } | null;
  log: Array<{ seat: number; text: string }>;
  turnCount: number;
}

/**
 * Bankroll — Plato's property-trading race, rebuilt to match the real game:
 * roll, lap the board collecting your salary, buy districts, charge rent,
 * dodge taxes and chance, and be the FIRST player whose net worth (cash +
 * properties) reaches the target. Land on an unowned district and the sale
 * waits on your decision; everything else resolves automatically. A player
 * who cannot pay auto-liquidates districts at half price, and if that is not
 * enough they go bankrupt. Last solvent player also wins.
 */
@Injectable()
export class BankrollEngine extends BaseGameEngine {
  readonly slug = 'bankroll';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const board: BankrollBoard = {
      tiles: BANKROLL_TILES.map((t) => ({ ...t })),
      owner: BANKROLL_TILES.map(() => null),
      positions: config.seats.map(() => 0),
      cash: config.seats.map(() => START_CASH),
      bankrupt: config.seats.map(() => false),
      chanceDeck: this.shuffledChance(),
      lastChance: null,
      pendingBuy: null,
      lastRoll: null,
      log: [],
      turnCount: 0,
    };
    const state: GameState = {
      phase: 'in_progress',
      turn: 0,
      currentSeat: 0,
      turnStartedAt: new Date().toISOString(),
      seats: config.seats.map((s, i) => ({
        seatNumber: i,
        playerId: s.playerId,
        displayName: s.displayName,
        avatarUrl: s.avatarUrl,
        connected: true,
        score: START_CASH,
      })),
      board: board as unknown as Record<string, unknown>,
      winnerSeat: null,
      scores: config.seats.map(() => START_CASH),
      version: 1,
    };
    this.syncScores(state);
    return state;
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'The game is already over.' };
    if (action.seat !== state.currentSeat) return { ok: false, error: 'It is not your turn.' };
    const board = state.board as unknown as BankrollBoard;

    if (action.type === 'roll') {
      if (board.pendingBuy) return { ok: false, error: 'Decide on the property first.' };
      return { ok: true };
    }
    if (action.type === 'buy' || action.type === 'pass') {
      if (!board.pendingBuy || board.pendingBuy.seat !== action.seat) {
        return { ok: false, error: 'There is no property to decide on.' };
      }
      if (action.type === 'buy' && board.cash[action.seat] < board.pendingBuy.price) {
        return { ok: false, error: 'Not enough cash for this district.' };
      }
      return { ok: true };
    }
    return { ok: false, error: 'Unknown action.' };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid action.');
    const next = this.clone(state);
    const board = next.board as unknown as BankrollBoard;
    const seat = action.seat;

    if (action.type === 'buy' && board.pendingBuy) {
      const { tile, price } = board.pendingBuy;
      board.cash[seat] -= price;
      board.owner[tile] = seat;
      board.log.push({ seat, text: `bought ${board.tiles[tile].name} for ${price}` });
      board.pendingBuy = null;
      this.endTurn(state, next, seat);
      return next;
    }
    if (action.type === 'pass') {
      board.log.push({ seat, text: `passed on ${board.tiles[board.pendingBuy!.tile].name}` });
      board.pendingBuy = null;
      this.endTurn(state, next, seat);
      return next;
    }

    // roll
    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);
    const steps = d1 + d2;
    const from = board.positions[seat];
    const to = (from + steps) % 24;
    const passedStart = from + steps >= 24 || to === 0;
    board.positions[seat] = to;
    board.lastRoll = { seat, dice: [d1, d2], from, to, passedStart };
    board.turnCount += 1;

    if (passedStart) {
      board.cash[seat] += SALARY;
      board.log.push({ seat, text: `collects ${SALARY} salary` });
    }

    this.resolveTile(state, next, seat, true);
    if (next.phase !== 'in_progress') return next;
    if (!board.pendingBuy) this.endTurn(state, next, seat);
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as BankrollBoard;
    const buffer = difficulty === 'easy' ? 220 : difficulty === 'medium' ? 120 : difficulty === 'hard' ? 60 : 20;

    if (board.pendingBuy && board.pendingBuy.seat === seat) {
      const { tile, price } = board.pendingBuy;
      const tiles = board.tiles;
      const partnerSlot = tiles.findIndex((t, i) => i !== tile && t.kind === 'property' && t.group === tiles[tile].group);
      const completesSet = partnerSlot >= 0 && board.owner[partnerSlot] === seat;
      const affordable = board.cash[seat] - price >= (completesSet ? 0 : buffer);
      const buy = affordable || (completesSet && board.cash[seat] >= price);
      return {
        action: { seat, type: buy ? 'buy' : 'pass', payload: {} },
        delayMs: this.think(difficulty),
      };
    }
    return { action: { seat, type: 'roll', payload: {} }, delayMs: this.think(difficulty) };
  }

  // ── rules ─────────────────────────────────────────────────────────────────

  /** Resolves the tile the seat stands on (recursively for chance moves). */
  private resolveTile(state: GameState, next: GameState, seat: number, deep: boolean): void {
    const board = next.board as unknown as BankrollBoard;
    const pos = board.positions[seat];
    const tile = board.tiles[pos];

    if (tile.kind === 'start') return; // salary already granted on pass/landing

    if (tile.kind === 'tax') {
      this.charge(state, next, seat, TAX, `pays ${TAX} tax`);
      return;
    }

    if (tile.kind === 'chance') {
      if (board.chanceDeck.length === 0) board.chanceDeck = this.shuffledChance();
      const card = board.chanceDeck.shift() as ChanceEffect;
      switch (card.kind) {
        case 'cash':
          board.cash[seat] += card.amount;
          board.lastChance = { seat, text: card.amount >= 0 ? `The bank pays you ${card.amount}` : `You are fined ${-card.amount}` };
          break;
        case 'to_start':
          board.positions[seat] = 0;
          board.cash[seat] += SALARY;
          board.lastChance = { seat, text: `Move to Start — collect ${SALARY}` };
          break;
        case 'advance': {
          const target = (board.positions[seat] + card.steps + 24) % 24;
          const passed = card.steps > 0 && board.positions[seat] + card.steps >= 24;
          board.positions[seat] = target;
          if (passed) board.cash[seat] += SALARY;
          board.lastChance = { seat, text: card.steps > 0 ? `Advance ${card.steps}` : `Go back ${-card.steps}` };
          if (deep) this.resolveTile(state, next, seat, false);
          break;
        }
        case 'collect': {
          let total = 0;
          for (let i = 0; i < board.cash.length; i++) {
            if (i === seat || board.bankrupt[i]) continue;
            const pay = Math.min(card.amount, board.cash[i]);
            board.cash[i] -= pay;
            total += pay;
          }
          board.cash[seat] += total;
          board.lastChance = { seat, text: `Collect ${total} from the table` };
          break;
        }
        case 'pay_each': {
          for (let i = 0; i < board.cash.length; i++) {
            if (i === seat || board.bankrupt[i]) continue;
            const pay = Math.min(card.amount, board.cash[seat]);
            board.cash[seat] -= pay;
            board.cash[i] += pay;
          }
          board.lastChance = { seat, text: `Pay each player ${card.amount}` };
          break;
        }
      }
      board.log.push({ seat, text: `Chance: ${board.lastChance?.text ?? ''}` });
      this.checkGoal(state, next);
      return;
    }

    // property
    const owner = board.owner[pos];
    if (owner === null) {
      board.pendingBuy = { seat, tile: pos, price: tile.price };
      return;
    }
    if (owner === seat) return;
    // Rent — doubles when the owner holds the whole group.
    const monopoly = board.tiles.every((t, i) => t.kind !== 'property' || t.group !== tile.group || board.owner[i] === owner);
    const due = monopoly ? tile.rent * 2 : tile.rent;
    this.charge(state, next, seat, due, `pays ${due} rent to seat ${owner + 1}`, owner);
  }

  /**
   * Charges cash, auto-liquidating properties at half price when short.
   * Bankrupts the seat if even that is not enough.
   */
  private charge(state: GameState, next: GameState, seat: number, amount: number, logText: string, payee?: number): void {
    const board = next.board as unknown as BankrollBoard;
    let due = amount;
    if (board.cash[seat] < due) {
      // Liquidate cheapest properties first.
      const owned = board.tiles
        .map((t, i) => ({ t, i }))
        .filter((x) => x.t.kind === 'property' && board.owner[x.i] === seat)
        .sort((a, b) => a.t.price - b.t.price);
      for (const { i } of owned) {
        if (board.cash[seat] >= due) break;
        const sale = Math.round(board.tiles[i].price / 2);
        board.cash[seat] += sale;
        board.owner[i] = null;
        board.log.push({ seat, text: `liquidates ${board.tiles[i].name} for ${sale}` });
      }
    }
    if (board.cash[seat] < due) {
      // Bankrupt: everything back to the bank.
      board.tiles.forEach((t, i) => {
        if (t.kind === 'property' && board.owner[i] === seat) board.owner[i] = null;
      });
      board.cash[seat] = 0;
      board.bankrupt[seat] = true;
      board.log.push({ seat, text: 'is bankrupt!' });
      this.checkLastStanding(state, next);
      return;
    }
    board.cash[seat] -= due;
    if (payee !== undefined) board.cash[payee] += due;
    board.log.push({ seat, text: logText });
    this.checkGoal(state, next);
  }

  private checkGoal(state: GameState, next: GameState): void {
    const board = next.board as unknown as BankrollBoard;
    for (let i = 0; i < board.cash.length; i++) {
      if (board.bankrupt[i]) continue;
      if (this.netWorth(board, i) >= GOAL) {
        this.finish(state, next, i);
        return;
      }
    }
  }

  private checkLastStanding(state: GameState, next: GameState): void {
    const board = next.board as unknown as BankrollBoard;
    const solvent = board.cash.map((_, i) => i).filter((i) => !board.bankrupt[i]);
    if (solvent.length === 1) this.finish(state, next, solvent[0]);
  }

  private netWorth(board: BankrollBoard, seat: number): number {
    return board.cash[seat] + board.tiles.reduce((sum, t, i) => (t.kind === 'property' && board.owner[i] === seat ? sum + t.price : sum), 0);
  }

  private syncScores(state: GameState): void {
    const board = state.board as unknown as BankrollBoard;
    state.scores = board.cash.map((_, i) => this.netWorth(board, i));
    state.seats = state.seats.map((s, i) => ({ ...s, score: state.scores[i] }));
  }

  private endTurn(_state: GameState, next: GameState, from: number): void {
    const board = next.board as unknown as BankrollBoard;
    this.checkGoal(_state, next);
    if (next.phase !== 'in_progress') return;
    const n = board.cash.length;
    let s = (from + 1) % n;
    for (let i = 0; i < n; i++) {
      if (!board.bankrupt[s]) break;
      s = (s + 1) % n;
    }
    if (board.bankrupt[s]) {
      // Everyone else bankrupt — cannot happen (checkLastStanding), guard anyway.
      this.finish(_state, next, from);
      return;
    }
    next.currentSeat = s;
    next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
    this.syncScores(next);
  }

  private finish(state: GameState, next: GameState, winner: number): void {
    const board = next.board as unknown as BankrollBoard;
    next.phase = 'completed';
    next.winnerSeat = winner;
    next.currentSeat = -1;
    this.syncScores(next);
    board.log.push({ seat: winner, text: 'reaches the net-worth goal and wins!' });
  }

  // ── shared ────────────────────────────────────────────────────────────────

  private shuffledChance(): ChanceEffect[] {
    const deck = CHANCE_DECK.map((c) => ({ ...c }));
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  /** Hides the upcoming chance deck order from clients. */
  protected redactHidden(state: GameState, _seat: number): GameState {
    const board = state.board as unknown as BankrollBoard;
    return {
      ...state,
      board: {
        ...board,
        chanceDeck: [],
      } as unknown as Record<string, unknown>,
    };
  }

  private think(difficulty: SeatInfo['botDifficulty']): number {
    const base = difficulty === 'easy' ? 1300 : difficulty === 'medium' ? 1000 : difficulty === 'hard' ? 750 : 550;
    return base + Math.floor(Math.random() * 700);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as BankrollBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...(board as Record<string, unknown>),
        tiles: board.tiles.map((t) => ({ ...t })),
        owner: [...board.owner],
        positions: [...board.positions],
        cash: [...board.cash],
        bankrupt: [...board.bankrupt],
        chanceDeck: board.chanceDeck.map((c) => ({ ...c })),
        lastChance: board.lastChance ? { ...board.lastChance } : null,
        pendingBuy: board.pendingBuy ? { ...board.pendingBuy } : null,
        lastRoll: board.lastRoll ? { ...board.lastRoll, dice: [...board.lastRoll.dice] as [number, number] } : null,
        log: board.log.map((l) => ({ ...l })),
      } as unknown as Record<string, unknown>,
    };
  }
}
