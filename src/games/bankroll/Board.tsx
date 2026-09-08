import { useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';

/* ------------------------------------------------------------------ */

const SUITS = ['♠', '♥', '♦', '♣'];

/** playing-card face texture: rank 1..13, suit 0..3 */
export function cardTexture(rank: number, suit: number): THREE.CanvasTexture {
  const names = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const red = suit === 1 || suit === 2;
  const c = document.createElement('canvas');
  c.width = 300;
  c.height = 420;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f8f5ee';
  ctx.fillRect(0, 0, 300, 420);
  ctx.strokeStyle = 'rgba(40,30,60,0.25)';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 284, 404);
  ctx.fillStyle = red ? '#c0392b' : '#221b33';
  ctx.font = '900 96px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(names[rank] ?? '?', 150, 180);
  ctx.font = '120px serif';
  ctx.fillText(SUITS[suit] ?? '?', 150, 300);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Card({
  rank,
  position,
  rotationY = 0,
  faceDown = false,
}: {
  rank: number | null;
  position: [number, number, number];
  rotationY?: number;
  faceDown?: boolean;
}) {
  const face = useMemo(() => (rank !== null ? cardTexture(rank, rank % 4) : null), [rank]);
  const back = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 300;
    c.height = 420;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#7c2d4a';
    ctx.fillRect(0, 0, 300, 420);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 5;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(150, 210, 30 + i * 24, 0, Math.PI * 2);
      ctx.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  return (
    <group position={position} rotation-y={rotationY}>
      <RoundedBox args={[1.5, 0.05, 2.1]} radius={0.04} smoothness={3} castShadow receiveShadow>
        <meshStandardMaterial color="#e8e0cf" roughness={0.7} />
      </RoundedBox>
      <mesh position={[0, faceDown ? -0.035 : 0.035, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[1.36, 1.96]} />
        <meshStandardMaterial map={faceDown ? back : face ?? back} roughness={0.75} />
      </mesh>
    </group>
  );
}

/** chips stacked in cylinders, count → height */
function ChipStack({ chips, accent, position }: { chips: number; accent: string; position: [number, number, number] }) {
  const stacks = Math.min(5, Math.ceil(chips / 20));
  return (
    <group position={position}>
      {Array.from({ length: stacks }, (_, s) => {
        const count = s === stacks - 1 ? chips - (stacks - 1) * 20 : 20;
        const h = Math.min(1.2, 0.07 * count);
        return (
          <mesh key={s} position={[(s - (stacks - 1) / 2) * 0.62, h / 2, 0]} castShadow>
            <cylinderGeometry args={[0.34, 0.34, h, 18]} />
            <meshStandardMaterial color={accent} roughness={0.5} />
          </mesh>
        );
      })}
    </group>
  );
}

export function BankrollTable({
  table,
  resultCard,
  names,
  accents,
  banks,
  felt,
  turn,
}: {
  table: [number, number] | null;
  resultCard: number | null;
  names: string[];
  accents: string[];
  banks: number[];
  felt: string;
  turn: number;
}) {
  return (
    <group>
      <RoundedBox args={[16, 0.5, 10]} radius={0.25} smoothness={4} position={[0, -0.28, 0]} receiveShadow>
        <meshStandardMaterial color={felt} roughness={0.95} />
      </RoundedBox>
      {/* the two table cards + the flipped result */}
      <Card rank={table?.[0] ?? null} position={[-2.6, 0.6, 0.6]} rotationY={0.24} />
      <Card rank={table?.[1] ?? null} position={[2.6, 0.6, 0.6]} rotationY={-0.24} />
      {resultCard !== null && <Card rank={resultCard} position={[0, 0.75, 1.4]} rotationY={0.1} />}
      {/* chip banks around the table */}
      {banks.map((b, i) => {
        const n = banks.length;
        const angle = (i / n) * Math.PI * 2 + Math.PI / 2;
        return (
          <group key={i} position={[Math.cos(angle) * 6, 0, Math.sin(angle) * 3.6 - 1.5]}>
            <ChipStack chips={b} accent={accents[i % accents.length] ?? '#f59e0b'} position={[0, 0, 0]} />
            <mesh position={[0, i === turn ? 0.09 : 0.05, 1]} rotation-x={-Math.PI / 2}>
              <ringGeometry args={[0.4, 0.52, 24]} />
              <meshStandardMaterial
                color={i === turn ? '#fbbf24' : '#ffffff'}
                emissive={i === turn ? '#fbbf24' : '#000000'}
                emissiveIntensity={i === turn ? 0.7 : 0}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
