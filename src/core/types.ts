import type { ComponentType } from 'react';
import type { RNG } from './rng';

export type { RNG };

export type BotDifficulty = 'easy' | 'medium' | 'hard';
export type Localized = { en: string; fa: string };

/** One seat around the table. */
export interface PlayerSlot {
  /** seat index, 0-based (seat 0 is the local player by convention) */
  id: number;
  kind: 'human' | 'bot';
  name: string;
  difficulty?: BotDifficulty;
}

export interface GameConfig {
  slots: PlayerSlot[];
  seed: number;
}

/**
 * Pure, serializable game rules engine. All functions must be side-effect free
 * (randomness flows through the injected RNG) and `applyAction` returns a new
 * state object (immutability keeps React rendering + replays correct).
 */
export interface GameEngine<S, A> {
  createInitialState(config: GameConfig, rng: RNG): S;
  /** Cheap validity check — the same gate the UI and bots go through. */
  validate(state: S, action: A, playerId: number): boolean;
  /** Returns a NEW state. Illegal actions must never be applied. */
  applyAction(state: S, action: A, playerId: number, rng: RNG): S;
  /** All legal actions for `playerId` right now (drives UI hints + bots). */
  legalActions(state: S, playerId: number): A[];
  /** Pick a move for a bot seat (null only when no action exists). */
  chooseBotMove(state: S, playerId: number, rng: RNG, difficulty: BotDifficulty): A | null;
  /** Seat ids whose action is expected (usually one; supports simultaneous play later). */
  currentPlayers(state: S): number[];
  isGameOver(state: S): boolean;
  /** Ordered winner seat ids. Empty array = draw / no winner yet. */
  winners(state: S): number[];
}

export interface TutorialStep {
  title: string;
  body: string;
}

export type SkinKind = 'pieces' | 'board' | 'table' | 'cards' | 'dice';

/** A cosmetic item in the shop: a skin for pieces / board / table felt / cards. */
export interface ShopSkin {
  id: string;
  gameId: string;
  kind: SkinKind;
  name: Localized;
  /** 0 = default, always owned */
  price: number;
  colors: Record<string, string>;
  finish?: 'matte' | 'metal' | 'gem' | 'glow';
  Preview: ComponentType;
}

export interface GameMeta {
  id: string;
  names: Localized;
  tagline: Localized;
  minPlayers: number;
  maxPlayers: number;
  /** CSS accent color used across hub + in-game chrome */
  accent: string;
  /** Small animated 3D scene used as the game logo */
  Logo: ComponentType;
  /** Full game screen (owns the runtime, HUD and 3D board) */
  Play: ComponentType<{ config: GameConfig; onExit: () => void }>;
  tutorial: { en: TutorialStep[]; fa: TutorialStep[] };
  skins: ShopSkin[];
}
