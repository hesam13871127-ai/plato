import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import type { ChainState } from './engine';

/* ------------------------------------------------------------------ */

function letterTexture(letter: string, accent: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f8f5ee';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 18;
  ctx.strokeRect(14, 14, 228, 228);
  ctx.fillStyle = '#221b33';
  ctx.font = '900 150px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 128, 138);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function wordTexture(word: string, accent: string, last: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = last ? accent : '#f4f0e6';
  ctx.fillRect(0, 0, 512, 160);
  ctx.fillStyle = last ? '#ffffff' : '#221b33';
  ctx.font = '700 64px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(word, 256, 86);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** big floating tile showing the letter the next word must start with */
export function LetterTower({ letter, accent }: { letter: string; accent: string }) {
  const texture = useMemo(() => letterTexture(letter, accent), [letter, accent]);
  const ref = useRef<THREE.Group>(null);
  useFrame((st) => {
    if (ref.current) {
      ref.current.position.y = 3.6 + Math.sin(st.clock.elapsedTime * 1.6) * 0.12;
      ref.current.rotation.y = Math.sin(st.clock.elapsedTime * 0.5) * 0.22;
    }
  });
  return (
    <group ref={ref} position={[0, 3.6, -3.6]}>
      <RoundedBox args={[1.7, 1.7, 0.5]} radius={0.12} smoothness={3} castShadow>
        <meshStandardMaterial color={accent} roughness={0.5} emissive={accent} emissiveIntensity={0.12} />
      </RoundedBox>
      <mesh position={[0, 0, 0.28]}>
        <planeGeometry args={[1.4, 1.4]} />
        <meshStandardMaterial map={texture} roughness={0.7} />
      </mesh>
    </group>
  );
}

/** one word tile lying on the table */
function WordTile({
  word,
  accent,
  last,
  position,
  rotationY,
}: {
  word: string;
  accent: string;
  last: boolean;
  position: [number, number, number];
  rotationY: number;
}) {
  const texture = useMemo(() => wordTexture(word, accent, last), [word, accent, last]);
  const w = Math.min(2.6, Math.max(1.1, 0.32 + word.length * 0.22));
  return (
    <group position={position} rotation-y={rotationY}>
      <RoundedBox args={[w, 0.14, 0.7]} radius={0.05} smoothness={3} castShadow receiveShadow>
        <meshStandardMaterial color={last ? accent : '#d9cfb8'} roughness={0.6} />
      </RoundedBox>
      <mesh position={[0, 0.08, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[w * 0.92, 0.6]} />
        <meshStandardMaterial map={texture} roughness={0.75} />
      </mesh>
    </group>
  );
}

/** the last words of the chain arranged as a fan on the felt */
export function ChainTable({
  state,
  accent,
  felt,
  onTileClick,
}: {
  state: ChainState;
  accent: string;
  felt: string;
  onTileClick?: (word: string) => void;
}) {
  const recent = state.words.slice(-8);
  const startIdx = state.words.length - recent.length;
  return (
    <group>
      <RoundedBox args={[16, 0.5, 10]} radius={0.25} smoothness={4} position={[0, -0.28, 0]} receiveShadow>
        <meshStandardMaterial color={felt} roughness={0.95} />
      </RoundedBox>
      {recent.map((word, i) => {
        const k = i / Math.max(1, recent.length - 1); // 0..1
        const angle = (k - 0.5) * 1.15;
        const radius = 3.4 + (1 - Math.abs(k - 0.5) * 2) * 1.6;
        const x = Math.sin(angle) * radius;
        const z = 1.4 - Math.cos(angle) * radius * 0.42;
        return (
          <group
            key={`${startIdx + i}-${word}`}
            onPointerDown={(e: ThreeEvent<PointerEvent>) => {
              if (onTileClick) {
                void e.stopPropagation();
                onTileClick(word);
              }
            }}
          >
            <WordTile
              word={word}
              accent={accent}
              last={i === recent.length - 1}
              position={[x, 0.35, z]}
              rotationY={angle * 0.5}
            />
          </group>
        );
      })}
    </group>
  );
}
