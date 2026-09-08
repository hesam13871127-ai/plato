import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import type { ShopSkin } from '../../core/types';
import { Damp, finishProps, useMeshClick } from '../../ui/three/shared';
import { dieFaceTexture } from '../../ui/three/textures';
import {
  HOME_COL,
  LUDO_COLORS,
  LUDO_STARTS,
  SAFE_CELLS,
  TRACK,
  YARD_ANCHOR,
  cellOf,
  type LudoState,
} from './engine';

const CELL = 1;
const BOARD_N = 15;

function cellPos(r: number, c: number): [number, number, number] {
  return [c - (BOARD_N - 1) / 2, 0, r - (BOARD_N - 1) / 2];
}

const YARD_SLOT_OFFSETS: [number, number][] = [
  [-0.75, -0.75],
  [0.75, -0.75],
  [-0.75, 0.75],
  [0.75, 0.75],
];

const DIE_POS: [number, number, number][] = [
  [-4.5, 0.75, -4.5],
  [4.5, 0.75, -4.5],
  [4.5, 0.75, 4.5],
  [-4.5, 0.75, 4.5],
];

const FINISH_DIR: [number, number][] = [
  [-1, 0],
  [0, -1],
  [1, 0],
  [0, 1],
];

/* ------------------------------------------------------------------ */

/** Target world position of a token. */
export function tokenTarget(player: number, index: number, step: number): [number, number, number] {
  if (step === -1) {
    const [ar, ac] = YARD_ANCHOR[player] ?? [0, 0];
    const [dz, dx] = YARD_SLOT_OFFSETS[index] ?? [0, 0];
    return cellPos(ar + dz, ac + dx);
  }
  if (step <= 50) {
    const cell = cellOf(player, step);
    const rc = TRACK[cell] ?? [7, 7];
    return cellPos(rc[0], rc[1]);
  }
  if (step <= 55) {
    const rc = (HOME_COL[player] ?? [])[step - 51] ?? [7, 7];
    return cellPos(rc[0], rc[1]);
  }
  // finished: cluster in the center triangle of the owner
  const [dirX, dirZ] = FINISH_DIR[player] ?? [0, 1];
  const perpX = -dirZ;
  const perpZ = dirX;
  const spread = (index - 1.5) * 0.32;
  return [dirX * 1.05 + perpX * spread, 0.05, dirZ * 1.05 + perpZ * spread];
}

/* ------------------------------------------------------------------ */

export function LudoPawn({
  color,
  skin,
  onClick,
}: {
  color: string;
  skin?: Pick<ShopSkin, 'finish'>;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const f = finishProps(skin);
  const emissive = skin?.finish === 'gem' || skin?.finish === 'glow' ? color : '#000000';
  const click = useMeshClick(onClick);
  return (
    <group {...click}>
      <mesh castShadow position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.2, 0.24, 0.1, 24]} />
        <meshStandardMaterial color={color} roughness={f.roughness} metalness={f.metalness} emissive={emissive} emissiveIntensity={f.emissiveIntensity * 0.4} />
      </mesh>
      <mesh castShadow position={[0, 0.16, 0]}>
        <cylinderGeometry args={[0.07, 0.15, 0.2, 20]} />
        <meshStandardMaterial color={color} roughness={f.roughness} metalness={f.metalness} emissive={emissive} emissiveIntensity={f.emissiveIntensity * 0.4} />
      </mesh>
      <mesh castShadow position={[0, 0.33, 0]}>
        <sphereGeometry args={[0.12, 20, 20]} />
        <meshStandardMaterial color={color} roughness={f.roughness} metalness={f.metalness} emissive={emissive} emissiveIntensity={f.emissiveIntensity * 0.5} />
      </mesh>
    </group>
  );
}

