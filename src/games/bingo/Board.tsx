import { useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import type { BingoCard } from './engine';

/* ------------------------------------------------------------------ */

/** texture for one bingo card panel (5×5) */
function bingoCardTexture(card: BingoCard, accent: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 640;
  const ctx = c.getContext('2d')!;
  // header B I N G O
  const letters = ['B', 'I', 'N', 'G', 'O'];
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = accent;
    ctx.fillRect(i * 102 + 4, 4, 96, 90);
    ctx.fillStyle = '#fff';
    ctx.font = '900 58px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letters[i]!, i * 102 + 52, 52);
  }
  // cells
  for (let col = 0; col < 5; col++) {
    for (let row = 0; row < 5; row++) {
      const x = col * 102 + 4;
      const y = row * 102 + 100;
      const marked = card.marked[col]![row]!;
      ctx.fillStyle = marked ? accent : '#f7f3e8';
      ctx.fillRect(x, y, 96, 96);
      ctx.strokeStyle = 'rgba(40,30,60,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, 96, 96);
      const num = card.numbers[col]![row]!;
      ctx.fillStyle = marked ? '#ffffff' : '#2a2438';
      ctx.font = '900 44px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (num === 0) {
        ctx.font = '900 40px Arial';
        ctx.fillText('★', x + 48, y + 50);
      } else {
        ctx.fillText(String(num), x + 48, y + 52);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function BingoPanel({
  card,
  name,
  accent,
  position,
  rotationY = 0,
}: {
  card: BingoCard;
  name: string;
  accent: string;
  position: [number, number, number];
  rotationY?: number;
}) {
  const texture = useMemo(() => bingoCardTexture(card, accent), [card, accent]);
  return (
    <group position={position} rotation-y={rotationY}>
      <RoundedBox args={[3.1, 0.16, 3.95]} radius={0.08} smoothness={3} castShadow receiveShadow>
        <meshStandardMaterial color="#241d31" roughness={0.65} />
      </RoundedBox>
      <mesh position={[0, 0.09, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[3, 3.8]} />
        <meshStandardMaterial map={texture} roughness={0.75} />
      </mesh>
      {/* name plate */}
      <mesh position={[0, 0.09, 2.12]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[3, 0.42]} />
        <meshStandardMaterial color={accent} roughness={0.5} emissive={accent} emissiveIntensity={0.25} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */

const PANEL_SPOTS: [number, number, number][] = [
  [-5.4, 0, 2.5],
  [5.4, 0, 2.5],
  [-5.4, 0, -2.5],
  [5.4, 0, -2.5],
];

export function BingoTable({
  cards,
  names,
  accents,
  lastNumber,
}: {
  cards: BingoCard[];
  names: string[];
  accents: string[];
  lastNumber: number | null;
}) {
  return (
    <group>
      {/* felt */}
      <RoundedBox args={[16.5, 0.5, 10.5]} radius={0.25} smoothness={4} position={[0, -0.3, 0]} receiveShadow>
        <meshStandardMaterial color="#1c6b4a" roughness={0.95} />
      </RoundedBox>
      {cards.map((card, i) => {
        const pos = PANEL_SPOTS[i] ?? [0, 0, 0];
        return (
          <BingoPanel
            key={i}
            card={card}
            name={names[i] ?? `P${i}`}
            accent={accents[i % 4] ?? '#8b5cf6'}
            position={pos}
            rotationY={i === 0 || i === 3 ? 0.28 : -0.28}
          />
        );
      })}
      {lastNumber !== null && <DrawnBall number={lastNumber} />}
    </group>
  );
}

/** big podium ball showing the last drawn number */
export function DrawnBall({ number }: { number: number }) {
  const texture = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#f8f6f2';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.arc(128, 64, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '900 44px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(number), 128, 66);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [number]);
  return (
    <group position={[0, 1.1, 0]}>
      <mesh castShadow>
        <sphereGeometry args={[0.75, 28, 28]} />
        <meshStandardMaterial map={texture} roughness={0.25} />
      </mesh>
      <mesh position={[0, -0.85, 0]}>
        <cylinderGeometry args={[0.55, 0.75, 0.35, 20]} />
        <meshStandardMaterial color="#ffd166" metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  );
}
