import { useMemo } from 'react';
import type { ShopSkin, SkinKind } from '../core/types';
import { useProfile } from './store';

export interface SkinHandle {
  skin: ShopSkin;
  /** resolved id (equipped or default) — stable key for textures/materials */
  key: string;
}

/**
 * Resolve the equipped (or default) skin of one kind for a game.
 * `skins` is the game's full skin list (avoids circular imports with the registry).
 */
export function useSkin(skins: ShopSkin[], kind: SkinKind): SkinHandle {
  const equipped = useProfile((s) => s.equipped);
  return useMemo(() => {
    const ofKind = skins.filter((s) => s.kind === kind);
    const def = ofKind.find((s) => s.price === 0) ?? ofKind[0];
    const gameId = (ofKind[0] ?? def)?.gameId ?? '';
    const wanted = equipped[gameId]?.[kind];
    const active = ofKind.find((s) => s.id === wanted) ?? def;
    return { skin: active, key: active?.id ?? `${gameId}-${kind}` };
  }, [skins, kind, equipped]);
}
