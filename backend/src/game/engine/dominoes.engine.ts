import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type {
  ActionResult,
  BotMove,
  GameAction,
  GameState,
  MatchConfig,
  SeatInfo,
} from './types';

/** A tile represented as [low, high] (sorted). */
type Tile = [number, number];

interface DominoBoard extends Record<string, unknown> {
  /** The chain of played tiles in order, each as [a, b] with open ends. */
  chain: Array<{ tile: Tile; openEnds: [number, number] }>;
  /** Current open end values of the line, [leftValue, rightValue]. */
  ends: [number, number] | null;
  boneyard: number;
  /** Hands are SERVER-ONLY; never sent to other seats. */
  hands: Tile[][];
  /** True when a seat is required to draw/pass because it has no playable tile. */
  mustDraw: boolean[];
  passes: number[];
}

/**
 * Draw Dominoes for 2–4 players.
 * Tiles are hidden per seat; only the board chain, ends, boneyard count and the
 * seat's own hand are exposed to that seat.
 */
@Injectable()
export class DominoesEngine extends BaseGameEngine {
  readonly slug = 'dominoes';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  private static readonly ALL_TILES: Tile[] = (() => {
    const tiles: Tile[] = [];
    for (let a = 0; a <= 6; a++) {
      for (let b = a; b <= 6; b++) tiles.push([a, b]);
    }
    return tiles;
  })();

  createInitialState(config: MatchConfig): GameState {
    const seats = config.seats;
    if (seats.length < this.minPlayers || seats.length > this.maxPlayers) {
      throw new BadRequestException(`Dominoes supports ${this.minPlayers}-${this.maxPlayers} players.`);
    }

    const deck = this.shuffle(DominoesEngine.ALL_TILES.map((t) => [...t] as Tile));
    const handSize = seats.length === 2 ? 7 : seats.length === 3 ? 6 : 5;
    const hands: Tile[][] = seats.map(() => []);
    for (let i = 0; i < handSize; i++) {
      for (let s = 0; s < seats.length; s++) hands[s].push(deck.pop()!);
    }

    const board: DominoBoard = {
      chain: [],
      ends: null,
      boneyard: deck.length,
      hands,
      mustDraw: seats.map(() => false),
      passes: seats.map(() => 0),
    };
    // The boneyard keeps the remaining tiles server-side.
    (board as Record<string, unknown>)._boneyardTiles = deck;

    const firstSeat = this.pickFirstSeat(hands);

    return {
      phase: 'in_progress',
      turn: 0,
      currentSeat: firstSeat,
      turnStartedAt: new Date().toISOString(),
      seats: seats.map((s, i) => ({
        seatNumber: i,
        playerId: s.playerId,
        displayName: s.displayName,
        avatarUrl: s.avatarUrl,
        connected: true,
        score: 0,
      })),
      board,
      winnerSeat: null,
      scores: seats.map(() => 0),
      version: 1,
    };
  }

