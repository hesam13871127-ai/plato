import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { HOLES, type GolfHole, type GolfShot } from './engine';

/* ------------------------------------------------------------------ */

export const GOLF_SCALE = 0.55; // engine units → world units

export function toWorld(hole: GolfHole, x: number, y: number): [number, number, number] {
  return [(x - hole.w / 2) * GOLF_SCALE, 0.22, (y - hole.h / 2) * GOLF_SCALE];
}

/** the whole course for one hole: floor, walls, bumpers, cup and flag */
export function GolfCourse({
  hole,
  felt,
  onAim,
}: {
  hole: GolfHole;
  felt: string;
  onAim?: (x: number, y: number) => void;
}) {
  const w = hole.w * GOLF_SCALE;
  const h = hole.h * GOLF_SCALE;
  const wallH = 0.42;
  return (
    <group>
      {/* fairway */}
      <RoundedBox args={[w, 0.34, h]} radius={0.1} smoothness={3} position={[0, 0, 0]} receiveShadow>
        <meshStandardMaterial color={felt} roughness={0.92} />
      </RoundedBox>
      {/* rails */}
      {[
        { pos: [0, wallH / 2, -h / 2] as const, size: [w + 0.3, wallH, 0.18] as const },
        { pos: [0, wallH / 2, h / 2] as const, size: [w + 0.3, wallH, 0.18] as const },
        { pos: [-w / 2, wallH / 2, 0] as const, size: [0.18, wallH, h + 0.3] as const },
        { pos: [w / 2, wallH / 2, 0] as const, size: [0.18, wallH, h + 0.3] as const },
      ].map((rail, i) => (
        <RoundedBox key={i} args={[...rail.size] as [number, number, number]} radius={0.05} smoothness={2} position={[...rail.pos] as [number, number, number]} castShadow receiveShadow>
          <meshStandardMaterial color="#8a6f4d" roughness={0.75} />
        </RoundedBox>
      ))}
      {/* bumpers */}
      {hole.bumpers.map((b, i) => (
        <mesh key={i} position={toWorld(hole, b.x, b.y)} castShadow>
          <cylinderGeometry args={[b.r * GOLF_SCALE, b.r * GOLF_SCALE, 0.55, 24]} />
          <meshStandardMaterial color={i % 2 === 0 ? '#f43f5e' : '#f59e0b'} roughness={0.5} />
        </mesh>
      ))}
      {/* cup */}
      <mesh position={toWorld(hole, hole.cup[0], hole.cup[1])}>
        <cylinderGeometry args={[0.5 * GOLF_SCALE * 1.1, 0.5 * GOLF_SCALE * 1.1, 0.1, 20]} />
        <meshStandardMaterial color="#0c0a12" roughness={0.9} />
      </mesh>
      {/* flag */}
      <group position={toWorld(hole, hole.cup[0], hole.cup[1])}>
        <mesh position={[0, 0.85, 0]} castShadow>
          <cylinderGeometry args={[0.025, 0.025, 1.5, 8]} />
          <meshStandardMaterial color="#e8e0cf" roughness={0.5} />
        </mesh>
        <mesh position={[0.22, 1.35, 0]}>
          <boxGeometry args={[0.4, 0.26, 0.02]} />
          <meshStandardMaterial color="#f43f5e" roughness={0.6} />
        </mesh>
      </group>
      {/* tee marker */}
      <mesh position={toWorld(hole, hole.tee[0], hole.tee[1])} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.3, 0.4, 20]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.35} side={THREE.DoubleSide} />
      </mesh>
      {/* invisible aim surface */}
      <mesh
        position={[0, 0.2, 0]}
        rotation-x={-Math.PI / 2}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
          if (onAim) onAim(e.point.x / GOLF_SCALE + hole.w / 2, e.point.z / GOLF_SCALE + hole.h / 2);
        }}
      >
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial visible={false} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */

/** ball that replays the last shot's sampled path, then rests */
export function ReplayBall({
  shot,
  rest,
  hole,
  color,
  onStroke,
}: {
  shot: GolfShot | null;
  rest: [number, number];
  hole: GolfHole;
  color: string;
  onStroke?: (x: number, y: number) => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const idx = useRef(0);
  const lastShot = useRef<GolfShot | null>(null);

  // new shot detected → restart the replay
  useEffect(() => {
    if (shot !== lastShot.current) {
      lastShot.current = shot;
      idx.current = 0;
    }
  }, [shot]);

  useFrame((st, dt) => {
    const mesh = ref.current;
    if (!mesh) return;
    const path = shot?.path;
    if (path && idx.current < path.length) {
      idx.current = Math.min(path.length, idx.current + 2); // ~2 samples/frame
      const [x, y] = path[Math.max(0, idx.current - 1)]!;
      const target = toWorld(hole, x, y);
      mesh.position.x = THREE.MathUtils.damp(mesh.position.x, target[0], 22, dt);
      mesh.position.z = THREE.MathUtils.damp(mesh.position.z, target[2], 22, dt);
    } else {
      const target = toWorld(hole, rest[0], rest[1]);
      mesh.position.x = THREE.MathUtils.damp(mesh.position.x, target[0], 8, dt);
      mesh.position.z = THREE.MathUtils.damp(mesh.position.z, target[2], 8, dt);
    }
    void st;
  });

  return (
    <mesh
      ref={ref}
      position={toWorld(hole, rest[0], rest[1])}
      castShadow
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        if (onStroke) {
          void e.stopPropagation();
          onStroke(rest[0], rest[1]);
        }
      }}
    >
      <sphereGeometry args={[0.35 * GOLF_SCALE + 0.05, 20, 20]} />
      <meshStandardMaterial color={color} roughness={0.35} />
    </mesh>
  );
}

/** aim arrow from the ball toward the pointer */
export function AimArrow({
  from,
  to,
  hole,
  visible,
}: {
  from: [number, number];
  to: [number, number] | null;
  hole: GolfHole;
  visible: boolean;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!ref.current || !to) return;
    const a = toWorld(hole, from[0], from[1]);
    const b = toWorld(hole, to[0], to[1]);
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const len = Math.hypot(dx, dz);
    ref.current.visible = visible && len > 0.3;
    ref.current.position.set(a[0] + dx / 2, 0.26, a[2] + dz / 2);
    ref.current.rotation.y = -Math.atan2(dz, dx);
    ref.current.scale.x = Math.max(0.5, len * 0.85);
  });
  return (
    <group ref={ref} visible={false}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.035, 0.035, 1, 8]} />
        <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.7} />
      </mesh>
      <mesh position={[0.55, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.09, 0.22, 10]} />
        <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.7} />
      </mesh>
    </group>
  );
}
