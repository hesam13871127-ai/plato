import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { SKEE_HOLES, SK_W, SK_H, RAMP_Y0, RAMP_Y1, type SkeeShot } from './engine';

/** engine coords (x∈[0,6], y∈[0,22], far = big y) → world (far = −z) */
export function toWorld(x: number, y: number): [number, number, number] {
  return [x - SK_W / 2, 0, -(y - SK_H / 2)];
}

/** the ramp/board with holes */
export function SkeeLane({ laneColor, rampColor }: { laneColor: string; rampColor: string }) {
  const laneLen = RAMP_Y0;
  const rampLen = RAMP_Y1 - RAMP_Y0;
  const topLen = SK_H - RAMP_Y1;
  return (
    <group>
      {/* approach lane */}
      <RoundedBox
        args={[SK_W, 0.3, laneLen]}
        radius={0.08}
        smoothness={2}
        position={toWorld(SK_W / 2, laneLen / 2)}
        receiveShadow
      >
        <meshStandardMaterial color={laneColor} roughness={0.6} />
      </RoundedBox>
      {/* ramp (visually raised) */}
      <RoundedBox
        args={[SK_W, 0.5, rampLen + 0.7]}
        radius={0.08}
        smoothness={2}
        position={toWorld(SK_W / 2, (RAMP_Y0 + RAMP_Y1) / 2)}
        receiveShadow
      >
        <meshStandardMaterial color={rampColor} roughness={0.7} />
      </RoundedBox>
      {/* target plateau */}
      <RoundedBox
        args={[SK_W, 0.34, topLen]}
        radius={0.08}
        smoothness={2}
        position={toWorld(SK_W / 2, RAMP_Y1 + topLen / 2)}
        receiveShadow
      >
        <meshStandardMaterial color={laneColor} roughness={0.85} />
      </RoundedBox>
      {/* side rails */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (SK_W / 2 + 0.09), 0.3, 0]} castShadow>
          <boxGeometry args={[0.18, 0.55, SK_H + 0.2]} />
          <meshStandardMaterial color="#7c2d12" roughness={0.55} />
        </mesh>
      ))}
      {/* back wall */}
      <mesh position={toWorld(SK_W / 2, SK_H + 0.1)} castShadow>
        <boxGeometry args={[SK_W + 0.4, 1.3, 0.2]} />
        <meshStandardMaterial color="#7c2d12" roughness={0.55} />
      </mesh>
      {/* holes: dark cylinders inset into the plateau */}
      {SKEE_HOLES.map((h, i) => {
        const p = toWorld(h.x, h.y);
        const ringColor = h.points === 100 ? '#facc15' : h.points === 50 ? '#f97316' : h.points === 30 ? '#22d3ee' : '#a3a3a3';
        return (
          <group key={i} position={p}>
            <mesh position={[0, 0.15, 0]}>
              <cylinderGeometry args={[h.r, h.r, 0.12, 24]} />
              <meshStandardMaterial color="#0c0a09" roughness={0.9} />
            </mesh>
            <mesh position={[0, 0.17, 0]} rotation-x={Math.PI / 2}>
              <torusGeometry args={[h.r, 0.045, 10, 28]} />
              <meshStandardMaterial color={ringColor} emissive={ringColor} emissiveIntensity={0.35} roughness={0.4} />
            </mesh>
          </group>
        );
      })}
      {/* point labels floating above holes */}
      {SKEE_HOLES.map((h, i) => (
        <mesh key={`l${i}`} position={[toWorld(h.x, h.y)[0], 0.85, toWorld(h.x, h.y)[2] - 0.02]} rotation-x={-0.9}>
          <planeGeometry args={[0.6, 0.3]} />
          <meshStandardMaterial map={pointTexture(h.points)} transparent />
        </mesh>
      ))}
    </group>
  );
}

function pointTexture(points: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(15,23,42,0.75)';
  ctx.beginPath();
  ctx.roundRect(0, 0, 128, 64, 14);
  ctx.fill();
  ctx.fillStyle = '#fef08a';
  ctx.font = '700 40px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(points), 64, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** aim arrow at the start position */
export function AimArrow({ angle, color }: { angle: number; color: string }) {
  const ref = useRef<THREE.Group>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((st, dt) => {
    if (ref.current) {
      // engine angle: 0 = +x, π/2 = up-lane (−z in world)
      ref.current.rotation.y = -(angle - Math.PI / 2);
    }
    if (mat.current) {
      mat.current.emissiveIntensity = 0.5 + 0.3 * Math.sin(st.clock.elapsedTime * 4);
    }
    void dt;
  });
  const start = toWorld(3, 1.5);
  return (
    <group ref={ref} position={[start[0], 0.35, start[2]]}>
      <mesh position={[0, 0, -0.8]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.05, 0.05, 1.3, 10]} />
        <meshStandardMaterial ref={mat} color={color} emissive={color} emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[0, 0, -1.6]} rotation-x={-Math.PI / 2}>
        <coneGeometry args={[0.13, 0.3, 10]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

/** ball replaying along the last shot's sampled path */
export function ReplayBall({ shot, color, onDone }: { shot: SkeeShot; color: string; onDone?: () => void }) {
  const ref = useRef<THREE.Mesh>(null);
  const idx = useRef(0);
  const sunk = useRef(0);
  useFrame((st, dt) => {
    if (!ref.current) return;
    const path = shot.path;
    if (idx.current < path.length - 1) {
      idx.current = Math.min(path.length - 1, idx.current + Math.max(1, Math.round(dt * 130)));
      const [x, y] = path[idx.current]!;
      const w = toWorld(x, y);
      ref.current.position.set(w[0], 0.42, w[2]);
    } else if (shot.hole !== null && sunk.current < 1) {
      sunk.current = Math.min(1, sunk.current + dt * 2.4);
      const h = SKEE_HOLES[shot.hole]!;
      const w = toWorld(h.x, h.y);
      ref.current.position.set(w[0], 0.42 - sunk.current * 0.3, w[2]);
      ref.current.scale.setScalar(1 - sunk.current * 0.25);
      if (sunk.current >= 1) onDone?.();
    }
    void st;
  });
  const start = toWorld(shot.path[0]![0], shot.path[0]![1]);
  return (
    <mesh ref={ref} position={[start[0], 0.42, start[2]]} castShadow>
      <sphereGeometry args={[0.24, 20, 16]} />
      <meshStandardMaterial color={color} roughness={0.35} />
    </mesh>
  );
}

/** small resting balls from previous shots (end of their paths) */
export function GhostBalls({ shots, colors }: { shots: SkeeShot[]; colors: string[] }) {
  const shown = useMemo(() => shots.slice(0, -1), [shots]);
  return (
    <group>
      {shown.map((s, i) => {
        const [x, y] = s.path[s.path.length - 1]!;
        const w = toWorld(x, y);
        return (
          <mesh key={i} position={[w[0], 0.36, w[2]]}>
            <sphereGeometry args={[0.2, 14, 12]} />
            <meshStandardMaterial color={colors[s.player % colors.length]} roughness={0.4} transparent opacity={0.65} />
          </mesh>
        );
      })}
    </group>
  );
}
