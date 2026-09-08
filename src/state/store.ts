import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SkinKind } from '../core/types';

export type Lang = 'fa' | 'en';

interface ProfileState {
  lang: Lang;
  coins: number;
  /** owned skin ids (price-0 defaults are implicitly owned) */
  owned: string[];
  /** equipped skin id per game per kind */
  equipped: Record<string, Partial<Record<SkinKind, string>>>;
  wins: number;
  gamesPlayed: number;
  name: string;
  setLang: (lang: Lang) => void;
  setName: (name: string) => void;
  buy: (skinId: string, price: number, gameId: string, kind: SkinKind) => boolean;
  equip: (skinId: string, gameId: string, kind: SkinKind) => void;
  addCoins: (n: number) => void;
  recordResult: (won: boolean, reward: number) => void;
}

export const useProfile = create<ProfileState>()(
  persist(
    (set, get) => ({
      lang: 'fa',
      coins: 400,
      owned: [],
      equipped: {},
      wins: 0,
      gamesPlayed: 0,
      name: '',
      setLang: (lang) => set({ lang }),
      setName: (name) => set({ name }),
      buy: (skinId, price, gameId, kind) => {
        const s = get();
        if (s.owned.includes(skinId)) return true;
        if (s.coins < price) return false;
        set({
          coins: s.coins - price,
          owned: [...s.owned, skinId],
          equipped: { ...s.equipped, [gameId]: { ...(s.equipped[gameId] ?? {}), [kind]: skinId } },
        });
        return true;
      },
      equip: (skinId, gameId, kind) =>
        set((s) => ({
          equipped: { ...s.equipped, [gameId]: { ...(s.equipped[gameId] ?? {}), [kind]: skinId } },
        })),
      addCoins: (n) => set((s) => ({ coins: s.coins + n })),
      recordResult: (won, reward) =>
        set((s) => ({
          coins: s.coins + reward,
          wins: s.wins + (won ? 1 : 0),
          gamesPlayed: s.gamesPlayed + 1,
        })),
    }),
    { name: 'plato-profile', version: 1 },
  ),
);

/** Standard seat colors (Ludo boards override with their own palette). */
export const SEAT_COLORS = ['#8b5cf6', '#f59e0b', '#22d3ee', '#fb7185', '#a3e635', '#f472b6', '#38bdf8', '#fbbf24'];

/** Bot display names, localized when a game config is built. */
export const BOT_NAMES: Record<Lang, string[]> = {
  fa: ['آرش', 'رستم', 'سهراب', 'شیرین', 'کاوه', 'تهمینه', 'فرهاد', 'گودرز'],
  en: ['Arash', 'Rostam', 'Sohrab', 'Shirin', 'Kaveh', 'Tahmineh', 'Farhad', 'Goudarz'],
};

/** Coin reward for a win, scaled by the strongest bot at the table. */
export function winReward(slots: { kind: 'human' | 'bot'; difficulty?: string }[]): number {
  const table: Record<string, number> = { easy: 40, medium: 70, hard: 120 };
  let best = 0;
  for (const s of slots) if (s.kind === 'bot') best = Math.max(best, table[s.difficulty ?? 'medium'] ?? 70);
  return best > 0 ? best : 30; // all-human table still gets a token reward
}
