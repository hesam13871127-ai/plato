import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import type { ShopSkin } from '../../core/types';
import { Damp, finishProps, useMeshClick } from '../../ui/three/shared';
import type { CheckersAction, CheckersState, Square } from './engine';

const N = 8;
const CELL = 1.1;

function sqPos(r: number, c: number): [number, number, number] {
  return [(c - (N - 1) / 2) * CELL, 0, (r - (N - 1) / 2) * CELL];
}

/* ------------------------------------------------------------------ */

export function CheckerPiece({
  color,
  king,
  skin,
  onClick,
}: {
  color: string;
  king?: boolean;
  skin?: Pick<ShopSkin, 'finish'>;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const f = finishProps(skin);
  const emissive = skin?.finish === 'gem' || skin?.finish === 'glow' ? color : '#000000';
  const click = useMeshClick(onClick);
  return (
    <group {...click}>
      <mesh castShadow position={[0, 0.09, 0]}>
        <cylinderGeometry args={[0.42, 0.45, 0.16, 32]} />
        <meshStandardMaterial color={color} roughness={f.roughness} metalness={f.metalness} emissive={emissive} emissiveIntensity={f.emissiveIntensity * 0.25} />
      </mesh>
      <mesh castShadow position={[0, 0.16, 0]}>
        <torusGeometry args={[0.3, 0.055, 12, 32]} />
        <meshStandardMaterial color={color} roughness={f.roughness} metalness={f.metalness} emissive={emissive} emissiveIntensity={f.emissiveIntensity * 0.25} />
      </mesh>
      {king && (
        <group position={[0, 0.24, 0]}>
          <mesh castShadow>
            <torusGeometry args={[0.2, 0.05, 10, 28]} />
            <meshStandardMaterial color="#ffd166" metalness={0.85} roughness={0.25} emissive="#ffd166" emissiveIntensity={0.35} />
          </mesh>
          <mesh castShadow position={[0, 0.07, 0]}>
            <coneGeometry args={[0.13, 0.2, 5]} />
            <meshStandardMaterial color="#ffd166" metalness={0.85} roughness={0.25} emissive="#ffd166" emissiveIntensity={0.35} />
          </mesh>
        </group>
      )}
    </group>
  );
}

function TargetDisc({ r, c, onClick }: { r: number; c: number; onClick: () => void }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.scale.setScalar(1 + Math.sin(clock.getElapsedTime() * 3.5) * 0.1);
  });
  const click = useMeshClick(() => onClick());
  return (
    <group ref={ref} position={[sqPos(r, c)[0], 0.06, sqPos(r, c)[2]]}>
      <mesh rotation-x={-Math.PI / 2} {...click}>
        <ringGeometry args={[0.3, 0.48, 28]} />
        <meshStandardMaterial color="#3ddc97" emissive="#3ddc97" emissiveIntensity={1} side={THREE.DoubleSide} transparent opacity={0.95} />
      </mesh>
      <mesh
        visible={false}
        position={[0, 0.3, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <boxGeometry args={[CELL, 0.6, CELL]} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */

export function CheckersBoard({
  state,
  pieceSkin,
  boardSkin,
  viewerSeat,
  interactive,
  selected,
  legal,
  onSelect,
  onMove,
}: {
  state: CheckersState;
  pieceSkin: ShopSkin;
  boardSkin: ShopSkin;
  viewerSeat: 0 | 1;
  interactive: boolean;
  selected: Square | null;
  legal: CheckersAction[];
  onSelect: (sq: Square | null) => void;
  onMove: (action: CheckersAction) => void;
}) {
  const light = boardSkin.colors.light ?? '#e8d5b0';
  const dark = boardSkin.colors.dark ?? '#7a5230';
  const rim = boardSkin.colors.rim ?? '#3a2c1d';
  const p0 = pieceSkin.colors.p0 ?? '#f0e6d2';
  const p1 = pieceSkin.colors.p1 ?? '#3b2f2a';

  const selectableFroms = useMemo(() => {
    if (!interactive) return new Set<string>();
    return new Set(legal.map((a) => `${a.from[0]}-${a.from[1]}`));
  }, [legal, interactive]);

  const targets = useMemo(() => {
    if (!selected) return [];
    return legal.filter((a) => a.from[0] === selected[0] && a.from[1] === selected[1]);
  }, [legal, selected]);

  const clickSquare = (r: number, c: number) => {
    if (!interactive) return;
    const key = `${r}-${c}`;
    if (selectableFroms.has(key)) {
      onSelect(selected && selected[0] === r && selected[1] === c ? null : [r, c]);
      return;
    }
    const action = targets.find((a) => a.to[0] === r && a.to[1] === c);
    if (action) {
      onMove(action);
      onSelect(null);
    }
  };

  return (
    <group>
      <RoundedBox args={[N * CELL + 0.9, 0.55, N * CELL + 0.9]} radius={0.22} smoothness={4} position={[0, -0.3, 0]} receiveShadow>
        <meshStandardMaterial color={rim} roughness={0.7} metalness={0.12} />
      </RoundedBox>
      {Array.from({ length: N * N }, (_, i) => {
        const r = Math.floor(i / N);
        const c = i % N;
        const isDark = (r + c) % 2 === 1;
        return (
          <mesh
            key={i}
            receiveShadow
            position={[sqPos(r, c)[0], 0.02, sqPos(r, c)[2]]}
            rotation-x={-Math.PI / 2}
            onClick={(e) => {
              e.stopPropagation();
              clickSquare(r, c);
            }}
          >
            <planeGeometry args={[CELL, CELL]} />
            <meshStandardMaterial color={isDark ? dark : light} roughness={0.85} />
          </mesh>
        );
      })}

      {state.board.map((row, r) =>
        row.map((piece, c) => {
          if (!piece) return null;
          const key = `${r}-${c}`;
          const isMine = piece.player === viewerSeat;
          const selectable = isMine && selectableFroms.has(key);
          const isSelected = selected && selected[0] === r && selected[1] === c;
          return (
            <Damp key={key} target={[sqPos(r, c)[0], 0.02, sqPos(r, c)[2]]} speed={8}>
              <group position={[0, isSelected ? 0.28 : 0, 0]}>
                {selectable && (
                  <mesh rotation-x={-Math.PI / 2} position={[0, -0.12, 0]}>
                    <ringGeometry args={[0.5, 0.6, 30]} />
                    <meshStandardMaterial color="#3ddc97" emissive="#3ddc97" emissiveIntensity={0.8} side={THREE.DoubleSide} />
                  </mesh>
                )}
                <CheckerPiece
                  color={piece.player === 0 ? p0 : p1}
                  king={piece.king}
                  skin={pieceSkin}
                  onClick={
                    interactive
                      ? () => {
                          if (selectable) onSelect(isSelected ? null : [r, c]);
                          else if (isSelected) onSelect(null);
                        }
                      : undefined
                  }
                />
              </group>
            </Damp>
          );
        }),
      )}

      {targets.map((a) => (
        <TargetDisc key={`${a.to[0]}-${a.to[1]}`} r={a.to[0]} c={a.to[1]} onClick={() => onMove(a)} />
      ))}
    </group>
  );
}
