import { useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import type { ShopSkin } from '../../core/types';
import { Damp, useMeshClick } from '../../ui/three/shared';
import { snakesBoardTexture } from '../../ui/three/textures';
import { LADDERS, SNAKES, cellRC, type SnakesState } from './engine';

const BOARD = 10;
const CELL = 1;
const BOARD_W = BOARD * CELL;

/** cell number (1..100) → world position (row 0 = bottom = cells 1..10) */
export function cellPos(cell: number): [number, number, number] {
  if (cell <= 0) {
    // off-board start area under cell 1
    return [-1.6, 0.12, (BOARD_W / 2) - CELL / 2];
  }
  const [row, col] = cellRC(cell);
  return [(col - (BOARD - 1) / 2) * CELL, 0.12, ((BOARD - 1) / 2 - row) * CELL];
}

const SEAT_COLORS = ['#8b5cf6', '#f59e0b', '#22d3ee', '#fb7185'];

/** small meeple with a rounded head */
export function SnakesMeeple({
  color,
  onClick,
}: {
  color: string;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const click = useMeshClick(onClick);
  return (
    <group {...click}>
      <mesh castShadow position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.16, 0.2, 0.12, 18]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0, 0.2, 0]}>
        <capsuleGeometry args={[0.11, 0.14, 6, 14]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0, 0.38, 0]}>
        <sphereGeometry args={[0.14, 16, 16]} />
        <meshStandardMaterial color={color} roughness={0.45} />
      </mesh>
    </group>
  );
}

export function SnakesBoard({
  state,
  boardSkin,
  onRoll,
  canRoll,
}: {
  state: SnakesState;
  boardSkin: ShopSkin;
  onRoll: () => void;
  canRoll: boolean;
}) {
  const light = boardSkin.colors.light ?? '#f2e9d8';
  const dark = boardSkin.colors.dark ?? '#d8c7a9';
  const line = boardSkin.colors.line ?? 'rgba(60,40,20,0.5)';
  const texture = useMemo(() => snakesBoardTexture({ light, dark, line }, SNAKES, LADDERS), [light, dark, line]);

  return (
    <group>
      <RoundedBox args={[BOARD_W + 1.2, 0.5, BOARD_W + 1.2]} radius={0.22} smoothness={4} position={[0, -0.26, 0]} receiveShadow castShadow>
        <meshStandardMaterial color={boardSkin.colors.rim ?? '#7a5230'} roughness={0.7} />
      </RoundedBox>
      <mesh position={[0, 0, 0]} receiveShadow>
        <boxGeometry args={[BOARD_W + 0.3, 0.14, BOARD_W + 0.3]} />
        <meshStandardMaterial color="#efe6d5" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.075, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[BOARD_W, BOARD_W]} />
        <meshStandardMaterial map={texture} roughness={0.85} />
      </mesh>

      {/* start pad */}
      <mesh position={[-1.6, 0.08, (BOARD_W / 2) - CELL / 2]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[1.1, BOARD_W * 0.999]} />
        <meshStandardMaterial color="#1c6b4a" roughness={0.9} transparent opacity={0.25} />
      </mesh>

      {/* finish glow */}
      <mesh position={[cellPos(100)[0], 0.082, cellPos(100)[2]]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.3, 0.48, 30]} />
        <meshStandardMaterial color="#ffd166" emissive="#ffd166" emissiveIntensity={0.9} side={THREE.DoubleSide} />
      </mesh>

      {/* meeples */}
      {state.pos.map((cell, p) => {
        const base = cellPos(cell);
        // spread meeples sharing a cell slightly
        const off: [number, number][] = [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]];
        const [dx, dz] = off[p % 4]!;
        return (
          <Damp key={p} target={[base[0] + dx, 0.1, base[2] + dz]} lift={1.4} speed={5}>
            <SnakesMeeple color={SEAT_COLORS[p % 4]!} />
          </Damp>
        );
      })}
    </group>
  );
}

export { SEAT_COLORS as SNAKES_SEAT_COLORS };
