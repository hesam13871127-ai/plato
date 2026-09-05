import type {
  ActionResult,
  BotMove,
  GameAction,
  GameState,
  MatchConfig,
  SeatInfo,
} from './types';

/**
 * Abstract, extensible base for every playable table game.
 *
 * A concrete engine is a pure state machine: it builds initial state, validates
 * and applies actions, decides whose turn is next, detects the end condition
 * and scores the outcome. Turn-based games advance only on {@link applyAction};
 * live games may additionally emit time-driven actions via
 * {@link tick}, but both kinds share the same interface and are driven
 * identically by the session service.
 */
export abstract class BaseGameEngine {
  abstract readonly slug: string;
  abstract readonly minPlayers: number;
  abstract readonly maxPlayers: number;
  /** Live games run a wall-clock tick; turn-based games leave this false. */
  abstract readonly isLive: boolean;

  /** Builds the starting state for a match. */
  abstract createInitialState(config: MatchConfig): GameState;

  /**
   * Validates an action against the current state WITHOUT mutating it.
   * Returns an `ok:false` result with a human-readable reason on rejection.
   */
  abstract validate(state: GameState, action: GameAction): ActionResult;

  /**
   * Applies an action, returning the next state. Callers must have validated
   * first; engines may still defensively re-validate.
   */
  abstract applyAction(state: GameState, action: GameAction): GameState;

  /**
   * Optional live tick (default no-op). Lets time-based games advance state
   * (e.g. turn timers, automatic pass after a limit). Turn-based games ignore
   * it. Returning the same state means nothing changed.
   */
  tick(state: GameState, _now: Date): GameState {
    return state;
  }

  /**
   * Whether `seat` is permitted to submit `action` right now, independent of
   * the strict single-current-seat turn gate. Turn-based games keep the default
   * (only the active seat acts). Live/real-time games override this so that,
   * for example, every alive player may roll, vote, claim or guess during a
   * shared phase. The engine's {@link validate} remains the final authority on
   * legality; this only decides whose actions are routed to it.
   */
  canSeatAct(state: GameState, action: GameAction): boolean {
    return state.currentSeat === action.seat;
  }

  /**
   * Chooses a move for a bot seat. Concrete games implement game-specific AI;
   * the base provides a deterministic fallback that passes / acts trivially so
   * an engine never leaves a bot stuck.
   */
  abstract chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove;

  // ── Shared helpers ───────────────────────────────────────────────────────

  /** Client-safe projection of state for spectators (hidden info removed). */
  spectatorView(state: GameState): GameState {
    return this.redactHidden(state, -1);
  }

  /**
   * Client-safe projection for a specific seat (the seat sees its own hidden
   * info, e.g. its hand). Override to hide opponent-only data.
   */
  playerView(state: GameState, seat: number): GameState {
    return this.redactHidden(state, seat);
  }

  /**
   * Removes hidden/private board data for viewers other than `seat`.
   * Default returns the full state; games with hidden hands override this.
   */
  protected redactHidden(state: GameState, _seat: number): GameState {
    return state;
  }

  protected seatById(state: GameState, playerId: string): number {
    return state.seats.findIndex((s) => s.playerId === playerId);
  }
}
