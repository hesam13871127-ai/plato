import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import type { WerewolfState } from './engine';

/* ------------------------------------------------------------------ */

function nameplateTexture(name: string, accent: string, dead: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = dead ? '#4b5563' : accent;
  ctx.beginPath();
  ctx.roundRect?.(4, 4, 312, 88, 18);
  if (!ctx.roundRect) ctx.rect(4, 4, 312, 88);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '700 44px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(dead ? `✝︎ ${name}` : name, 160, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function SeatToken({
  name,
  accent,
  alive,
  active,
  angle,
  radius,
}: {
  name: string;
  accent: string;
  alive: boolean;
  active: boolean;
  angle: number;
  radius: number;
}) {
  const texture = useMemo(() => nameplateTexture(name, accent, !alive), [name, accent, alive]);
  const ref = useRef<THREE.Group>(null);
  useFrame((st, dt) => {
    if (!ref.current) return;
    const wantY = alive ? (active ? 0.45 + Math.sin(st.clock.elapsedTime * 4) * 0.08 : 0.35) : 0.18;
    ref.current.position.y = THREE.MathUtils.damp(ref.current.position.y, wantY, 8, dt);
  });
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  return (
    <group ref={ref} position={[x, 0.35, z]}>
      {/* body */}
      <mesh castShadow rotation={[alive ? 0 : Math.PI / 2.2, 0, 0]}>
        <capsuleGeometry args={[0.32, 0.55, 6, 12]} />
        <meshStandardMaterial color={alive ? accent : '#565f6e'} roughness={0.65} />
      </mesh>
      {/* head */}
      <mesh position={[0, alive ? 0.72 : 0, 0]} castShadow>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial color={alive ? '#f7d9b8' : '#9aa3af'} roughness={0.6} />
      </mesh>
      {/* active halo */}
      {active && alive && (
        <mesh position={[0, -0.32, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.42, 0.58, 28]} />
          <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* nameplate */}
      <mesh position={[0, 1.12, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[1.5, 0.45]} />
        <meshStandardMaterial map={texture} roughness={0.8} transparent />
      </mesh>
    </group>
  );
}

/** the moon/sun disc floating above the village */
function SkyOrb({ night }: { night: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((st) => {
    if (ref.current) ref.current.position.y = 8.4 + Math.sin(st.clock.elapsedTime * 0.7) * 0.25;
  });
  return (
    <mesh ref={ref} position={[2.5, 8.4, -4]}>
      <sphereGeometry args={[0.85, 24, 24]} />
      <meshStandardMaterial
        color={night ? '#e2e8f0' : '#fbbf24'}
        emissive={night ? '#a5b4cf' : '#f59e0b'}
        emissiveIntensity={night ? 0.5 : 1.1}
        roughness={0.9}
      />
    </mesh>
  );
}

export function WerewolfVillage({
  state,
  names,
  accents,
  actor,
  viewer,
}: {
  state: WerewolfState;
  names: string[];
  accents: string[];
  actor: number | null;
  viewer: number;
}) {
  const night = state.phase === 'night';
  const n = state.playerCount;
  const radius = 3.6;
  return (
    <group>
      {/* ground */}
      <RoundedBox args={[14, 0.6, 14]} radius={0.3} smoothness={4} position={[0, -0.32, 0]} receiveShadow>
        <meshStandardMaterial color={night ? '#20301f' : '#3c5a36'} roughness={0.95} />
      </RoundedBox>
      {/* campfire */}
      <group position={[0, 0.1, 0]}>
        <mesh position={[0, 0.08, 0]}>
          <cylinderGeometry args={[0.9, 1.05, 0.16, 18]} />
          <meshStandardMaterial color="#5a4632" roughness={0.9} />
        </mesh>
        {[0, 1, 2, 3, 4].map((i) => {
          const a = (i / 5) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 0.28, 0.32, Math.sin(a) * 0.28]} rotation={[0.4, a, 0.2]} castShadow>
              <cylinderGeometry args={[0.05, 0.07, 0.9, 6]} />
              <meshStandardMaterial color="#7c5a3a" roughness={0.85} />
            </mesh>
          );
        })}
        <pointLight
          position={[0, 1.1, 0]}
          color={night ? '#ff7b3d' : '#ffb03d'}
          intensity={night ? 14 : 9}
          distance={12}
        />
        <mesh position={[0, 0.75, 0]}>
          <coneGeometry args={[0.3, 0.85, 8]} />
          <meshStandardMaterial color="#ff7b3d" emissive="#ff7b3d" emissiveIntensity={1.4} transparent opacity={0.82} />
        </mesh>
      </group>
      <SkyOrb night={night} />
      {Array.from({ length: n }, (_, i) => (
        <SeatToken
          key={i}
          name={names[i] ?? `P${i}`}
          accent={accents[i % accents.length] ?? '#8b5cf6'}
          alive={state.alive[i] === true}
          active={actor === i}
          angle={(i / n) * Math.PI * 2 + Math.PI / 2}
          radius={radius}
        />
      ))}
      {/* viewer marker */}
      <mesh position={[Math.cos((0 / n) * Math.PI * 2 + Math.PI / 2) * (radius + 0.9), 0.06, Math.sin(Math.PI / 2) * (radius + 0.9)]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.28, 0.4, 22]} />
        <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={0.5} side={THREE.DoubleSide} />
      </mesh>
      {viewer < 0 && null}
    </group>
  );
}
