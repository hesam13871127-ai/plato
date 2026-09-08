import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import type { ShopSkin } from '../../core/types';
import { stepWorld, type PhysBody, type PhysConf } from '../_physics/physics';
import {
  BASELINE_Y,
  CARROM_H,
  CARROM_W,
  COIN_R,
  STRIKER_R,
  carromConf,
  type CarromState,
} from './engine';

export function toWorld(x: number, y: number, h = COIN_R): [number, number, number] {
  return [x - CARROM_W / 2, h, y - CARROM_H / 2];
}

export interface CarromAnim {
  bodies: PhysBody[];
  conf: PhysConf;
}

const DEFAULT_COIN_COLORS: Record<string, string> = {
  white: '#f3ead8',
  black: '#26201c',
  queen: '#c0392b',
};

export function Coin3D({ kind, colors }: { kind: string; colors?: Record<string, string> }) {
  return (
    <group>
      <mesh castShadow rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[COIN_R, COIN_R, 0.09, 26]} />
        <meshStandardMaterial color={(colors ?? DEFAULT_COIN_COLORS)[kind] ?? '#ccc'} roughness={0.45} metalness={0.1} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, 0, 0.05]}>
        <torusGeometry args={[COIN_R * 0.55, 0.018, 8, 24]} />
        <meshStandardMaterial color={kind === 'queen' ? '#ffd166' : '#4d423b'} roughness={0.5} />
      </mesh>
    </group>
  );
}

export function Striker3D() {
  return (
    <mesh castShadow rotation-x={Math.PI / 2}>
      <cylinderGeometry args={[STRIKER_R, STRIKER_R, 0.12, 30]} />
      <meshStandardMaterial color="#e8e2d2" roughness={0.35} metalness={0.2} emissive="#8f7bff" emissiveIntensity={0.12} />
    </mesh>
  );
}

