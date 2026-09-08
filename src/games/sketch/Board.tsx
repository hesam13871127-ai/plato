import { useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import type { SketchAttempt } from './engine';
import { TARGETS, type Pt } from './targets';

/* ------------------------------------------------------------------ */
/* canvas drawing helpers (shared with the DOM pad via strokes)          */
/* ------------------------------------------------------------------ */

function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Pt[][],
  opts: { ink: string; width: number; size: number },
) {
  ctx.strokeStyle = opts.ink;
  ctx.lineWidth = opts.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const st of strokes) {
    if (st.length === 1) {
      ctx.beginPath();
      ctx.arc(st[0]![0] * opts.size, st[0]![1] * opts.size, opts.width / 2, 0, Math.PI * 2);
      ctx.fillStyle = opts.ink;
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(st[0]![0] * opts.size, st[0]![1] * opts.size);
    for (let i = 1; i < st.length; i++) ctx.lineTo(st[i]![0] * opts.size, st[i]![1] * opts.size);
    ctx.stroke();
  }
}

function strokesTexture(strokes: Pt[][], ink: string, paper: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = 'rgba(40,30,60,0.18)';
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, 492, 492);
  drawStrokes(ctx, strokes, { ink, width: 12, size: 512 });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------ */
/* easel with the current target                                        */
/* ------------------------------------------------------------------ */

export function Easel({ targetIdx, wood = '#b98a4e' }: { targetIdx: number; wood?: string }) {
  const target = TARGETS[targetIdx] ?? TARGETS[0]!;
  const texture = useMemo(
    () => strokesTexture(target.strokes, '#221b33', '#f6efe0'),
    [target],
  );
  return (
    <group position={[0, 0, -3.2]}>
      {/* canvas */}
      <group position={[0, 3.1, 0]} rotation={[-0.14, 0, 0]}>
        <RoundedBox args={[4.4, 4.4, 0.22]} radius={0.08} smoothness={3} castShadow>
          <meshStandardMaterial color={wood} roughness={0.7} />
        </RoundedBox>
        <mesh position={[0, 0, 0.13]}>
          <planeGeometry args={[4, 4]} />
          <meshStandardMaterial map={texture} roughness={0.85} />
        </mesh>
      </group>
      {/* legs */}
      {[-1.55, 1.55].map((x) => (
        <mesh key={x} position={[x, 1.6, 0.35]} rotation={[0.22, 0, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.09, 5.4, 10]} />
          <meshStandardMaterial color={wood} roughness={0.65} />
        </mesh>
      ))}
      <mesh position={[0, 1.75, -0.72]} rotation={[-0.3, 0, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.08, 5, 10]} />
        <meshStandardMaterial color={wood} roughness={0.65} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* gallery wall — every attempt becomes a framed painting               */
/* ------------------------------------------------------------------ */

export function GalleryWall({
  attempts,
  names,
  accents,
  wall = '#2c2440',
}: {
  attempts: SketchAttempt[];
  names: string[];
  accents: string[];
  wall?: string;
}) {
  const shown = attempts.slice(-8);
  // precompute textures OUTSIDE the render loop (stable hook count)
  const textures = useMemo(
    () => shown.map((at) => strokesTexture(at.strokes, accents[at.player] ?? '#f59e0b', '#f6efe0')),
    [attempts, accents],
  );
  return (
    <group position={[0, 0, -8.6]}>
      <mesh position={[0, 4.4, -0.4]} receiveShadow>
        <boxGeometry args={[26, 9.4, 0.4]} />
        <meshStandardMaterial color={wall} roughness={0.95} />
      </mesh>
      {shown.map((at, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        return (
          <group key={`${at.round}-${at.player}`} position={[(col - 1.5) * 5.4, 6.2 - row * 4.6, 0]}>
            <RoundedBox args={[2.9, 2.9, 0.18]} radius={0.07} smoothness={3} castShadow>
              <meshStandardMaterial color="#5a4632" roughness={0.6} />
            </RoundedBox>
            <mesh position={[0, 0, 0.11]}>
              <planeGeometry args={[2.6, 2.6]} />
              <meshStandardMaterial map={textures[i]} roughness={0.85} />
            </mesh>
            {/* name + score plate */}
            <mesh position={[0, -1.72, 0.02]}>
              <planeGeometry args={[2.7, 0.44]} />
              <meshStandardMaterial
                color={accents[at.player] ?? '#f59e0b'}
                emissive={accents[at.player] ?? '#f59e0b'}
                emissiveIntensity={0.25}
                roughness={0.5}
              />
            </mesh>
            <PlateText text={`${names[at.player] ?? `P${at.player}`} · ${at.score}`} />
          </group>
        );
      })}
    </group>
  );
}

function PlateText({ text }: { text: string }) {
  const texture = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 84;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#00000000';
    ctx.clearRect(0, 0, 512, 84);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 40px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 44);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [text]);
  return (
    <mesh position={[0, -1.72, 0.03]}>
      <planeGeometry args={[2.6, 0.42]} />
      <meshStandardMaterial map={texture} transparent roughness={0.8} />
    </mesh>
  );
}

/** studio floor shared by the scene */
export function StudioFloor({ wood = '#8a6f4d' }: { wood?: string }) {
  return (
    <RoundedBox args={[19, 0.5, 12]} radius={0.25} smoothness={4} position={[0, -0.3, 0]} receiveShadow>
      <meshStandardMaterial color={wood} roughness={0.9} />
    </RoundedBox>
  );
}
