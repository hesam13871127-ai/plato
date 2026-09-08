import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { MW_W, MW_H, MINE_PENALTY } from './engine';

const TILE = 0.56;
const NUM_COLORS = ['', '#2563eb', '#15803d', '#dc2626', '#6d28d9', '#b45309', '#0e7490', '#334155', '#7f1d1d'];

export function mineTileTexture(n: number, ownerTint: string | null): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = ownerTint ?? '#d6d3d1';
  ctx.fillRect(0, 0, 96, 96);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(0, 0, 96, 30);
  if (n > 0) {
    ctx.fillStyle = NUM_COLORS[n] ?? '#111';
    ctx.font = '700 58px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), 48, 52);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function boomTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#7f1d1d';
  ctx.fillRect(0, 0, 96, 96);
  ctx.fillStyle = '#fbbf24';
  ctx.font = '700 56px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('💥', 48, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Tile({
  idx,
  state,
  seatColors,
  interactive,
  onReveal,
}: {
  idx: number;
  state: import('./engine').MineState;
  seatColors: string[];
  interactive: boolean;
  onReveal: (idx: number) => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const x = (idx % MW_W) - (MW_W - 1) / 2;
  const y = Math.floor(idx / MW_W) - (MW_H - 1) / 2;
  const revealed = state.revealed[idx]!;
  const exploded = state.exploded[idx]!;
  const owner = state.owner[idx]!;

  const tex = useMemo(() => {
    if (exploded) return boomTexture();
    if (revealed) return mineTileTexture(state.numbers[idx]!, owner >= 0 ? seatColors[owner] ?? '#d6d3d1' : '#d6d3d1');
    return null;
  }, [exploded, revealed, state.numbers, idx, owner, seatColors]);

  useFrame((st, dt) => {
    if (!ref.current) return;
    const want = revealed ? 0.02 : 0.14;
    ref.current.position.y = THREE.MathUtils.damp(ref.current.position.y, want, 10, dt);
    void st;
  });

  return (
    <mesh
      ref={ref}
      position={[x * TILE, 0.14, y * TILE]}
      castShadow={!revealed}
      receiveShadow
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        if (interactive && !revealed) {
          void e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'auto';
      }}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        if (interactive && !revealed) {
          void e.stopPropagation();
          onReveal(idx);
        }
      }}
    >
      <boxGeometry args={[TILE - 0.04, 0.28, TILE - 0.04]} />
      {tex ? (
        <meshStandardMaterial map={tex} roughness={0.8} />
      ) : (
        <meshStandardMaterial color={(idx + Math.floor(idx / MW_W)) % 2 === 0 ? '#a8a29e' : '#bcb8b2'} roughness={0.85} />
      )}
    </mesh>
  );
}

export function MineScene({
  state,
  seatColors,
  interactive,
  onReveal,
}: {
  state: import('./engine').MineState;
  seatColors: string[];
  interactive: boolean;
  onReveal: (idx: number) => void;
}) {
  return (
    <group>
      <RoundedBox args={[MW_W * TILE + 0.7, 0.5, MW_H * TILE + 0.7]} radius={0.16} smoothness={3} position={[0, -0.28, 0]} receiveShadow>
        <meshStandardMaterial color="#44403c" roughness={0.8} />
      </RoundedBox>
      {Array.from({ length: MW_W * MW_H }, (_, i) => (
        <Tile key={i} idx={i} state={state} seatColors={seatColors} interactive={interactive && state.phase === 'play'} onReveal={onReveal} />
      ))}
    </group>
  );
}

export const MINE_PENALTY_UI = MINE_PENALTY;
