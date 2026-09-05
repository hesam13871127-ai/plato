/**
 * Competitive ladder rules — the single source of truth shared by matchmaking,
 * settlement (Elo), seasons and the leaderboard API.
 *
 * Design:
 *  - A modified Elo with a per-game rating FLOOR and CEILING (rating cap).
 *  - Three public rank tiers — Bronze, Silver, Gold — mapped to rating bands.
 *  - "High-score protection": a player's loss is softened once they have proved
 *    themselves at a tier, and their rating can never drop below the floor of
 *    the highest tier they reached this season (tracked as `peakRating`).
 */

export const DEFAULT_RATING = 1000;

/** Hard rating cap — no rating can ever climb above this. */
export const RATING_CAP = 2400;

/** Absolute floor (unrated / provisional players cannot fall beneath it). */
export const RATING_FLOOR = 0;

/** Base Elo K-factor; scaled down for high ratings (modified Elo). */
export const BASE_K_FACTOR = 32;

/** Placement/provisional matches count for a (season, game) ranking. */
export const PLACEMENT_MATCHES = 5;

/** During placement, rating swings are larger so players converge quickly. */
export const PLACEMENT_K_MULTIPLIER = 1.5;

export type RankTier = 'bronze' | 'silver' | 'gold';

export interface RankBand {
  tier: RankTier;
  label: string;
  /** Inclusive rating at which this tier starts. */
  minRating: number;
  /** Floor the rating is protected to once this tier has been reached. */
  protectedFloor: number;
  /** Accent colour used by clients (brand palette). */
  color: string;
  /** Season-end reward set for this tier. */
  seasonReward: {
    coins: number;
    pips: number;
    xp: number;
    title: string;
    badgeCode: string;
  };
}

/**
 * Ordered tiers. Bronze is the entry tier; Gold is the elite band. Thresholds
 * are tuned so a fresh player starts comfortably in Bronze, ~Silver needs
 * consistent positive results, and Gold is the top decile.
 */
export const RANK_BANDS: RankBand[] = [
  {
    tier: 'bronze',
    label: 'Bronze',
    minRating: RATING_FLOOR,
    protectedFloor: 0,
    color: '#B07B4F',
    seasonReward: { coins: 200, pips: 0, xp: 200, title: 'Bronze Competitor', badgeCode: 'season_bronze' },
  },
  {
    tier: 'silver',
    label: 'Silver',
    minRating: 1200,
    protectedFloor: 1200,
    color: '#9FB2C9',
    seasonReward: { coins: 600, pips: 25, xp: 600, title: 'Silver Contender', badgeCode: 'season_silver' },
  },
  {
    tier: 'gold',
    label: 'Gold',
    minRating: 1500,
    protectedFloor: 1500,
    color: '#F2C14E',
    seasonReward: { coins: 1500, pips: 100, xp: 1500, title: 'Gold Champion', badgeCode: 'season_gold' },
  },
];

/** Per-game placement/tier thresholds may be tuned per title in the catalogue. */
export const TIER_ORDER: Record<RankTier, number> = { bronze: 0, silver: 1, gold: 2 };

/** Returns the rank band for a rating. */
export function tierForRating(rating: number): RankBand {
  let band = RANK_BANDS[0];
  for (const candidate of RANK_BANDS) {
    if (rating >= candidate.minRating) band = candidate;
  }
  return band;
}

/**
 * The floor a player's rating may not fall below, given their best rating this
 * season. Once a player has reached Silver they cannot be demoted back into
 * Bronze by losses (high-score protection); reaching Gold protects the Gold
 * floor. This keeps the ladder rewarding and prevents rating collapse.
 */
export function protectionFloorForPeak(peakRating: number): number {
  const peakBand = tierForRating(peakRating);
  return peakBand.protectedFloor;
}

/** Modified Elo K-factor: stronger players have smaller swings; placements larger. */
export function kFactorFor(rating: number, matchesPlayed: number): number {
  let k = BASE_K_FACTOR;
  if (rating >= 2000) k = 16;
  else if (rating >= 1600) k = 24;
  if (matchesPlayed < PLACEMENT_MATCHES) k *= PLACEMENT_K_MULTIPLIER;
  return k;
}

export interface EloSide {
  rating: number;
  /** 1 = win, 0.5 = draw, 0 = loss. */
  score: number;
}

/**
 * Expected score for a player against a single opponent (standard Elo curve).
 */
export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - rating) / 400));
}

/**
 * Computes the raw signed Elo delta for `player` averaged over `opponents`.
 * Multiplayer games average expected/actual across all opponents so a 4-seat
 * win is worth more than a 2-seat win, proportionally.
 */
export function eloDelta(
  player: EloSide,
  opponents: EloSide[],
  options: { kFactor: number; isPlacement: boolean },
): number {
  if (opponents.length === 0) return 0;
  let expected = 0;
  for (const opp of opponents) expected += expectedScore(player.rating, opp.rating);
  expected /= opponents.length;
  const actual = player.score;
  const delta = options.kFactor * (actual - expected);
  return Math.round(delta);
}

/**
 * Applies a signed delta to a current rating under the cap/floor rules.
 *  - Gains are hard-capped at {@link RATING_CAP} (rating cap).
 *  - Losses are floored at the high-score protection floor derived from the
 *    player's peak rating (they cannot fall beneath a tier they have earned).
 *  - Losses inside a provisional player's very first matches are softened
 *    (never below DEFAULT_RATING) to avoid punishing new players harshly.
 *
 * Returns the new rating AND the updated peak (monotonic).
 */
export function applyEloDelta(params: {
  currentRating: number;
  peakRating: number;
  delta: number;
  matchesPlayed: number;
}): { rating: number; peakRating: number } {
  const { currentRating, peakRating, delta, matchesPlayed } = params;
  let next: number;
  if (delta >= 0) {
    next = Math.min(RATING_CAP, currentRating + delta);
  } else {
    const protectionFloor = protectionFloorForPeak(peakRating);
    // Provisional players are protected to the start rating during placement.
    const floor = matchesPlayed < PLACEMENT_MATCHES
      ? Math.max(protectionFloor, DEFAULT_RATING)
      : protectionFloor;
    next = Math.max(floor, currentRating + delta);
  }
  const newPeak = Math.max(peakRating, next);
  return { rating: next, peakRating: newPeak };
}

/**
 * Extra game-specific season reward for the top performer(s) of a single game
 * within a season, paid out at season rollover (game-specific seasonal
 * rewards). Distinct from the tier-based reward everyone receives.
 */
export interface GameSeasonReward {
  rank: number; // 1-based leaderboard position
  coins: number;
  pips: number;
  xp: number;
  badgeCode: string;
}

export function gameSeasonRewardForRank(rank: number): GameSeasonReward | null {
  if (rank === 1) return { rank: 1, coins: 2000, pips: 150, xp: 2000, badgeCode: 'game_master_1' };
  if (rank <= 3) return { rank, coins: 900, pips: 60, xp: 900, badgeCode: 'game_top3' };
  if (rank <= 10) return { rank, coins: 400, pips: 20, xp: 400, badgeCode: 'game_top10' };
  return null;
}
