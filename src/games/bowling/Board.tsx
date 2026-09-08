import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import type { ShopSkin } from '../../core/types';
import { stepWorld, type PhysBody, type PhysConf } from '../_physics/physics';
import { BALL_R, LANE_H, LANE_W, PIN_R, PIN_SPOTS, bowlingConf } from './engine';

/* ------------------------------------------------------------------ */

export function toWorld(x: number, y: number): [number, number, number] {
  // lane: x → world x, y → world -z (pins away from the camera)
  return [x - LANE_W / 2, 0, -y + LANE_H / 2];
}

export function Pin3D({ color = '#f5f0e6', accent = '#c0392b' }: { color?: string; accent?: string }) {
  return (
    <group>
      <mesh castShadow position={[0, 0.09, 0]}>
        <cylinderGeometry args={[0.075, 0.1, 0.18, 14]} />
        <meshStandardMaterial color={color} roughness={0.35} />
      </mesh>
      <mesh castShadow position={[0, 0.26, 0]}>
        <sphereGeometry args={[0.115, 16, 16]} />
        <meshStandardMaterial color={color} roughness={0.35} />
      </mesh>
      <mesh castShadow position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.055, 0.09, 0.16, 14]} />
        <meshStandardMaterial color={color} roughness={0.35} />
      </mesh>
      <mesh castShadow position={[0, 0.51, 0]}>
        <sphereGeometry args={[0.062, 14, 14]} />
        <meshStandardMaterial color={color} roughness={0.35} />
      </mesh>
      {/* neck stripes */}
      <mesh position={[0, 0.45, 0]}>
        <torusGeometry args={[0.062, 0.014, 8, 18]} />
        <meshStandardMaterial color={accent} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.42, 0]}>
        <torusGeometry args={[0.066, 0.014, 8, 18]} />
        <meshStandardMaterial color={accent} roughness={0.4} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */

export interface BowlingAnim {
  bodies: PhysBody[];
  conf: PhysConf;
}

/**
 * Replay: steps the same deterministic physics the engine used and moves the
 * meshes. Standing pins of the *next* state stay; downed pins tilt and fade.
 */
