import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

/** A domino tile from a double-six set, normalised so `a <= b`. */
interface DominoTile {
  a: number;
  b: number;
}

/** One tile placed on the chain, oriented left→right. */
interface ChainLink {
  tile: [number, number];
  double: boolean;
}

/**
 * Internal (authoritative) board. `boneyard` and `hands` are server-only and
 * are redacted per-view in {@link DominoesEngine.redactHidden}.
 */
interface DominoesBoard extends Record<string, unknown> {
  /** Placed tiles in order, leftmost first. Empty until the lead move. */
  chain: ChainLink[];
  /** Open values at both ends of the chain, or null while the chain is empty. */
  ends: { left: number; right: number } | null;
  /** Undrawn tiles (server-only). */
  boneyard: DominoTile[];
  /** One hand per seat (server-only). */
  hands: DominoTile[][];
  /** Consecutive passes; a full lap of passes blocks the game. */
  passes: number;
  /** Seat that led the first tile (holder of the highest double / highest tile). */
  leadSeat: number;
}

/** Client-safe projection of the board for a specific viewer. */
interface DominoesView extends Record<string, unknown> {
  chain: ChainLink[];
  ends: [number, number] | null;
  boneyard: number;
  handSizes: number[];
  hand: Array<[number, number]> | null;
}

const PIPS = 6;
const HAND_SIZES: Record<number, number> = { 2: 7, 3: 5, 4: 5 };

/**
 * Classic Draw Dominoes for 2–4 players, wave-1 rebuild.
 *
 * Rules (documented in the in-app tutorial too):
 * - Double-six set (28 tiles). 2 players draw 7 tiles; 3–4 players draw 5.
 * - The holder of the highest double leads (highest tile if no doubles) and
 *   may open with any tile.
 * - A tile is playable when one of its values matches an open end. If both
 *   ends match with different values the player picks the end explicitly.
 * - A player with no playable tile must draw from the boneyard until they can
 *   play; when the boneyard is empty they pass instead.
 * - Emptying your hand wins immediately; a blocked table (everyone passes in
 *   succession) is won by the lightest hand. In both cases the winner's score
 *   is the total number of pips left in every other hand.
 *
 * Hidden information: each seat sees only its own hand plus everyone's hand
 * sizes; spectators see no hands at all.
 */
@Injectable()
export class DominoesEngine extends BaseGameEngine {
  readonly slug = 'dominoes';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const seatCount = config.seats.length;
    const handSize = HAND_SIZES[seatCount] ?? 5;

    const stock = this.fullSet();
    this.shuffle(stock);
    const hands: DominoTile[][] = Array.from({ length: seatCount }, () => []);
    for (let i = 0; i < handSize * seatCount; i++) {
      hands[i % seatCount].push(stock.shift() as DominoTile);
    }

    const board: DominoesBoard = {
      chain: [],
      ends: null,
      boneyard: stock,
      hands,
      passes: 0,
      leadSeat: this.leaderSeat(hands),
    };

