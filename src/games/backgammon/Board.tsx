import { useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import type { ShopSkin } from '../../core/types';
import { Damp, useMeshClick } from '../../ui/three/shared';
import { pipCount, type BackgammonState } from './engine';

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

const PIT_W = 1.05;
const BOARD_H = 7.6; // z size
const HALF = BOARD_H / 2;

/** point index (0..23) → [x, z, top] — top row is the far side (p1's home on the right) */
export function pointPos(i: number): { x: number; top: boolean; dir: 1 | -1 } {
  // bottom row (near camera), right→left: indices 0..11  (point 1..12)
  // top row (far), left→right: indices 12..23 (point 13..24)
  if (i < 12) {
    const col = 11 - i; // right to left
    return { x: (col - 5.5) * PIT_W, top: false, dir: -1 };
  }
  const col = i - 12; // left to right
  return { x: (col - 5.5) * PIT_W, top: true, dir: 1 };
}

const BAR_X = 0;

function stackPos(i: number, k: number): [number, number, number] {
  const { x, top, dir } = pointPos(i);
  const z0 = top ? -HALF + 0.55 : HALF - 0.55;
  const z = z0 + dir * k * 0.34;
  const y = 0.12 + Math.min(k, 4) * 0.13;
  return [x, y, z];
}

function barPos(player: number, k: number): [number, number, number] {
  const z = player === 0 ? HALF * 0.55 : -HALF * 0.55;
  return [BAR_X, 0.12 + Math.min(k, 4) * 0.13, z - k * 0.05];
}

/* ------------------------------------------------------------------ */
/* Board                                                               */
/* ------------------------------------------------------------------ */

export function BackgammonBoard({
  state,
  boardSkin,
  pieceColors,
  viewerSeat,
  interactive,
  selected, // 'bar' | point index | null
  targets, // { to: number | 'off'; die: number }[]
  onSelect,
  onMove,
}: {
  state: BackgammonState;
  boardSkin: ShopSkin;
  pieceColors?: { p0?: string; p1?: string };
  viewerSeat: 0 | 1;
  interactive: boolean;
  selected: number | 'bar' | null;
  targets: { to: number | 'off'; die: number }[];
  onSelect: (from: number | 'bar' | null) => void;
  onMove: (from: number | 'bar', to: number | 'off', die: number) => void;
}) {
  const frame = boardSkin.colors.frame ?? '#4a3623';
  const felt = boardSkin.colors.felt ?? '#2c4a3a';
  const p0Color = pieceColors?.p0 ?? '#efe6d2';
  const p1Color = pieceColors?.p1 ?? '#3b2f2a';

  const triColor = (i: number) => (i % 2 === 0 ? boardSkin.colors.triA ?? '#d9c9a8' : boardSkin.colors.triB ?? '#7a5230');

  const triangleBottom = useMemo(() => makeTriangle(1, PIT_W * 0.92, 2.7), []);
  const triangleTop = useMemo(() => makeTriangle(-1, PIT_W * 0.92, 2.7), []);

  const targetPoints = useMemo(() => new Set(targets.map((t) => (t.to === 'off' ? -2 : t.to))), [targets]);

  return (
    <group rotation-y={viewerSeat === 1 ? Math.PI : 0}>
      <RoundedBox args={[13.6, 0.55, BOARD_H + 0.8]} radius={0.24} smoothness={4} position={[0, -0.3, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={frame} roughness={0.6} metalness={0.15} />
      </RoundedBox>
      <mesh position={[0, 0.01, 0]} receiveShadow>
        <boxGeometry args={[13, 0.1, BOARD_H]} />
        <meshStandardMaterial color={felt} roughness={0.95} />
      </mesh>

      {/* points (triangles) */}
      {Array.from({ length: 24 }, (_, i) => {
        const { x, top } = pointPos(i);
        const shape = top ? triangleTop : triangleBottom;
        return (
          <mesh key={`t-${i}`} position={[x, 0.07, top ? -HALF + 1.35 : HALF - 1.35]} rotation-x={-Math.PI / 2}>
            <shapeGeometry args={[shape]} />
            <meshStandardMaterial
              color={triColor(i)}
              roughness={0.8}
              emissive={targetPoints.has(i) ? '#3ddc97' : '#000000'}
              emissiveIntensity={targetPoints.has(i) ? 0.28 : 0}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}

      {/* bar */}
      <mesh position={[BAR_X, 0.06, 0]} receiveShadow>
        <boxGeometry args={[0.85, 0.12, BOARD_H]} />
        <meshStandardMaterial color={frame} roughness={0.65} />
      </mesh>

      {/* bear-off trays */}
      {[
        { x: -6.55, player: 0 },
        { x: 6.55, player: 1 },
      ].map(({ x, player }) => (
        <group key={`off-${player}`} position={[x, 0, 0]}>
          <mesh position={[0, 0.1, 0]} castShadow>
            <boxGeometry args={[1.05, 0.5, BOARD_H * 0.62]} />
            <meshStandardMaterial color={player === 0 ? p0Color : p1Color} roughness={0.7} />
          </mesh>
          {Array.from({ length: state.borneOff[player] ?? 0 }, (_, k) => (
            <mesh key={k} position={[0, 0.4 + k * 0.09, BOARD_H * 0.31 - k * 0.017]} castShadow>
              <cylinderGeometry args={[0.4, 0.4, 0.09, 22]} />
              <meshStandardMaterial color={player === 0 ? p0Color : p1Color} roughness={0.55} />
            </mesh>
          ))}
        </group>
      ))}

      {/* checkers */}
      {state.points.map((v, i) => {
        if (v === 0) return null;
        const player = v > 0 ? 0 : 1;
        const count = Math.abs(v);
        const isSel = selected === i;
        return Array.from({ length: count }, (_, k) => (
          <Checker
            key={`c-${i}-${k}`}
            position={stackPos(i, k)}
            color={player === 0 ? p0Color : p1Color}
            selected={isSel && k === count - 1}
            onClick={
              interactive
                ? (_e: ThreeEvent<MouseEvent>) => {
                    onSelect(i);
                  }
                : undefined
            }
          />
        ));
      })}

      {/* bar checkers */}
      {[0, 1].map((player) =>
        Array.from({ length: state.bar[player] ?? 0 }, (_, k) => (
          <Checker
            key={`bar-${player}-${k}`}
            position={barPos(player, k)}
            color={player === 0 ? p0Color : p1Color}
            selected={selected === 'bar'}
            onClick={
              interactive && player === viewerSeat
                ? () => onSelect('bar')
                : undefined
            }
          />
        )),
      )}

      {/* bear-off target zone */}
      {targetPoints.has(-2) && (
        <mesh
          position={[viewerSeat === 0 ? -6.55 : 6.55, 0.75, 0]}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            const t = targets.find((x) => x.to === 'off');
            if (t && selected !== null) onMove(selected, 'off', t.die);
          }}
        >
          <boxGeometry args={[1.2, 1.2, BOARD_H * 0.7]} />
          <meshStandardMaterial color="#3ddc97" transparent opacity={0.2} emissive="#3ddc97" emissiveIntensity={0.25} />
        </mesh>
      )}
    </group>
  );
}

function Checker({
  position,
  color,
  selected,
  onClick,
}: {
  position: [number, number, number];
  color: string;
  selected?: boolean;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const click = useMeshClick(onClick);
  return (
    <group position={position}>
      <mesh castShadow {...click}>
        <cylinderGeometry args={[0.42, 0.42, 0.13, 24]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.065, 0]} rotation-x={-Math.PI / 2}>
        <torusGeometry args={[0.26, 0.03, 8, 22]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      {selected && (
        <mesh position={[0, 0.14, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.4, 0.52, 26]} />
          <meshStandardMaterial color="#7c5cff" emissive="#7c5cff" emissiveIntensity={0.9} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

function makeTriangle(dirZ: 1 | -1, w: number, h: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, dirZ * h);
  s.closePath();
  return s;
}