function MovableRing() {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      const t = clock.getElapsedTime();
      ref.current.scale.setScalar(1 + Math.sin(t * 4) * 0.12);
    }
  });
  return (
    <group ref={ref} position={[0, 0.02, 0]}>
      <mesh rotation-x={-Math.PI / 2}>
        <torusGeometry args={[0.3, 0.045, 10, 32]} />
        <meshStandardMaterial color="#3ddc97" emissive="#3ddc97" emissiveIntensity={1.1} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */

export function Die3D({
  value,
  spinning,
  position,
  colors,
}: {
  value: number | null;
  spinning: boolean;
  position: [number, number, number];
  colors: { face: string; pip: string };
}) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    const d = Math.min(dt, 0.05);
    if (spinning) {
      m.rotation.x += d * 7;
      m.rotation.y += d * 5;
      m.rotation.z += d * 2;
    } else {
      m.rotation.x = THREE.MathUtils.damp(m.rotation.x, 0, 8, d);
      m.rotation.y = THREE.MathUtils.damp(m.rotation.y, 0, 8, d);
      m.rotation.z = THREE.MathUtils.damp(m.rotation.z, 0, 8, d);
    }
  });
  const v = value ?? 6;
  const faces = useMemo(() => {
    const f = (n: number) => dieFaceTexture(n, colors);
    return [f(2), f(5), f(v), f(1), f(v), f(3)]; // +x,-x,+y,-y,+z,-z — top & front show the value
  }, [v, colors.face, colors.pip]);
  return (
    <Damp target={position} speed={4}>
      <mesh ref={ref} castShadow position={[0, 0.32, 0]}>
        <boxGeometry args={[0.95, 0.95, 0.95]} />
        {faces.map((map, i) => (
          <meshStandardMaterial key={i} attach={`material-${i}`} map={map} roughness={0.35} />
        ))}
      </mesh>
    </Damp>
  );
}

/* ------------------------------------------------------------------ */

function triangleShape(points: [number, number][]): THREE.Shape {
  const shape = new THREE.Shape();
  const first = points[0]!;
  shape.moveTo(first[0], -first[1]);
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    shape.lineTo(p[0], -p[1]);
  }
  shape.closePath();
  return shape;
}

