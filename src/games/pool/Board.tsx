import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import type { ShopSkin } from '../../core/types';
import { stepWorld, type PhysBody, type PhysConf } from '../_physics/physics';
import { ballTexture } from '../../ui/three/textures';
import { BALL_R, POCKET_R, POOL_H, POOL_W, poolConf, type PoolState } from './engine';

const BALL_R3 = BALL_R;

/** engine coords → world (table centered at origin, y up) */
export function toWorld(x: number, y: number): [number, number, number] {
  return [x - POOL_W / 2, BALL_R3, y - POOL_H / 2];
}

/* ------------------------------------------------------------------ */

export interface PoolAnim {
  bodies: PhysBody[];
  conf: PhysConf;
}

/**
 * Renders all balls; when `anim.current` holds a replay world it steps the
 * physics 8× per frame (≈480Hz) and writes positions straight to the meshes.
 */
export function PoolBalls({
  state,
  animRef,
  onAnimDone,
}: {
  state: PoolState;
  animRef: React.MutableRefObject<PoolAnim | null>;
  onAnimDone: () => void;
}) {
  const meshes = useRef<(THREE.Group | null)[]>([]);

  useFrame(() => {
    const anim = animRef.current;
    if (!anim) {
      // rest positions from the authoritative state
      state.balls.forEach((b, i) => {
        const g = meshes.current[i];
        if (!g) return;
        g.visible = !b.pocketed;
        g.position.set(...toWorld(b.x, b.y));
      });
      return;
    }
    for (let k = 0; k < 8; k++) stepWorld(anim.bodies, anim.conf);
    let moving = false;
    anim.bodies.forEach((body, i) => {
      const g = meshes.current[i];
      if (!g) return;
      g.visible = !body.pocketed;
      g.position.set(...toWorld(body.x, body.y));
      if (!body.pocketed && (body.vx !== 0 || body.vy !== 0)) moving = true;
    });
    if (!moving) {
      animRef.current = null;
      onAnimDone();
    }
  });

  return (
    <group>
      {state.balls.map((b, i) => (
        <group
          key={b.id}
          ref={(el) => {
            meshes.current[i] = el;
          }}
        >
          <mesh castShadow>
            <sphereGeometry args={[BALL_R3, 22, 22]} />
            <meshStandardMaterial map={ballTexture(b.num)} roughness={0.22} metalness={0.05} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */

function PocketHole({ x, y }: { x: number; y: number }) {
  const [wx, , wz] = toWorld(x, y);
  return (
    <group position={[wx, 0.015, wz]}>
      <mesh rotation-x={-Math.PI / 2}>
        <circleGeometry args={[POCKET_R, 26]} />
        <meshStandardMaterial color="#0b0a10" roughness={1} />
      </mesh>
      <mesh position={[0, 0.005, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[POCKET_R, POCKET_R + 0.07, 26]} />
        <meshStandardMaterial color="#2b2317" roughness={0.8} metalness={0.3} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */

export function PoolTable({ skin }: { skin: ShopSkin }) {
  const felt = skin.colors.felt ?? '#1a6b48';
  const rail = skin.colors.rail ?? '#4a3623';
  const W = POOL_W + 1.2;
  const H = POOL_H + 1.2;
  return (
    <group>
      <RoundedBox args={[W, 0.75, H]} radius={0.18} smoothness={4} position={[0, -0.36, 0]} receiveShadow castShadow>
        <meshStandardMaterial color={rail} roughness={0.6} metalness={0.15} />
      </RoundedBox>
      <mesh position={[0, 0.005, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[POOL_W + 0.28, POOL_H + 0.28]} />
        <meshStandardMaterial color={felt} roughness={0.97} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */

export function CueStick({
  from,
  angle,
  pullback,
}: {
  from: [number, number, number];
  angle: number;
  pullback: number;
}) {
  const len = 3.4;
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  const buttX = from[0] - dx * (BALL_R3 + 0.25 + pullback);
  const buttZ = from[2] - dz * (BALL_R3 + 0.25 + pullback);
  const tipX = from[0] - dx * (BALL_R3 + 0.06 + pullback + len);
  const tipZ = from[2] - dz * (BALL_R3 + 0.06 + pullback + len);
  const cx = (buttX + tipX) / 2;
  const cz = (buttZ + tipZ) / 2;
  const rotY = -angle;
  return (
    <group position={[cx, from[1] + 0.18, cz]} rotation-y={rotY} rotation-z={0.06}>
      <mesh castShadow rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.045, 0.075, len, 12]} />
        <meshStandardMaterial color="#c89b5e" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0, len / 2 - 0.02]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.045, 0.045, 0.16, 12]} />
        <meshStandardMaterial color="#2244aa" roughness={0.4} />
      </mesh>
    </group>
  );
}

export function AimGuide({
  from,
  to,
  color,
}: {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
}) {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const len = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  if (len < 0.05) return null;
  return (
    <group>
      <mesh position={[(from[0] + to[0]) / 2, 0.03, (from[2] + to[2]) / 2]} rotation-y={-angle} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[len, 0.025]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} transparent opacity={0.85} />
      </mesh>
      <mesh position={[to[0], 0.03, to[2]]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[BALL_R3 - 0.02, BALL_R3 + 0.03, 26]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** Invisible plane over the felt that reports pointer positions in engine coords. */
export function TablePointer({
  onMove,
  onClick,
}: {
  onMove?: (x: number, y: number) => void;
  onClick?: (x: number, y: number) => void;
}) {
  const handlers = useMemo(
    () => ({
      onPointerMove: (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onMove?.(e.point.x + POOL_W / 2, e.point.z + POOL_H / 2);
      },
      onPointerDown: (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onClick?.(e.point.x + POOL_W / 2, e.point.z + POOL_H / 2);
      },
    }),
    [onMove, onClick],
  );
  return (
    <mesh position={[0, 0.02, 0]} rotation-x={-Math.PI / 2} {...handlers}>
      <planeGeometry args={[POOL_W, POOL_H]} />
      <meshStandardMaterial visible={false} />
    </mesh>
  );
}

export function PoolPockets() {
  return (
    <group>
      <PocketHole x={0} y={0} />
      <PocketHole x={POOL_W / 2} y={0} />
      <PocketHole x={POOL_W} y={0} />
      <PocketHole x={0} y={POOL_H} />
      <PocketHole x={POOL_W / 2} y={POOL_H} />
      <PocketHole x={POOL_W} y={POOL_H} />
    </group>
  );
}

/** Build a replay world from the state's last shot (deterministic re-sim). */
export function buildReplay(state: PoolState): PoolAnim | null {
  const shot = state.lastShot;
  if (!shot) return null;
  const conf = poolConf();
  const bodies: PhysBody[] = shot.snapshot
    .filter((b) => !b.pocketed)
    .map((b) => ({
      id: b.id,
      x: b.x,
      y: b.y,
      vx: 0,
      vy: 0,
      r: BALL_R,
      m: 1,
      pocketed: false,
    }));
  const cue = bodies.find((b) => b.id === 'cue');
  if (!cue) return null;
  const speed = Math.max(2, shot.power * 26);
  cue.x = shot.cueX;
  cue.y = shot.cueY;
  cue.vx = Math.cos(shot.angle) * speed;
  cue.vy = Math.sin(shot.angle) * speed;
  return { bodies, conf };
}

/** Fire-and-forget helper used by Play to trigger replays on new shots. */
export function useShotReplay(
  state: PoolState,
  animRef: React.MutableRefObject<PoolAnim | null>,
): void {
  const lastId = useRef(state.shotId);
  useEffect(() => {
    if (state.shotId !== lastId.current) {
      lastId.current = state.shotId;
      animRef.current = buildReplay(state);
    }
  }, [state.shotId, state, animRef]);
}