  // ── Validation ─────────────────────────────────────────────────────────

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'Game is not in progress.' };
    if (action.seat !== state.currentSeat) return { ok: false, error: 'It is not your turn.' };

    const board = state.board as DominoBoard;

    switch (action.type) {
      case 'play_tile': {
        const tile = this.asTile(action.payload.tile);
        if (!tile) return { ok: false, error: 'Invalid tile.' };
        const hand = board.hands[action.seat];
        if (!this.handHas(hand, tile)) return { ok: false, error: 'You do not hold that tile.' };
        const side = this.resolveSide(board, tile, action.payload.side);
        if (!side) {
          return { ok: false, error: 'That tile cannot be played at either end.' };
        }
        return { ok: true };
      }
      case 'draw': {
        if (board.boneyard <= 0) return { ok: false, error: 'The boneyard is empty.' };
        if (this.hasPlayable(board, board.hands[action.seat])) {
          return { ok: false, error: 'You have a playable tile.' };
        }
        return { ok: true };
      }
      case 'pass': {
        if (board.boneyard > 0 && !board.mustDraw[action.seat]) {
          return { ok: false, error: 'Draw from the boneyard before passing.' };
        }
        if (this.hasPlayable(board, board.hands[action.seat])) {
          return { ok: false, error: 'You have a playable tile.' };
        }
        return { ok: true };
      }
      default:
        return { ok: false, error: `Unknown action "${action.type}".` };
    }
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) {
      throw new BadRequestException(check.error ?? 'Invalid move.');
    }

    const next: GameState = this.clone(state);
    const board = next.board as DominoBoard;
    const boneyardTiles = (board as Record<string, unknown>)._boneyardTiles as Tile[];

    if (action.type === 'play_tile') {
      const tile = this.asTile(action.payload.tile)!;
      const side = this.resolveSide(board, tile, action.payload.side) ?? 'left';
      this.removeFromHand(board.hands[action.seat], tile);
      this.placeTile(board, tile, side);
      board.mustDraw[action.seat] = false;
      next.version += 1;

      if (board.hands[action.seat].length === 0) {
        this.finish(next, action.seat, 'empty_hand');
        return next;
      }
    } else if (action.type === 'draw') {
      const drawn = boneyardTiles.pop()!;
      board.boneyard = boneyardTiles.length;
      board.hands[action.seat].push(drawn);
      board.mustDraw[action.seat] = true;
      next.version += 1;
      // Drawing does not advance the turn; the player then plays or passes.
      return next;
    } else if (action.type === 'pass') {
      board.passes[action.seat] += 1;
      board.mustDraw[action.seat] = false;
      next.version += 1;
    }

    // Blocked game: everyone has passed consecutively with an empty boneyard.
    if (board.boneyard === 0 && board.passes.every((p) => p > 0) && this.allStuck(board)) {
      const winner = this.lowestPipsSeat(board);
      this.finish(next, winner, 'blocked');
      return next;
    }

    this.advanceTurn(next);
    return next;
  }

  // ── Bot AI ──────────────────────────────────────────────────────────────

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as DominoBoard;
    const hand = board.hands[seat];
    const playable = this.playableTiles(board, hand);

    // No playable tile → draw if possible, otherwise pass.
    if (playable.length === 0) {
      if (board.boneyard > 0 && !board.mustDraw[seat]) {
        return { action: { seat, type: 'draw', payload: {} }, delayMs: this.think(difficulty) };
      }
      return { action: { seat, type: 'pass', payload: {} }, delayMs: this.think(difficulty) };
    }

    // Mistake chance: weaker bots sometimes pick a random legal tile.
    const mistakeChance = difficulty === 'easy' ? 0.45 : difficulty === 'medium' ? 0.2 : difficulty === 'hard' ? 0.08 : 0.02;
    const chosen = Math.random() < mistakeChance
      ? playable[Math.floor(Math.random() * playable.length)]
      : this.bestTile(board, playable, difficulty);

    const side = this.preferredSide(board, chosen);
    return {
      action: { seat, type: 'play_tile', payload: { tile: chosen, side } },
      delayMs: this.think(difficulty),
    };
  }

  // ── Hidden information ──────────────────────────────────────────────────

  protected redactHidden(state: GameState, seat: number): GameState {
    const board = state.board as DominoBoard;
    const safeBoard: Record<string, unknown> = {
      chain: board.chain,
      ends: board.ends,
      boneyard: board.boneyard,
      handSizes: board.hands.map((h) => h.length),
      hand: seat >= 0 ? board.hands[seat] : null,
    };
    return {
      ...state,
      board: safeBoard,
    };
  }

  // ── Rules helpers ───────────────────────────────────────────────────────

  private pickFirstSeat(hands: Tile[][]): number {
    // Highest double leads; otherwise the seat holding the highest-pip tile.
    let bestSeat = 0;
    let bestKey = -1;
    hands.forEach((hand, seat) => {
      for (const [a, b] of hand) {
        const key = a === b ? 100 + a * 2 : a + b;
        if (key > bestKey) {
          bestKey = key;
          bestSeat = seat;
        }
      }
    });
    return bestSeat;
  }

  private shuffle(tiles: Tile[]): Tile[] {
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }
    return tiles;
  }

  private asTile(value: unknown): Tile | null {
    if (!Array.isArray(value) || value.length !== 2) return null;
    const a = Number(value[0]);
    const b = Number(value[1]);
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    if (a < 0 || a > 6 || b < 0 || b > 6) return null;
    return [Math.min(a, b), Math.max(a, b)];
  }

  private handHas(hand: Tile[], tile: Tile): boolean {
    return hand.some(([a, b]) => a === tile[0] && b === tile[1]);
  }

  private removeFromHand(hand: Tile[], tile: Tile): void {
    const idx = hand.findIndex(([a, b]) => a === tile[0] && b === tile[1]);
    if (idx >= 0) hand.splice(idx, 1);
  }

  private canPlay(board: DominoBoard, tile: Tile, side: 'left' | 'right'): boolean {
    if (!board.ends) return true; // first tile always playable
    const open = side === 'left' ? board.ends[0] : board.ends[1];
    return tile[0] === open || tile[1] === open;
  }

  /**
   * Resolves which end a tile may be played on. A client-supplied side is
   * honoured when legal; otherwise a legal side is auto-chosen (and null is
   * returned when the tile fits neither end).
   */
  private resolveSide(
    board: DominoBoard,
    tile: Tile,
    requested: unknown,
  ): 'left' | 'right' | null {
    if (!board.ends) return 'right';
    const want = requested === 'right' ? 'right' : requested === 'left' ? 'left' : null;
    const canLeft = this.canPlay(board, tile, 'left');
    const canRight = this.canPlay(board, tile, 'right');
    if (want === 'left') return canLeft ? 'left' : canRight ? 'right' : null;
    if (want === 'right') return canRight ? 'right' : canLeft ? 'left' : null;
    return canLeft ? 'left' : canRight ? 'right' : null;
  }

  private hasPlayable(board: DominoBoard, hand: Tile[]): boolean {
    return this.playableTiles(board, hand).length > 0;
  }

  private playableTiles(board: DominoBoard, hand: Tile[]): Tile[] {
    if (!board.ends) return [...hand];
    const [l, r] = board.ends;
    return hand.filter(([a, b]) => a === l || b === l || a === r || b === r);
  }

  private placeTile(board: DominoBoard, tile: Tile, side: 'left' | 'right'): void {
    if (!board.ends) {
      board.chain.push({ tile: [tile[0], tile[1]], openEnds: [tile[0], tile[1]] });
      board.ends = [tile[0], tile[1]];
      return;
    }
    const open = side === 'left' ? board.ends[0] : board.ends[1];
    // The pip that touches the existing line must equal `open`; the other pip
    // becomes the new outer end. On the left the tile is reversed relative to
    // the chain order, so the outer pip sits at index 0.
    const matchesFirst = tile[0] === open;
    const matchesSecond = tile[1] === open;
    const newOuter = matchesFirst ? tile[1] : tile[0];
    void matchesSecond; // validation already guaranteed one pip matches.
    let oriented: Tile;
    if (side === 'left') {
      // New outer end is on the LEFT; the matching pip faces the chain.
      oriented = [open, newOuter];
      board.chain.unshift({ tile: [newOuter, open], openEnds: [newOuter, open] });
      board.ends = [newOuter, board.ends[1]];
    } else {
      // New outer end is on the RIGHT.
      oriented = [open, newOuter];
      board.chain.push({ tile: oriented, openEnds: [open, newOuter] });
      board.ends = [board.ends[0], newOuter];
    }
  }

  private preferredSide(board: DominoBoard, tile: Tile): 'left' | 'right' {
    if (!board.ends) return 'right';
    const [l, r] = board.ends;
    const canLeft = tile[0] === l || tile[1] === l;
    const canRight = tile[0] === r || tile[1] === r;
    if (canLeft && !canRight) return 'left';
    if (canRight && !canLeft) return 'right';
    // Both ends match: play toward the end that balances pip values.
    return Math.random() < 0.5 ? 'left' : 'right';
  }

  private bestTile(board: DominoBoard, playable: Tile[], difficulty: SeatInfo['botDifficulty']): Tile {
    if (difficulty === 'easy' || difficulty === 'medium') {
      // Prefer doubles and higher pip counts (aggressive but simple).
      return [...playable].sort((x, y) => this.tileValue(y) - this.tileValue(x))[0];
    }
    // Hard/expert: dump the highest pips to empty the hand fast, keep doubles
    // unless they open scoring; on the opening, lead the highest double.
    if (!board.ends) {
      const doubles = playable.filter(([a, b]) => a === b).sort((x, y) => this.tileValue(y) - this.tileValue(x));
      return doubles[0] ?? [...playable].sort((x, y) => this.tileValue(y) - this.tileValue(x))[0];
    }
    return [...playable].sort((x, y) => this.tileValue(y) - this.tileValue(x))[0];
  }

  private tileValue([a, b]: Tile): number {
    return a + b + (a === b ? 0.5 : 0);
  }

  private think(difficulty: SeatInfo['botDifficulty']): number {
    const base = difficulty === 'easy' ? 2600 : difficulty === 'medium' ? 2000 : difficulty === 'hard' ? 1400 : 900;
    const jitter = Math.floor(Math.random() * 1800);
    return base + jitter;
  }

  private allStuck(board: DominoBoard): boolean {
    return board.hands.every((hand) => this.playableTiles(board, hand).length === 0);
  }

  private lowestPipsSeat(board: DominoBoard): number {
    let winner = 0;
    let lowest = Infinity;
    board.hands.forEach((hand, seat) => {
      const pips = hand.reduce((sum, [a, b]) => sum + a + b, 0);
      if (pips < lowest) {
        lowest = pips;
        winner = seat;
      }
    });
    return winner;
  }

  private handPips(hand: Tile[]): number {
    return hand.reduce((sum, [a, b]) => sum + a + b, 0);
  }

  private finish(state: GameState, winnerSeat: number, reason: 'empty_hand' | 'blocked'): void {
    const board = state.board as DominoBoard;
    state.phase = 'completed';
    state.winnerSeat = winnerSeat;
    // The winner banks the pips still held by every opponent.
    const opponentPips = board.hands
      .filter((_, i) => i !== winnerSeat)
      .reduce((sum, h) => sum + this.handPips(h), 0);
    board.hands.forEach((_, seat) => {
      const value = seat === winnerSeat ? opponentPips : 0;
      state.scores[seat] = value;
      state.seats[seat].score = value;
    });
    state.turnStartedAt = null;
    state.version += 1;
  }

  private advanceTurn(state: GameState): void {
    const seatCount = state.seats.length;
    state.currentSeat = (state.currentSeat + 1) % seatCount;
    state.turn += 1;
    state.turnStartedAt = new Date().toISOString();
  }

  private clone(state: GameState): GameState {
    const board = state.board as DominoBoard;
    const boneyardTiles = (board as Record<string, unknown>)._boneyardTiles as Tile[];
    const clonedBoard: DominoBoard = {
      chain: board.chain.map((c) => ({ tile: [...c.tile] as Tile, openEnds: [...c.openEnds] as [number, number] })),
      ends: board.ends ? ([...board.ends] as [number, number]) : null,
      boneyard: board.boneyard,
      hands: board.hands.map((h) => h.map((t) => [...t] as Tile)),
      mustDraw: [...board.mustDraw],
      passes: [...board.passes],
    };
    (clonedBoard as Record<string, unknown>)._boneyardTiles = boneyardTiles.map((t) => [...t] as Tile);
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: clonedBoard,
    };
  }
}
