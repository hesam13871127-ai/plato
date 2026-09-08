import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { R8, reversiLegalIdxs } from './engine';

const TILE = 0.72;

/** a disc that pops in when placed and flips over when captured */
function Disc({ value, fresh, position }: { value: number; fresh: boolean; position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  const spin = useRef(0);
  useFrame((st, dt) => {
    if (!ref.current) return;
    if (fresh) spin.current = Math.PI; // flip animation target
    if (spin.current > 0.001) {
      spin.current = THREE.MathUtils.damp(spin.current, 0, 8, dt);
      ref.current.rotation.x = spin.current;
    }
    const want = 1;
    ref.current.scale.setScalar(THREE.MathUtils.damp(ref.current.scale.x, want, 10, dt));
    void st;
  });
  const dark = value === 1;
  return (
    <group ref={ref} position={position} scale={fresh ? 0.01 : 1}>
      {/* body */}
      <mesh castShadow position={[0, 0.07, 0]}>
        <cylinderGeometry args={[TILE * 0.42, TILE * 0.42, 0.09, 24]} />
        <meshStandardMaterial
          color={dark ? '#18181b' : '#f4f4f5'}
          roughness={0.35}
          metalness={0.15}
        />
      </mesh>
      {/* top sheen */}
      <mesh position={[0, 0.118, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[TILE * 0.42, 24]} />
        <meshStandardMaterial
          color={dark ? '#27272a' : '#ffffff'}
          roughness={0.25}
          metalness={0.2}
        />
      </mesh>
    </group>
  );
}

export function ReversiScene({
  board,
  turn,
  lastEvent,
  interactive,
  onMove,
  boardColor,
  lineColor,
  accent,
}: {
  board: number[];
  turn: number;
  lastEvent: { player: number; idx: number; flipped: number[] } | null;
  interactive: boolean;
  onMove: (idx: number) => void;
  boardColor: string;
  lineColor: string;
  accent: string;
}) {
  const legal = useMemo(() => (interactive ? reversiLegalIdxs(board, turn) : []), [board, turn, interactive]);
  const legalSet = useMemo(() => new Set(legal), [legal]);
  const freshSet = useMemo(() => {
    const s = new Set<number>();
    if (lastEvent) {
      s.add(lastEvent.idx);
      for (const f of lastEvent.flipped) s.add(f);
    }
    return s;
  }, [lastEvent]);

  return (
    <group>
      {/* base */}
      <RoundedBox args={[R8 * TILE + 0.75, 0.5, R8 * TILE + 0.75]} radius={0.16} smoothness={3} position={[0, -0.32, 0]} receiveShadow>
        <meshStandardMaterial color={lineColor} roughness={0.7} />
      </RoundedBox>
      {/* cells */}
      {Array.from({ length: R8 * R8 }, (_, i) => {
        const x = (i % R8) - (R8 - 1) / 2;
        const y = Math.floor(i / R8) - (R8 - 1) / 2;
        const pos: [number, number, number] = [x * TILE, 0, y * TILE];
        const clickable = legalSet.has(i);
        return (
          <group key={i}>
            <mesh
              position={pos}
              rotation-x={-Math.PI / 2}
              receiveShadow
              onPointerOver={(e: ThreeEvent<PointerEvent>) => {
                if (clickable) {
                  void e.stopPropagation();
                  document.body.style.cursor = 'pointer';
                }
              }}
              onPointerOut={() => {
                document.body.style.cursor = 'auto';
              }}
              onPointerDown={(e: ThreeEvent<PointerEvent>) => {
                if (clickable) {
                  void e.stopPropagation();
                  onMove(i);
                }
              }}
            >
              <planeGeometry args={[TILE - 0.06, TILE - 0.06]} />
              <meshStandardMaterial
                color={(i % R8 + Math.floor(i / R8)) % 2 === 0 ? boardColor : shade(boardColor, 1.12)}
                roughness={0.85}
              />
            </mesh>
            {board[i] !== 0 && <Disc value={board[i]!} fresh={freshSet.has(i)} position={pos} />}
            {clickable && board[i] === 0 && (
              <mesh position={[pos[0], 0.02, pos[2]]} rotation-x={-Math.PI / 2}>
                <ringGeometry args={[0.1, 0.17, 20]} />
                <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.7} transparent opacity={0.9} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

function shade(hex: string, mul: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(mul);
  return `#${c.getHexString()}`;
}