/** Animated replay of the last strike + rest positions. */
export function CarromPieces({
  state,
  coinColors,
  animRef,
  onAnimDone,
}: {
  state: CarromState;
  coinColors?: Record<string, string>;
  animRef: React.MutableRefObject<CarromAnim | null>;
  onAnimDone: () => void;
}) {
  const coinRefs = useRef<(THREE.Group | null)[]>([]);
  const strikerRef = useRef<THREE.Group>(null);

  useFrame(() => {
    const anim = animRef.current;
    if (!anim) {
      state.coins.forEach((c, i) => {
        const g = coinRefs.current[i];
        if (!g) return;
        g.visible = !c.pocketed;
        g.position.set(...toWorld(c.x, c.y));
      });
      if (strikerRef.current) {
        const sx = state.lastShot?.strikerX ?? CARROM_W / 2;
        strikerRef.current.position.set(...toWorld(sx, BASELINE_Y[state.turn]!, STRIKER_R));
        strikerRef.current.visible = state.phase === 'aim';
      }
      return;
    }
    for (let k = 0; k < 8; k++) stepWorld(anim.bodies, anim.conf);
    let moving = false;
    const striker = anim.bodies[0]!;
    if (strikerRef.current) {
      strikerRef.current.visible = !striker.pocketed;
      strikerRef.current.position.set(...toWorld(striker.x, striker.y, STRIKER_R));
    }
    if (!striker.pocketed && (striker.vx !== 0 || striker.vy !== 0)) moving = true;
    anim.bodies.slice(1).forEach((body, k) => {
      const g = coinRefs.current[k];
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
      {state.coins.map((c, i) => (
        <group
          key={c.id}
          ref={(el) => {
            coinRefs.current[i] = el;
          }}
        >
          <Coin3D kind={c.kind} colors={coinColors} />
        </group>
      ))}
      <group ref={strikerRef}>
        <Striker3D />
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */

export function CarromBoardBase({ skin }: { skin: ShopSkin }) {
  const wood = skin.colors.wood ?? '#8a5a2b';
  const frame = skin.colors.frame ?? '#5a3a1c';
  const lines = skin.colors.lines ?? 'rgba(60,30,10,0.55)';
  const texture = useRef<THREE.CanvasTexture | null>(null);
  if (!texture.current) {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 1024;
    const ctx = c.getContext('2d')!;
    // playing surface
    ctx.fillStyle = wood;
    ctx.fillRect(0, 0, 1024, 1024);
    // subtle grain
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(0,0,0,${0.02 + Math.random() * 0.03})`;
      ctx.fillRect(0, Math.random() * 1024, 1024, 2 + Math.random() * 5);
    }
    const px = (v: number) => v * (1024 / 6); // engine units → px
    ctx.strokeStyle = lines;
    ctx.lineWidth = 3;
    // outer decorative border
    ctx.strokeRect(px(0.45), px(0.45), px(5.1), px(5.1));
    // baselines (both sides): two parallel lines with circles at the ends
    for (const y of [0.95, 5.05]) {
      ctx.beginPath();
      ctx.moveTo(px(1.15), px(y) - 8);
      ctx.lineTo(px(4.85), px(y) - 8);
      ctx.moveTo(px(1.15), px(y) + 8);
      ctx.lineTo(px(4.85), px(y) + 8);
      ctx.stroke();
      for (const x of [1.15, 4.85]) {
        ctx.beginPath();
        ctx.arc(px(x), px(y), 14, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // center circles
    ctx.beginPath();
    ctx.arc(px(3), px(3), px(0.75), 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px(3), px(3), px(0.16), 0, Math.PI * 2);
    ctx.stroke();
    // diagonal arrows toward pockets
    for (const [sx, sy] of [[1, 1], [5, 1], [1, 5], [5, 5]]) {
      ctx.save();
      ctx.translate(px(sx), px(sy));
      const ang = Math.atan2(3 - sy, 3 - sx);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(-20, -10);
      ctx.lineTo(26, 0);
      ctx.lineTo(-20, 10);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    texture.current = t;
  }
  return (
    <group>
      <RoundedBox args={[7.1, 0.5, 7.1]} radius={0.2} smoothness={4} position={[0, -0.3, 0]} receiveShadow castShadow>
        <meshStandardMaterial color={frame} roughness={0.6} metalness={0.12} />
      </RoundedBox>
      <mesh position={[0, 0.002, 0]} receiveShadow>
        <boxGeometry args={[6.9, 0.12, 6.9]} />
        <meshStandardMaterial color={wood} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.07, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[6, 6]} />
        <meshStandardMaterial map={texture.current} roughness={0.8} transparent />
      </mesh>
      {/* pockets */}
      {[[0, 0], [6, 0], [0, 6], [6, 6]].map(([x, y]) => {
        const [wx, , wz] = toWorld(x, y, 0);
        return (
          <mesh key={`${x}-${y}`} position={[wx, 0.062, wz]}>
            <cylinderGeometry args={[0.52, 0.52, 0.1, 26]} />
            <meshStandardMaterial color="#141018" roughness={1} />
          </mesh>
        );
      })}
    </group>
  );
}

/* ------------------------------------------------------------------ */

export function CarromAim({
  strikerX,
  seat,
  aim,
}: {
  strikerX: number;
  seat: 0 | 1;
  aim: { x: number; y: number } | null;
}) {
  const sy = BASELINE_Y[seat]!;
  if (!aim) return null;
  const from = toWorld(strikerX, sy, STRIKER_R + 0.02);
  const to = toWorld(aim.x, aim.y, STRIKER_R + 0.02);
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const len = Math.hypot(dx, dz);
  if (len < 0.05) return null;
  const angle = Math.atan2(dz, dx);
  return (
    <group>
      <mesh position={[(from[0] + to[0]) / 2, 0.09, (from[2] + to[2]) / 2]} rotation-y={-angle} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[len, 0.035]} />
        <meshStandardMaterial color="#3ddc97" emissive="#3ddc97" emissiveIntensity={0.9} transparent opacity={0.85} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export function CarromPointer({
  onMove,
  onClick,
}: {
  onMove: (x: number, y: number) => void;
  onClick: (x: number, y: number) => void;
}) {
  return (
    <mesh
      position={[0, 0.15, 0]}
      rotation-x={-Math.PI / 2}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onMove(e.point.x + CARROM_W / 2, e.point.z + CARROM_H / 2);
      }}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onClick(e.point.x + CARROM_W / 2, e.point.z + CARROM_H / 2);
      }}
    >
      <planeGeometry args={[CARROM_W, CARROM_H]} />
      <meshStandardMaterial visible={false} />
    </mesh>
  );
}

/** Replay builder for carrom strikes. */
export function buildCarromReplay(state: CarromState): CarromAnim | null {
  const shot = state.lastShot;
  if (!shot) return null;
  const conf = carromConf();
  const bodies: PhysBody[] = [
    { id: 'striker', x: shot.strikerX, y: shot.strikerY, vx: 0, vy: 0, r: STRIKER_R, m: 1, pocketed: false },
  ];
  for (const c of shot.snapshot) {
    if (c.pocketed) continue;
    bodies.push({ id: c.id, x: c.x, y: c.y, vx: 0, vy: 0, r: COIN_R, m: 0.75, pocketed: false });
  }
  const striker = bodies[0]!;
  const speed = Math.max(2, shot.power * 18);
  striker.vx = Math.cos(shot.angle) * speed;
  striker.vy = Math.sin(shot.angle) * speed;
  return { bodies, conf };
}

export function useCarromShotReplay(
  state: CarromState,
  animRef: React.MutableRefObject<CarromAnim | null>,
): void {
  const lastId = useRef(state.shotId);
  useEffect(() => {
    if (state.shotId !== lastId.current) {
      lastId.current = state.shotId;
      animRef.current = buildCarromReplay(state);
    }
  }, [state.shotId, state, animRef]);
}