    return {
      phase: 'in_progress',
      turn: 0,
      currentSeat: board.leadSeat,
      turnStartedAt: new Date().toISOString(),
      seats: config.seats.map((s, i) => ({
        seatNumber: i,
        playerId: s.playerId,
        displayName: s.displayName,
        avatarUrl: s.avatarUrl,
        connected: true,
        score: 0,
      })),
      board: board as unknown as Record<string, unknown>,
      winnerSeat: null,
      scores: config.seats.map(() => 0),
      version: 1,
    };
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'The game is already over.' };
    if (action.seat !== state.currentSeat) return { ok: false, error: 'It is not your turn.' };
    const board = state.board as unknown as DominoesBoard;
    const hand = board.hands[action.seat] ?? [];

    if (action.type === 'play_tile') {
      const tile = this.parseTile(action.payload.tile);
      if (!tile) return { ok: false, error: 'Choose a valid tile from your hand.' };
      const owned = hand.some((t) => t.a === tile.a && t.b === tile.b);
      if (!owned) return { ok: false, error: 'That tile is not in your hand.' };
      if (!board.ends) return { ok: true }; // leading tile — anything goes
      const fitsLeft = tile.a === board.ends.left || tile.b === board.ends.left;
      const fitsRight = tile.a === board.ends.right || tile.b === board.ends.right;
      if (!fitsLeft && !fitsRight) {
        return { ok: false, error: 'That tile does not match either open end.' };
      }
      const end = action.payload.end;
      if (end !== undefined && end !== 'l' && end !== 'r') {
        return { ok: false, error: 'Choose the left or right end.' };
      }
      if (end === 'l' && !fitsLeft) return { ok: false, error: 'That tile does not match the left end.' };
      if (end === 'r' && !fitsRight) return { ok: false, error: 'That tile does not match the right end.' };
      // Both ends playable with different values → the player must pick one.
      if (fitsLeft && fitsRight && board.ends.left !== board.ends.right && end === undefined) {
        return { ok: false, error: 'That tile fits both ends — choose left or right.' };
      }
      return { ok: true };
    }

    if (action.type === 'draw') {
      if (this.playableTiles(hand, board.ends).length > 0) {
        return { ok: false, error: 'You still have a playable tile.' };
      }
      if (board.boneyard.length === 0) return { ok: false, error: 'The boneyard is empty.' };
      return { ok: true };
    }

    if (action.type === 'pass') {
      if (this.playableTiles(hand, board.ends).length > 0) {
        return { ok: false, error: 'You have a playable tile — the table expects it.' };
      }
      if (board.boneyard.length > 0) {
        return { ok: false, error: 'You must draw from the boneyard first.' };
      }
      return { ok: true };
    }

    return { ok: false, error: 'Unknown action.' };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    const next = this.clone(state);
    const board = next.board as unknown as DominoesBoard;

    if (action.type === 'play_tile') {
      const tile = this.parseTile(action.payload.tile) as DominoTile;
      const hand = board.hands[action.seat];
      const index = hand.findIndex((t) => t.a === tile.a && t.b === tile.b);
      hand.splice(index, 1);
      this.place(board, tile, action.payload.end);
      board.passes = 0;
      next.version += 1;

      if (hand.length === 0) {
        this.finish(next, board, action.seat);
        return next;
      }
      this.advance(next);
      return next;
    }

    if (action.type === 'draw') {
      const drawIndex = Math.floor(Math.random() * board.boneyard.length);
      const [drawn] = board.boneyard.splice(drawIndex, 1);
      board.hands[action.seat].push(drawn);
      next.version += 1;
      // The turn stays with the drawer: they may now play the new tile or,
      // if it does not fit either, draw again.
      next.turnStartedAt = new Date().toISOString();
      return next;
    }

    // pass
    board.passes += 1;
    next.version += 1;
    if (board.passes >= next.seats.length) {
      // Blocked table — lightest hand wins (earliest seat breaks ties).
      const pips = board.hands.map((hand) => hand.reduce((sum, t) => sum + t.a + t.b, 0));
      let winner = 0;
      for (let i = 1; i < pips.length; i++) if (pips[i] < pips[winner]) winner = i;
      this.finish(next, board, winner);
      return next;
    }
    this.advance(next);
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as DominoesBoard;
    const hand = board.hands[seat] ?? [];
    const playable = this.playableTiles(hand, board.ends);

    if (playable.length === 0) {
      const action: GameAction =
        board.boneyard.length > 0
          ? { seat, type: 'draw', payload: {} }
          : { seat, type: 'pass', payload: {} };
      return { action, delayMs: this.think(difficulty) };
    }

    let tile: DominoTile;
    let end: 'l' | 'r' | undefined;
    if (difficulty === 'easy') {
      tile = playable[Math.floor(Math.random() * playable.length)];
    } else {
      // Shed the heaviest tiles first; prefer doubles early; among equals keep
      // the hand flexible by shedding our rarest suit.
      const suitCount = (value: number) => hand.filter((t) => t.a === value || t.b === value).length;
      tile = playable.reduce((best, t) => {
        const score =
          2 * (t.a + t.b) + (t.a === t.b ? 3 : 0) - Math.min(suitCount(t.a), t.a === t.b ? 99 : suitCount(t.b));
        const bestScore =
          2 * (best.a + best.b) + (best.a === best.b ? 3 : 0) - Math.min(suitCount(best.a), best.a === best.b ? 99 : suitCount(best.b));
        return score > bestScore ? t : best;
      });
    }
    if (board.ends) {
      const fitsLeft = tile.a === board.ends.left || tile.b === board.ends.left;
      const fitsRight = tile.a === board.ends.right || tile.b === board.ends.right;
      if (fitsLeft && fitsRight && board.ends.left !== board.ends.right) {
        // Keep both ends alive with different values when possible.
        end = Math.random() < 0.5 ? 'l' : 'r';
      }
    }
    return {
      action: { seat, type: 'play_tile', payload: { tile: [tile.a, tile.b], ...(end ? { end } : {}) } },
      delayMs: this.think(difficulty),
    };
  }

  protected redactHidden(state: GameState, seat: number): GameState {
    const board = state.board as unknown as DominoesBoard;
    const view: DominoesView = {
      chain: board.chain,
      ends: board.ends ? [board.ends.left, board.ends.right] : null,
      boneyard: board.boneyard.length,
      handSizes: board.hands.map((hand) => hand.length),
      hand: seat >= 0 ? board.hands[seat].map((t) => [t.a, t.b] as [number, number]) : null,
    };
    return { ...state, board: view as unknown as Record<string, unknown> };
  }

  // ── rules helpers ────────────────────────────────────────────────────────

  /** Full double-six set, `a <= b` per tile. */
  private fullSet(): DominoTile[] {
    const tiles: DominoTile[] = [];
    for (let a = 0; a <= PIPS; a++) {
      for (let b = a; b <= PIPS; b++) tiles.push({ a, b });
    }
    return tiles;
  }

  private shuffle(tiles: DominoTile[]): void {
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }
  }

  /** Seat holding the highest double, else the highest tile. */
  private leaderSeat(hands: DominoTile[][]): number {
    let leadSeat = 0;
    let best: { key: number } | null = null;
    hands.forEach((hand, seat) => {
      for (const tile of hand) {
        const double = tile.a === tile.b;
        const key = double ? 1000 + tile.a : tile.a + tile.b;
        if (!best || key > best.key) {
          best = { key };
          leadSeat = seat;
        }
      }
    });
    return leadSeat;
  }

  private playableTiles(hand: DominoTile[], ends: DominoesBoard['ends']): DominoTile[] {
    if (!ends) return [...hand];
    return hand.filter((t) =>
      t.a === ends.left || t.b === ends.left || t.a === ends.right || t.b === ends.right,
    );
  }

  /** Puts a tile on the chosen end of the chain, oriented left→right. */
  private place(board: DominoesBoard, tile: DominoTile, end: unknown): void {
    const link: ChainLink = { tile: [tile.a, tile.b], double: tile.a === tile.b };
    if (board.chain.length === 0) {
      board.chain = [link];
      board.ends = { left: tile.a, right: tile.b };
      return;
    }
    const ends = board.ends as { left: number; right: number };
    if (end === 'l' || (end !== 'r' && (tile.a === ends.left || tile.b === ends.left) && tile.a !== ends.right && tile.b !== ends.right)) {
      // Prepend, oriented so the matching value faces the old left end.
      const outer = tile.a === ends.left ? tile.b : tile.a;
      board.chain.unshift({ tile: [outer, ends.left], double: tile.a === tile.b });
      board.ends = { left: outer, right: ends.right };
    } else {
      // Append, oriented so the matching value faces the old right end.
      const outer = tile.a === ends.right ? tile.b : tile.a;
      board.chain.push({ tile: [ends.right, outer], double: tile.a === tile.b });
      board.ends = { left: ends.left, right: outer };
    }
  }

  private advance(state: GameState): void {
    state.currentSeat = (state.currentSeat + 1) % state.seats.length;
    state.turn += 1;
    state.turnStartedAt = new Date().toISOString();
  }

  /** Completes the game: winner takes the pips left in every other hand. */
  private finish(state: GameState, board: DominoesBoard, winnerSeat: number): void {
    const pips = board.hands.map((hand) => hand.reduce((sum, t) => sum + t.a + t.b, 0));
    state.phase = 'completed';
    state.winnerSeat = winnerSeat;
    state.currentSeat = -1;
    state.scores = pips.map((_, i) => (i === winnerSeat ? pips.reduce((sum, p, j) => (j === i ? sum : sum + p), 0) : 0));
    state.seats = state.seats.map((s, i) => ({ ...s, score: state.scores[i] }));
  }

  private parseTile(raw: unknown): DominoTile | null {
    if (!Array.isArray(raw) || raw.length !== 2) return null;
    const x = Number(raw[0]);
    const y = Number(raw[1]);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > PIPS || y < 0 || y > PIPS) return null;
    return { a: Math.min(x, y), b: Math.max(x, y) };
  }

  private think(difficulty: SeatInfo['botDifficulty']): number {
    const base = difficulty === 'easy' ? 1700 : difficulty === 'medium' ? 1300 : difficulty === 'hard' ? 900 : 600;
    return base + Math.floor(Math.random() * 1100);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as DominoesBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        chain: board.chain.map((link) => ({ tile: [...link.tile] as [number, number], double: link.double })),
        ends: board.ends ? { ...board.ends } : null,
        boneyard: board.boneyard.map((t) => ({ ...t })),
        hands: board.hands.map((hand) => hand.map((t) => ({ ...t }))),
        passes: board.passes,
        leadSeat: board.leadSeat,
      } as unknown as Record<string, unknown>,
    };
  }
}
