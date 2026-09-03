/**
 * Leveling curve. Each level requires progressively more cumulative XP.
 * The cumulative threshold for level `n` uses a quadratic curve so early
 * levels come quickly and later levels are a long-term goal.
 */

/** Cumulative XP required to *reach* the given level (level 1 starts at 0). */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  // XP needed to advance from level (n-1) to n grows linearly; cumulative is quadratic.
  const n = level - 1;
  return 100 * n + 25 * n * (n - 1);
}

/** Returns the level for a given total XP. */
export function levelForXp(totalXp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= totalXp) {
    level += 1;
  }
  return level;
}

/**
 * Applies an XP delta to a profile's level/xp, returning the new values and
 * whether a level-up occurred.
 */
export function applyXp(currentLevel: number, currentXp: number, deltaXp: number): {
  level: number;
  xp: number;
  leveledUp: boolean;
} {
  const totalXp = Math.max(0, currentXp + deltaXp);
  const newLevel = levelForXp(totalXp);
  return { level: newLevel, xp: totalXp, leveledUp: newLevel > currentLevel };
}