function BoardBase({ skin }: { skin: ShopSkin }) {
  const base = skin.colors.base ?? '#f2ecdd';
  const rim = skin.colors.rim ?? '#3a2c1d';
  const cellColor = skin.colors.cell ?? '#f7f2e3';
  const cellMat = <meshStandardMaterial color={cellColor} roughness={0.85} />;

  const triangles: { pts: [number, number][]; color: string }[] = [
    { pts: [[-1.45, -1.45], [-1.45, 1.45], [0, 0]], color: LUDO_COLORS[0]! },
    { pts: [[-1.45, -1.45], [1.45, -1.45], [0, 0]], color: LUDO_COLORS[1]! },
    { pts: [[1.45, -1.45], [1.45, 1.45], [0, 0]], color: LUDO_COLORS[2]! },
    { pts: [[-1.45, 1.45], [1.45, 1.45], [0, 0]], color: LUDO_COLORS[3]! },
  ];

  return (
    <group>
      <RoundedBox args={[16.4, 0.5, 16.4]} radius={0.3} smoothness={4} position={[0, -0.32, 0]} receiveShadow>
        <meshStandardMaterial color={rim} roughness={0.7} metalness={0.15} />
      </RoundedBox>
      <RoundedBox args={[15.7, 0.22, 15.7]} radius={0.12} smoothness={4} position={[0, -0.05, 0]} receiveShadow>
        <meshStandardMaterial color={base} roughness={0.9} />
      </RoundedBox>

      {/* main track */}
      {TRACK.map((rc, i) => {
        const startIdx = (LUDO_STARTS as readonly number[]).indexOf(i);
        const isStart = startIdx >= 0;
        const isStar = !isStart && SAFE_CELLS.has(i);
        return (
          <group key={`t-${i}`} position={cellPos(rc[0], rc[1])}>
            <mesh receiveShadow castShadow position={[0, 0.06, 0]}>
              <boxGeometry args={[0.94, 0.12, 0.94]} />
              {isStart ? (
                <meshStandardMaterial color={LUDO_COLORS[startIdx]!} roughness={0.6} />
              ) : (
                cellMat
              )}
            </mesh>
            {isStar && (
              <mesh position={[0, 0.14, 0]}>
                <sphereGeometry args={[0.09, 12, 12]} />
                <meshStandardMaterial color="#c9b8ff" emissive="#8f7bff" emissiveIntensity={0.9} />
              </mesh>
            )}
          </group>
        );
      })}

      {/* home columns */}
      {HOME_COL.map((col, p) =>
        col.map((rc, i) => (
          <mesh key={`h-${p}-${i}`} receiveShadow castShadow position={[...cellPos(rc[0], rc[1]).slice(0, 1), 0.06, ...cellPos(rc[0], rc[1]).slice(2)] as [number, number, number]}>
            <boxGeometry args={[0.94, 0.12, 0.94]} />
            <meshStandardMaterial color={LUDO_COLORS[p]!} roughness={0.65} />
          </mesh>
        )),
      )}

      {/* center home */}
      <mesh receiveShadow position={[0, 0.06, 0]}>
        <boxGeometry args={[2.9, 0.12, 2.9]} />
        <meshStandardMaterial color="#241d31" roughness={0.9} />
      </mesh>
      {triangles.map((tri, i) => (
        <mesh key={`c-${i}`} position={[0, 0.135, 0]} rotation-x={-Math.PI / 2}>
          <shapeGeometry args={[triangleShape(tri.pts)]} />
          <meshStandardMaterial color={tri.color} roughness={0.55} />
        </mesh>
      ))}

      {/* yards */}
      {YARD_ANCHOR.map((anchor, p) => {
        const [ar, ac] = anchor;
        const [x, , z] = cellPos(ar, ac);
        const color = LUDO_COLORS[p]!;
        return (
          <group key={`y-${p}`} position={[x, 0, z]}>
            <RoundedBox args={[5.5, 0.14, 5.5]} radius={0.1} smoothness={3} position={[0, 0.05, 0]} receiveShadow>
              <meshStandardMaterial color={color} roughness={0.7} />
            </RoundedBox>
            <RoundedBox args={[3.4, 0.12, 3.4]} radius={0.1} smoothness={3} position={[0, 0.11, 0]} receiveShadow>
              <meshStandardMaterial color={cellColor} roughness={0.85} />
            </RoundedBox>
            {YARD_SLOT_OFFSETS.map(([dz, dx], i) => (
              <mesh key={i} position={[dx, 0.17, dz]} rotation-x={-Math.PI / 2}>
                <circleGeometry args={[0.42, 28]} />
                <meshStandardMaterial color={color} transparent opacity={0.35} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

/* ------------------------------------------------------------------ */

export function LudoBoard({
  state,
  pieceSkin,
  boardSkin,
  movable,
  onTokenClick,
  spinning,
}: {
  state: LudoState;
  pieceSkin: ShopSkin;
  boardSkin: ShopSkin;
  /** token indices the human on turn may move (their seat) */
  movable: number[];
  onTokenClick: (token: number) => void;
  spinning: boolean;
}) {
  const diceColors = { face: '#fbf5e4', pip: '#221d15' };
  const actorsSeat = state.turn;

  return (
    <>
      <BoardBase skin={boardSkin} />
      {state.tokens.map((hand, p) =>
        hand.map((tok, i) => {
          const movableNow = p === actorsSeat && p < state.playerCount && movable.includes(i);
          return (
            <Damp key={`${p}-${i}`} target={tokenTarget(p, i, tok.step)} lift={0.55} speed={7}>
              <group position={[0, 0.12, 0]}>
                {movableNow && <MovableRing />}
                <LudoPawn
                  color={LUDO_COLORS[p]!}
                  skin={pieceSkin}
                  onClick={movableNow ? () => onTokenClick(i) : undefined}
                />
              </group>
            </Damp>
          );
        }),
      )}
      <Die3D value={state.dice} spinning={spinning} position={DIE_POS[state.turn % 4]!} colors={diceColors} />
    </>
  );
}
