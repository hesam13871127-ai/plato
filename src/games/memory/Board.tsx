import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import type { MemoryState } from './engine';

/* ------------------------------------------------------------------ */

function faceTexture(symbol: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f8f5ee';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(40,30,60,0.3)';
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, 240, 240);
  ctx.font = '150px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(symbol, 128, 142);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function backTexture(color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 8;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(128, 128, 24 + i * 26, 0, Math.PI * 2);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** a card lying on the table that flips around its X axis */
function MemoryCard({
  idx,
  symbol,
  faceUp,
  matched,
  ownerColor,
  backColor,
  position,
  onClick,
  interactive,
}: {
  idx: number;
  symbol: string;
  faceUp: boolean;
  matched: boolean;
  ownerColor: string;
  backColor: string;
  position: [number, number, number];
  onClick: (i: number) => void;
  interactive: boolean;
}) {
  const face = useMemo(() => faceTexture(symbol), [symbol]);
  const back = useMemo(() => backTexture(backColor), [backColor]);
  const [hovered, setHovered] = useState(false);
  const inner = useRef<THREE.Group>(null);
  const lift = useRef<THREE.Group>(null);

  useFrame((st, dt) => {
    if (inner.current) {
      const want = faceUp ? Math.PI : 0;
      inner.current.rotation.x = THREE.MathUtils.damp(inner.current.rotation.x, want, 7, dt);
    }
    if (lift.current) {
      const want = hovered && interactive ? 0.22 : matched ? 0.1 : 0;
      lift.current.position.y = THREE.MathUtils.damp(lift.current.position.y, want, 9, dt);
    }
  });

  return (
    <group
      position={position}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        if (interactive) {
          setHovered(true);
          void e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = 'auto';
      }}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        if (interactive) {
          void e.stopPropagation();
          onClick(idx);
        }
      }}
    >
      <group ref={lift}>
        {/* owner halo for matched pairs */}
        {matched && (
          <mesh position={[0, -0.06, 0]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[1.65, 1.65]} />
            <meshStandardMaterial color={ownerColor} emissive={ownerColor} emissiveIntensity={0.55} transparent opacity={0.85} />
          </mesh>
        )}
        <group ref={inner}>
          {/* back face (visible when face-down) */}
          <mesh position={[0, 0.03, 0]} rotation-x={-Math.PI / 2} castShadow receiveShadow>
            <planeGeometry args={[1.35, 1.35]} />
            <meshStandardMaterial map={back} roughness={0.7} />
          </mesh>
          {/* front face (visible when flipped) */}
          <mesh position={[0, -0.03, 0]} rotation-x={Math.PI / 2} castShadow>
            <planeGeometry args={[1.35, 1.35]} />
            <meshStandardMaterial map={face} roughness={0.7} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

export function MemoryTable({
  state,
  backColor,
  accents,
  onReveal,
  interactive,
}: {
  state: MemoryState;
  backColor: string;
  accents: string[];
  onReveal: (i: number) => void;
  interactive: boolean;
}) {
  const spacing = 1.62;
  const faceUp = (i: number) =>
    state.revealed[i] === true || state.first === i || state.peek.includes(i);
  return (
    <group>
      <RoundedBox
        args={[state.cols * spacing + 1.6, 0.5, state.rows * spacing + 1.6]}
        radius={0.25}
        smoothness={4}
        position={[0, -0.3, 0]}
        receiveShadow
      >
        <meshStandardMaterial color="#20262e" roughness={0.95} />
      </RoundedBox>
      {state.symbols.map((symbol, i) => {
        const col = i % state.cols;
        const row = Math.floor(i / state.cols);
        return (
          <MemoryCard
            key={i}
            idx={i}
            symbol={symbol}
            faceUp={faceUp(i)}
            matched={state.revealed[i] === true}
            ownerColor={accents[state.owner[i] ?? 0] ?? '#f59e0b'}
            backColor={backColor}
            position={[
              (col - (state.cols - 1) / 2) * spacing,
              0,
              (row - (state.rows - 1) / 2) * spacing,
            ]}
            onClick={onReveal}
            interactive={interactive && !state.revealed[i] && state.first !== i}
          />
        );
      })}
    </group>
  );
}
