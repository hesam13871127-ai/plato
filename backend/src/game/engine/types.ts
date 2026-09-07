/**
 * Core game-engine contracts.
 *
 * The engine is deliberately storage-agnostic: a {@link GameEngine} produces
 * and consumes pure state objects. The session service owns persistence and
 * socket fan-out, so new games are added by implementing `GameEngine` only —
 * no matchmaking, lobby or gateway changes are required.
 */

/** Slug of a concrete game (must match `games.slug` in the catalogue). */
export type GameSlug = string;

/**
 * Purely cosmetic, publicly visible equipment a seat brings to the table:
 * the piece set its tokens/discs/checkers are drawn with, the board
 * ("playground") theme it plays on and the dice set it rolls. Every value is a
 * skin id from the shop catalogue metadata (e.g. `neon`, `gold_casino`).
 * Cosmetics never influence rules — they are rendering hints only.
 */
export interface SeatCosmetics {
  piece?: string;
  board?: string;
  dice?: string;
}

/** One seat at the table. A bot seat carries an AI profile. */
export interface SeatInfo {
  /** User id for a human, or the bot user id (kept server-side only). */
  playerId: string;
  seatNumber: number;
  /** Server-side only — NEVER serialised to clients. */
  isBot: boolean;
  /** Optional AI difficulty for bot seats (server-side only). */
  botDifficulty?: 'easy' | 'medium' | 'hard' | 'expert';
  displayName: string;
  avatarUrl: string | null;
  /** Equipped, public cosmetics (safe to broadcast). */
  cosmetics?: SeatCosmetics;
}

/** Immutable configuration handed to an engine when a match starts. */
export interface MatchConfig {
  matchId: string;
  gameSlug: GameSlug;
  seats: SeatInfo[];
  /** True while the game is live/real-time, false when purely async. */
  isLive: boolean;
  /** Free-form per-game settings (variant, points limit…). */
  settings?: Record<string, unknown>;
}

/**
 * The full serialisable state of a game. `publicView` is what non-seat
 * spectators see; engines may hide hidden information (e.g. opponent hands).
 */
export interface GameState {
  phase: 'setup' | 'in_progress' | 'completed' | 'abandoned';
  turn: number;
  /** Seat index expected to act next (-1 when no specific seat, e.g. setup). */
  currentSeat: number;
  /** Server wall-clock when the current turn started (for clock/turn limits). */
  turnStartedAt: string | null;
  seats: SeatPublic[];
  /** Game-specific board/payload (tile layout, board cells…). */
  board: Record<string, unknown>;
  winnerSeat: number | null;
  /** Team/co-op winners (e.g. Werewolf faction); when set, settlement honors every seat here. */
  winnerSeats?: number[] | null;
  /** Final per-seat scoring: index → score (higher is better unless inverted). */
  scores: number[];
  /** Monotonic event log index; clients delta-apply on reconnect. */
  version: number;
}

/** Client-safe seat descriptor (never contains isBot). */
export interface SeatPublic {
  seatNumber: number;
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  connected: boolean;
  score: number;
  /** Equipped cosmetics so every client renders each seat's chosen pieces. */
  cosmetics?: SeatCosmetics;
}

/** A move/action submitted by a seat (or chosen by a bot). */
export interface GameAction {
  seat: number;
  /** Game-specific action kind, e.g. 'play_tile', 'roll_dice'. */
  type: string;
  payload: Record<string, unknown>;
}

/** Result of validating/applying an action. */
export interface ActionResult {
  ok: boolean;
  error?: string;
  /** Optional game-specific event appended to the log and broadcast. */
  event?: Record<string, unknown>;
}

/** Decision returned by a bot's brain: the action to perform. */
export interface BotMove {
  action: GameAction;
  /** Milliseconds the bot "thinks" before acting (human pacing). */
  delayMs: number;
}
