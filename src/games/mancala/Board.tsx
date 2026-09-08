import { useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import type { ShopSkin } from '../../core/types';
import { useMeshClick } from '../../ui/three/shared';
import { STORE_P0, STORE_P1, type MancalaState } from './engine';

/* ------------------------------------------------------------------ */

const PIT_POS: [number, number][] = (() => {
  // p0 pits 0..5 right→left on the near side; p1 pits 7..12 left→right on the far side
  const out: [number, number][] = [];
  for (let i = 0; i < 6; i++) out.push([2.6 - i * 1.05, 1.15]);
  out.push([-4.35, 0]); // p0 store
  for (let i = 0; i < 6; i++) out.push([-2.6 + i * 1.05, -1.15]);
  out.push([4.35, 0]); // p1 store
  return out;
})();

export function pitWorldPos(pit: number): [number, number, number] {
  const [x, z] = PIT_POS[pit] ?? [0, 0];
  return [x, 0, z];
}

const SEAT_COLORS = ['#8b5cf6', '#f59e0b'];

/** arrange n seeds inside a pit */
function seedSpots(n: number, r = 0.42): [number, number][] {
  const spots: [number, number][] = [];
  if (n === 0) return spots;
  spots.push([0, 0]);
  let ring = 1;
  while (spots.length < n) {
    const count = Math.min(n - spots.length, ring * 6);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + ring * 0.5;
      spots.push([Math.cos(a) * r * (ring / 2), Math.sin(a) * r * (ring / 2)]);
    }
    ring++;
  }
  return spots;
}

/* ------------------------------------------------------------------ */

export function MancalaBoard({
  state,
  boardSkin,
  pickable,
  onPit,
}: {
  state: MancalaState;
  boardSkin: ShopSkin;
  pickable: number[];
  onPit: (pit: number) => void;
}) {
  const wood = boardSkin.colors.wood ?? '#a8713f';
  const woodDark = boardSkin.colors.woodDark ?? '#7a4c25';
  const seedA = boardSkin.colors.seedA ?? '#4a3524';
  const seedB = boardSkin.colors.seedB ?? '#d9c9a8';

  return (
    <group>
      <RoundedBox args={[11.4, 0.85, 4.6]} radius={0.35} smoothness={4} position={[0, -0.42, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={woodDark} roughness={0.6} />
      </RoundedBox>
      <RoundedBox args={[10.9, 0.55, 4.1]} radius={0.28} smoothness={4} position={[0, -0.18, 0]} receiveShadow>
        <meshStandardMaterial color={wood} roughness={0.75} />
      </RoundedBox>

      {state.pits.map((count, pit) => {
        const isStore = pit === STORE_P0 || pit === STORE_P1;
        const storeR = 1.05;
        const pitR = 0.62;
        const r = isStore ? storeR : pitR;
        const pos = pitWorldPos(pit);
        const canPick = pickable.includes(pit);
        const owner = pit <= 5 || pit === STORE_P0 ? 0 : 1;
        return (
          <Pit
            key={pit}
            pit={pit}
            count={count}
            position={pos}
            radius={r}
            isStore={isStore}
            canPick={canPick}
            accent={SEAT_COLORS[owner]!}
            seedColors={[seedA, seedB]}
            onPick={() => onPit(pit)}
          />
        );
      })}
    </group>
  );
}

function Pit({
  pit,
  count,
  position,
  radius,
  isStore,
  canPick,
  accent,
  seedColors,
  onPick,
}: {
  pit: number;
  count: number;
  position: [number, number, number];
  radius: number;
  isStore: boolean;
  canPick: boolean;
  accent: string;
  seedColors: [string, string];
  onPick: () => void;
}) {
  const spots = useMemo(() => seedSpots(count, radius * 0.75), [count, radius]);
  const click = useMeshClick(
    canPick
      ? (_e: ThreeEvent<MouseEvent>) => {
          onPick();
        }
      : undefined,
  );
  return (
    <group position={position}>
      {/* bowl */}
      <mesh position={[0, -0.05, 0]}>
        <cylinderGeometry args={[radius, radius * 0.82, 0.4, 26]} />
        <meshStandardMaterial color="#3a2712" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.06, 0]}>
        <torusGeometry args={[radius, 0.07, 10, 30]} />
        <meshStandardMaterial color={accent} roughness={0.5} metalness={0.25} emissive={accent} emissiveIntensity={canPick ? 0.55 : 0.18} />
      </mesh>
      {canPick && (
        <mesh {...click} position={[0, 0.32, 0]}>
          <cylinderGeometry args={[radius, radius, 0.6, 20]} />
          <meshStandardMaterial color="#3ddc97" transparent opacity={0.16} emissive="#3ddc97" emissiveIntensity={0.25} />
        </mesh>
      )}
      {/* seeds */}
      {spots.map(([dx, dz], i) => (
        <mesh key={`${pit}-${i}`} castShadow position={[dx, 0.16 + (i > 12 ? 0.14 : 0), dz]}>
          <sphereGeometry args={[0.13, 12, 12]} />
          <meshStandardMaterial color={i % 2 === 0 ? seedColors[0] : seedColors[1]} roughness={0.55} />
        </mesh>
      ))}
      {isStore && (
        <mesh position={[0, 0.75, 0]}>
          <sphereGeometry args={[0.001, 4, 4]} />
          <meshBasicMaterial />
        </mesh>
      )}
    </group>
  );
}

export { SEAT_COLORS as MANCALA_SEAT_COLORS };
