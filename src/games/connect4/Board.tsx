import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { ShopSkin } from '../../core/types';
import { finishProps } from '../../ui/three/shared';
import { c4PanelTexture } from '../../ui/three/textures';
import { C4_COLS, C4_ROWS, type C4State } from './engine';

const CELL = 1.1;
const CENTER_Y = 3.4;
const BOARD_Z = 0;

export function colX(col: number): number {
  return (col - (C4_COLS - 1) / 2) * CELL;
}
export function rowY(row: number): number {
  return CENTER_Y + (row - (C4_ROWS - 1) / 2) * CELL;
}

/** A disc that spawns above and falls to its resting row. */
function Disc({
  col,
  row,
  color,
  finishSkin,
  highlight,
}: {
  col: number;
  row: number;
  color: string;
  finishSkin?: ShopSkin;
  highlight?: boolean;
}) {
  const ref = useRef<THREE.Group>(null);
  const started = useRef(false);
  const bounce = useRef(0);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const d = Math.min(dt, 0.05);
    if (!started.current) {
      g.position.y = rowY(C4_ROWS) + 2.2;
      started.current = true;
    }
    const rest = rowY(row);
    const newY = THREE.MathUtils.damp(g.position.y, rest, 11, d);
    if (Math.abs(newY - rest) < 0.02 && bounce.current === 0) bounce.current = 0.001;
    if (bounce.current > 0 && bounce.current < 1) {
      bounce.current = Math.min(1, bounce.current + d * 3.2);
      g.position.y = rest + Math.sin(bounce.current * Math.PI) * 0.16;
    } else {
      g.position.y = newY;
    }
  });
  const f = finishProps(finishSkin);
  return (
    <group ref={ref} position={[colX(col), rowY(row), BOARD_Z]}>
      <mesh castShadow rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.44, 0.44, 0.18, 36]} />
        <meshStandardMaterial
          color={color}
          roughness={f.roughness}
          metalness={f.metalness}
          emissive={highlight ? '#ffd166' : color}
          emissiveIntensity={highlight ? 0.55 : f.emissiveIntensity * 0.2}
        />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, 0, 0.095]}>
        <torusGeometry args={[0.3, 0.045, 10, 30]} />
        <meshStandardMaterial
          color={color}
          roughness={f.roughness}
          metalness={f.metalness}
          emissive={highlight ? '#ffd166' : '#000'}
          emissiveIntensity={highlight ? 0.5 : 0}
        />
      </mesh>
    </group>
  );
}

function GhostDisc({ col, color }: { col: number; color: string }) {
  return (
    <mesh position={[colX(col), rowY(C4_ROWS) + 0.9, BOARD_Z]} rotation-x={Math.PI / 2}>
      <cylinderGeometry args={[0.42, 0.42, 0.14, 30]} />
      <meshStandardMaterial color={color} transparent opacity={0.45} emissive={color} emissiveIntensity={0.3} />
    </mesh>
  );
}

export function Connect4Board({
  state,
  pieceSkin,
  boardSkin,
  interactive,
  myColor,
  onDrop,
}: {
  state: C4State;
  pieceSkin: ShopSkin;
  boardSkin: ShopSkin;
  interactive: boolean;
  myColor: string;
  onDrop: (col: number) => void;
}) {
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const frame = boardSkin.colors.frame ?? '#1d4ed8';
  const c0 = pieceSkin.colors.p0 ?? '#ef4444';
  const c1 = pieceSkin.colors.p1 ?? '#facc15';
  const panelTexture = useMemo(() => c4PanelTexture(frame), [frame]);
  const winningSet = useMemo(() => new Set(state.winning.map(([c, r]) => `${c}-${r}`)), [state.winning]);

  return (
    <group>
      {/* base platform */}
      <mesh receiveShadow castShadow position={[0, 0.05, BOARD_Z]}>
        <boxGeometry args={[C4_COLS * CELL + 1.1, 0.35, 1.7]} />
        <meshStandardMaterial color={frame} roughness={0.5} metalness={0.2} />
      </mesh>
      {/* pillars + top bar */}
      {[-1, 1].map((side) => (
        <mesh key={side} castShadow position={[side * (C4_COLS * CELL) / 2 + side * 0.25, CENTER_Y, BOARD_Z]}>
          <boxGeometry args={[0.5, C4_ROWS * CELL + 1.15, 0.95]} />
          <meshStandardMaterial color={frame} roughness={0.5} metalness={0.2} />
        </mesh>
      ))}
      <mesh castShadow position={[0, CENTER_Y + (C4_ROWS * CELL) / 2 + 0.6, BOARD_Z]}>
        <boxGeometry args={[C4_COLS * CELL + 1.1, 0.5, 0.95]} />
        <meshStandardMaterial color={frame} roughness={0.5} metalness={0.2} />
      </mesh>

      {/* perforated panel (alpha-tested texture) */}
      <mesh position={[0, CENTER_Y, BOARD_Z + 0.36]}>
        <planeGeometry args={[C4_COLS * CELL, C4_ROWS * CELL]} />
        <meshStandardMaterial map={panelTexture} transparent alphaTest={0.5} roughness={0.55} metalness={0.1} side={THREE.DoubleSide} />
      </mesh>

      {/* discs */}
      {state.grid.map((column, c) =>
        column.map((v, r) =>
          v === 0 ? null : (
            <Disc
              key={`${c}-${r}`}
              col={c}
              row={r}
              color={v === 1 ? c0 : c1}
              finishSkin={pieceSkin}
              highlight={winningSet.has(`${c}-${r}`)}
            />
          ),
        ),
      )}

      {/* interaction layer */}
      {interactive &&
        Array.from({ length: C4_COLS }, (_, c) => (
          <group key={`hit-${c}`}>
            <mesh
              position={[colX(c), CENTER_Y, BOARD_Z + 0.8]}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHoverCol(c);
              }}
              onPointerOut={() => setHoverCol((h) => (h === c ? null : h))}
              onClick={(e) => {
                e.stopPropagation();
                onDrop(c);
              }}
              visible={false}
            >
              <boxGeometry args={[CELL, C4_ROWS * CELL + 1.6, 1.4]} />
            </mesh>
          </group>
        ))}
      {interactive && hoverCol !== null && (
        <>
          <mesh position={[colX(hoverCol), CENTER_Y, BOARD_Z - 0.05]}>
            <boxGeometry args={[CELL * 0.92, C4_ROWS * CELL + 0.9, 0.08]} />
            <meshStandardMaterial color="#ffffff" transparent opacity={0.07} emissive="#ffffff" emissiveIntensity={0.08} />
          </mesh>
          <GhostDisc col={hoverCol} color={myColor} />
        </>
      )}
    </group>
  );
}
