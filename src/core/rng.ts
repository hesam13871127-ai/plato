/**
 * Seeded, deterministic RNG (mulberry32) — every engine receives an RNG so that
 * games are fully reproducible in tests and replays.
 */
export interface RNG {
  next(): number;
  int(maxExclusive: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
}

export function makeRng(seed: number): RNG {
  let s = (seed >>> 0) || 0x9e3779b9;
  const next = (): number => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (maxExclusive: number): number => Math.floor(next() * maxExclusive),
    pick: <T,>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error('RNG.pick on empty array');
      return items[Math.floor(next() * items.length)] as T;
    },
    shuffle: <T,>(items: readonly T[]): T[] => {
      const a = [...items];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = a[i] as T;
        a[i] = a[j] as T;
        a[j] = tmp;
      }
      return a;
    },
  };
}
