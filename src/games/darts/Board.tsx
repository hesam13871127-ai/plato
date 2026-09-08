import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import {
  R_BULL,
  R_BULL25,
  R_TRIPLE_IN,
  R_TRIPLE_OUT,
  R_DOUBLE_IN,
  R_DOUBLE_OUT,
  R_MISS,
  SECTORS,
} from './engine';

/* mm → canvas px: board drawn to fill the cylinder face */
export const BOARD_TEX = 1024;
const PX = BOARD_TEX / 2 / R_MISS; // px per mm
const mmToPx = (mm: number) => mm * PX;

const SECTOR_ORDER: readonly number[] = SECTORS;

/** full dartboard face as a canvas texture (real geometry, standard colors) */
export function dartboardTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = BOARD_TEX;
  c.height = BOARD_TEX;
  const ctx = c.getContext('2d')!;
  const cx = BOARD_TEX / 2;
  const cy = BOARD_TEX / 2;

  // backdrop (the black surround out to the rim)
  ctx.fillStyle = '#14121a';
  ctx.fillRect(0, 0, BOARD_TEX, BOARD_TEX);

  const ring = (r0: number, r1: number, fill: (sectorIdx: number) => string) => {
    for (let i = 0; i < 20; i++) {
      const a0 = -Math.PI / 2 + (i * Math.PI) / 10 - Math.PI / 20;
      const a1 = a0 + Math.PI / 10;
      ctx.beginPath();
      ctx.arc(cx, cy, mmToPx(r1), a0, a1);
      ctx.arc(cx, cy, mmToPx(r0), a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = fill(i);
      ctx.fill();
    }
  };

  const dark = (i: number) => (i % 2 === 0 ? '#1c1a22' : '#e8dcc0');
  const red = (i: number) => (i % 2 === 0 ? '#c0392b' : '#1e7a46');

  ring(R_BULL25, R_TRIPLE_IN, dark);
  ring(R_TRIPLE_IN, R_TRIPLE_OUT, red);
  ring(R_TRIPLE_OUT, R_DOUBLE_IN, dark);
  ring(R_DOUBLE_IN, R_DOUBLE_OUT, red);

  // bull
  ctx.beginPath();
  ctx.arc(cx, cy, mmToPx(R_BULL25), 0, Math.PI * 2);
  ctx.fillStyle = '#1e7a46';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, mmToPx(R_BULL), 0, Math.PI * 2);
  ctx.fillStyle = '#c0392b';
  ctx.fill();

  // sector numbers
  ctx.fillStyle = '#e8dcc0';
  ctx.font = `900 ${Math.round(mmToPx(16))}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 20; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 10;
    ctx.fillText(
      String(SECTOR_ORDER[i]),
      cx + Math.cos(a) * mmToPx(R_MISS - 14),
      cy + Math.sin(a) * mmToPx(R_MISS - 14),
    );
  }

  // spider (wires)
  ctx.strokeStyle = 'rgba(200,200,210,0.75)';
  ctx.lineWidth = 2;
  for (const r of [R_BULL, R_BULL25, R_TRIPLE_IN, R_TRIPLE_OUT, R_DOUBLE_IN, R_DOUBLE_OUT]) {
    ctx.beginPath();
    ctx.arc(cx, cy, mmToPx(r), 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 20; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 10 - Math.PI / 20;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * mmToPx(R_BULL25), cy + Math.sin(a) * mmToPx(R_BULL25));
    ctx.lineTo(cx + Math.cos(a) * mmToPx(R_DOUBLE_OUT), cy + Math.sin(a) * mmToPx(R_DOUBLE_OUT));
    ctx.stroke();
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------ */

/** a dart stuck into the board at (mmX, mmY) */
function Dart({ x, y, accent, fresh }: { x: number; y: number; accent: string; fresh?: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const world = 1 / 100; // 1 world unit = 100 mm
  useFrame((st, dt) => {
    if (!ref.current) return;
    const want = fresh ? 1 : 0.92;
    const s = THREE.MathUtils.damp(ref.current.scale.x, want, 6, dt);
    ref.current.scale.setScalar(s);
  });
  const tilt = 0.12;
  return (
    <group ref={ref} position={[x * world, y * world, 0.16]} rotation={[tilt, 0, Math.atan2(y, x) * -0.06]}>
      {/* flight */}
      <mesh position={[0, 0, -0.34]} castShadow>
        <coneGeometry args={[0.05, 0.18, 4]} />
        <meshStandardMaterial color={accent} roughness={0.5} />
      </mesh>
      {/* shaft */}
      <mesh position={[0, 0, -0.14]} castShadow>
        <cylinderGeometry args={[0.012, 0.014, 0.36, 8]} />
        <meshStandardMaterial color="#c9c2b4" roughness={0.4} metalness={0.5} />
      </mesh>
      {/* tip */}
      <mesh position={[0, 0, 0.07]}>
        <coneGeometry args={[0.02, 0.14, 8]} />
        <meshStandardMaterial color="#8b8b95" metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  );
}

/** aim reticle following the pointer */
function Reticle({ x, y, show }: { x: number; y: number; show: boolean }) {
  if (!show) return null;
  const world = 1 / 100;
  return (
    <mesh position={[x * world, y * world, 0.18]} rotation-x={-Math.PI / 2}>
      <ringGeometry args={[0.052, 0.075, 24]} />
      <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.9} side={THREE.DoubleSide} />
    </mesh>
  );
}

export function Dartboard({
  darts,
  freshIdx,
  accent,
  interactive,
  onThrow,
}: {
  /** darts currently stuck in the board (this turn + last throw) */
  darts: { x: number; y: number; hit: { value: number; label: string } }[];
  freshIdx: number | null;
  accent: string;
  interactive: boolean;
  onThrow: (xMm: number, yMm: number) => void;
}) {
  const texture = useMemo(() => dartboardTexture(), []);
  const [aim, setAim] = useState<{ x: number; y: number } | null>(null);

  const pick = (e: ThreeEvent<PointerEvent>): { x: number; y: number } => {
    // local point on the board plane → mm
    return { x: e.point.x * 100, y: e.point.y * 100 };
  };

  return (
    <group>
      {/* backing cabinet */}
      <RoundedBox args={[5.6, 5.6, 0.5]} radius={0.18} smoothness={4} position={[0, 0, -0.42]} castShadow>
        <meshStandardMaterial color="#241d31" roughness={0.7} />
      </RoundedBox>
      {/* the board face: a circle mesh the texture maps onto */}
      <mesh
        position={[0, 0, -0.14]}
        onPointerMove={(e) => {
          if (interactive) {
            void e.stopPropagation();
            setAim(pick(e));
          }
        }}
        onPointerOut={() => setAim(null)}
        onPointerDown={(e) => {
          if (interactive) {
            void e.stopPropagation();
            const p = pick(e);
            if (Math.hypot(p.x, p.y) <= R_MISS + 10) onThrow(p.x, p.y);
          }
        }}
      >
        <circleGeometry args={[R_MISS / 100 + 0.06, 64]} />
        <meshStandardMaterial map={texture} roughness={0.85} />
      </mesh>
      {/* rim */}
      <mesh position={[0, 0, -0.16]}>
        <torusGeometry args={[R_MISS / 100 + 0.055, 0.045, 12, 64]} />
        <meshStandardMaterial color="#0f0d15" roughness={0.6} />
      </mesh>
      {darts.map((d, i) => (
        <Dart key={i} x={d.x} y={d.y} accent={accent} fresh={i === freshIdx} />
      ))}
      <Reticle x={aim?.x ?? 0} y={aim?.y ?? 0} show={aim !== null && interactive} />
    </group>
  );
}