export function BowlingScene({
  standing,
  animRef,
  onAnimDone,
  laneColor,
  ballColor,
}: {
  standing: number[];
  animRef: React.MutableRefObject<BowlingAnim | null>;
  onAnimDone: () => void;
  laneColor: string;
  ballColor: string;
}) {
  const pinRefs = useRef<(THREE.Group | null)[]>([]);
  const ballRef = useRef<THREE.Group>(null);
  const standingSet = useMemo(() => new Set(standing), [standing]);

  useFrame(() => {
    const anim = animRef.current;
    if (!anim) {
      pinRefs.current.forEach((g, i) => {
        if (!g) return;
        const up = standingSet.has(i);
        g.visible = true;
        g.rotation.set(0, 0, 0);
        g.scale.setScalar(1);
        const [x, , z] = toWorld(PIN_SPOTS[i]![0], PIN_SPOTS[i]![1]);
        g.position.set(x, 0, z);
        g.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.material) {
            const mat = mesh.material as THREE.MeshStandardMaterial;
            mat.opacity = up ? 1 : 0.22;
            mat.transparent = !up;
          }
        });
      });
      if (ballRef.current) ballRef.current.visible = false;
      return;
    }
    for (let k = 0; k < 8; k++) stepWorld(anim.bodies, anim.conf);
    let moving = false;
    anim.bodies.forEach((body, bi) => {
      if (body.id === 'ball') {
        if (ballRef.current) {
          const [x, , z] = toWorld(body.x, body.y);
          ballRef.current.visible = !body.pocketed;
          ballRef.current.position.set(x, 0.32, z);
          ballRef.current.rotation.z -= 0.22;
          ballRef.current.rotation.x -= 0.05;
        }
        if (!body.pocketed && (body.vx !== 0 || body.vy !== 0)) moving = true;
        return;
      }
      const idx = Number(body.id.slice(4));
      const g = pinRefs.current[idx];
      if (!g) return;
      g.visible = true;
      const [x, , z] = toWorld(body.x, body.y);
      const [ox, , oz] = toWorld(PIN_SPOTS[idx]![0], PIN_SPOTS[idx]![1]);
      const dx = x - ox;
      const dz = z - oz;
      const moved = Math.hypot(dx, dz);
      g.position.set(x, body.pocketed ? -1.5 : 0, z);
      if (moved > 0.05) {
        g.rotation.set(dz * 2.2, 0, -dx * 2.2);
      }
      if (!body.pocketed && (body.vx !== 0 || body.vy !== 0)) moving = true;
      void bi;
    });
    if (!moving) {
      animRef.current = null;
      onAnimDone();
    }
  });

  return (
    <group>
      <group ref={ballRef}>
        <mesh castShadow>
          <sphereGeometry args={[BALL_R, 24, 24]} />
          <meshStandardMaterial color={ballColor} roughness={0.3} metalness={0.15} />
        </mesh>
        <mesh position={[0, 0, 0]}>
          <torusGeometry args={[BALL_R * 0.999, 0.012, 8, 30]} />
          <meshStandardMaterial color="#ffffff" roughness={0.4} />
        </mesh>
      </group>
      {PIN_SPOTS.map((_, i) => (
        <group
          key={i}
          ref={(el) => {
            pinRefs.current[i] = el;
          }}
        >
          <Pin3D />
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */

export function BowlingLane({ skin }: { skin: ShopSkin }) {
  const wood = skin.colors.wood ?? '#c9a165';
  const gutter = skin.colors.gutter ?? '#2b2317';
  return (
    <group>
      {/* lane */}
      <mesh position={[0, 0, 0]} receiveShadow>
        <boxGeometry args={[LANE_W, 0.22, LANE_H]} />
        <meshStandardMaterial color={wood} roughness={0.55} />
      </mesh>
      {/* gutters */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (LANE_W / 2 + 0.22), -0.06, 0]} receiveShadow>
          <boxGeometry args={[0.44, 0.16, LANE_H]} />
          <meshStandardMaterial color={gutter} roughness={0.4} metalness={0.35} />
        </mesh>
      ))}
      {/* approach dots */}
      {[-0.4, 0, 0.4].map((x) =>
        [1.2, 2].map((z) => (
          <mesh key={`${x}-${z}`} position={[x, 0.12, LANE_H / 2 - z]} rotation-x={-Math.PI / 2}>
            <circleGeometry args={[0.045, 12]} />
            <meshStandardMaterial color="#3a2c1d" />
          </mesh>
        )),
      )}
      {/* pin deck backstop */}
      <mesh position={[0, 0.4, -LANE_H / 2 - 0.4]} castShadow>
        <boxGeometry args={[LANE_W + 0.9, 1, 0.4]} />
        <meshStandardMaterial color={gutter} roughness={0.7} />
      </mesh>
      {/* foul line */}
      <mesh position={[0, 0.115, LANE_H / 2 - 2.6]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[LANE_W, 0.05]} />
        <meshStandardMaterial color="#3a2c1d" />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */

export function BowlingAim({
  angle,
  power,
}: {
  angle: number;
  power: number;
}) {
  const len = 4 + power * 6;
  const dx = Math.sin(angle);
  const dz = -Math.cos(angle);
  const x0 = 0;
  const z0 = LANE_H / 2 - 0.9;
  return (
    <group>
      <mesh position={[x0 + dx * len * 0.5, 0.13, z0 + dz * len * 0.5]} rotation-y={-angle} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[len, 0.06]} />
        <meshStandardMaterial color="#3ddc97" emissive="#3ddc97" emissiveIntensity={0.8} transparent opacity={0.7} />
      </mesh>
      <mesh position={[x0, 0.32, z0]}>
        <sphereGeometry args={[0.34, 20, 20]} />
        <meshStandardMaterial color="#3ddc97" transparent opacity={0.35} emissive="#3ddc97" emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

/** pointer plane over the lane (reports angle relative to straight ahead) */
export function BowlingPointer({
  onMove,
  onClick,
}: {
  onMove: (angle: number) => void;
  onClick: () => void;
}) {
  const handlers = {
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const x = e.point.x;
      const z = e.point.z;
      const dx = x;
      const dz = LANE_H / 2 - 0.9 - z;
      onMove(Math.atan2(dx, dz));
    },
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      onClick();
    },
  };
  return (
    <mesh position={[0, 0.2, 0]} rotation-x={-Math.PI / 2} {...handlers}>
      <planeGeometry args={[LANE_W, LANE_H]} />
      <meshStandardMaterial visible={false} />
    </mesh>
  );
}

/** rebuild the replay world from the state's last shot */
export function buildBowlingReplay(
  standing: number[],
  angle: number,
  power: number,
): BowlingAnim {
  const conf = bowlingConf();
  const bodies: PhysBody[] = [
    { id: 'ball', x: LANE_W / 2, y: 0.9, vx: 0, vy: 0, r: BALL_R, m: 5, pocketed: false },
  ];
  for (const idx of standing) {
    const [x, y] = PIN_SPOTS[idx]!;
    bodies.push({ id: `pin-${idx}`, x, y, vx: 0, vy: 0, r: PIN_R, m: 0.14, pocketed: false });
  }
  const speed = Math.max(3, power * 20);
  bodies[0]!.vx = Math.sin(angle) * speed;
  bodies[0]!.vy = Math.cos(angle) * speed;
  return { bodies, conf };
}

export function useBowlingReplay(
  shotId: number,
  standing: number[],
  angle: number,
  power: number,
  animRef: React.MutableRefObject<BowlingAnim | null>,
): void {
  const last = useRef(shotId);
  useEffect(() => {
    if (shotId !== last.current) {
      last.current = shotId;
      animRef.current = buildBowlingReplay(standing, angle, power);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shotId]);
}
