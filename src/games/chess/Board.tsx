import { useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import type { ShopSkin } from '../../core/types';
import { Damp, finishProps, useMeshClick } from '../../ui/three/shared';
import { legalMoves, type ChessMove, type ChessPiece, type ChessState } from './engine';

const N = 8;
const CELL = 1.05;

function sqPos(idx: number): [number, number, number] {
  const f = idx % 8;
  const r = (idx / 8) | 0;
  // white (rank 0) at the bottom near the camera
  return [(f - 3.5) * CELL, 0, (3.5 - r) * CELL];
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

export function ChessPiece3D({
  piece,
  skin,
  onClick,
}: {
  piece: ChessPiece;
  skin?: Pick<ShopSkin, 'finish' | 'colors'>;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const color = piece.color === 'w' ? (skin?.colors?.w ?? '#efe9dc') : (skin?.colors?.b ?? '#332a26');
  const f = finishProps(skin);
  const emissive = skin?.finish === 'glow' ? color : '#000000';
  const mat = (
    <meshStandardMaterial
      color={color}
      roughness={f.roughness}
      metalness={f.metalness}
      emissive={emissive}
      emissiveIntensity={f.emissiveIntensity * 0.35}
    />
  );
  const click = useMeshClick(onClick);
  const scale = piece.color === 'w' ? 1 : 1;

  return (
    <group {...click} scale={scale}>
      <mesh castShadow position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.3, 0.34, 0.1, 24]} />
        {mat}
      </mesh>
      {piece.type === 'p' && (
        <group>
          <mesh castShadow position={[0, 0.24, 0]}>
            <cylinderGeometry args={[0.13, 0.2, 0.3, 18]} />
            {mat}
          </mesh>
          <mesh castShadow position={[0, 0.47, 0]}>
            <sphereGeometry args={[0.14, 18, 18]} />
            {mat}
          </mesh>
        </group>
      )}
      {piece.type === 'r' && (
        <group>
          <mesh castShadow position={[0, 0.26, 0]}>
            <cylinderGeometry args={[0.19, 0.24, 0.38, 18]} />
            {mat}
          </mesh>
          <mesh castShadow position={[0, 0.5, 0]}>
            <boxGeometry args={[0.42, 0.16, 0.34]} />
            {mat}
          </mesh>
          {[-0.14, 0, 0.14].map((x) => (
            <mesh key={x} castShadow position={[x, 0.63, 0]}>
              <boxGeometry args={[0.11, 0.09, 0.34]} />
              {mat}
            </mesh>
          ))}
        </group>
      )}
      {piece.type === 'n' && (
        <group>
          <mesh castShadow position={[0, 0.25, 0]}>
            <cylinderGeometry args={[0.16, 0.24, 0.36, 18]} />
            {mat}
          </mesh>
          <mesh castShadow position={[0, 0.55, 0.03]} rotation={[0.35, 0, 0]}>
            <boxGeometry args={[0.18, 0.34, 0.3]} />
            {mat}
          </mesh>
          <mesh castShadow position={[0, 0.74, 0.14]} rotation={[0.7, 0, 0]}>
            <boxGeometry args={[0.14, 0.16, 0.26]} />
            {mat}
          </mesh>
          <mesh castShadow position={[-0.09, 0.66, -0.06]} rotation={[0.2, 0, 0.4]}>
            <boxGeometry args={[0.07, 0.14, 0.1]} />
            {mat}
          </mesh>
        </group>
      )}
      {piece.type === 'b' && (
        <group>
          <mesh castShadow position={[0, 0.3, 0]}>
            <cylinderGeometry args={[0.14, 0.23, 0.44, 18]} />
            {mat}
          </mesh>
          <mesh castShadow position={[0, 0.58, 0]}>
            <coneGeometry args={[0.15, 0.26, 18]} />
            {mat}
          </mesh>
          <mesh castShadow position={[0, 0.75, 0]}>
            <sphereGeometry args={[0.07, 14, 14]} />
            {mat}
          </mesh>
        </group>
      )}
      {piece.type === 'q' && (
        <group>
          <mesh castShadow position={[0, 0.3, 0]}>
            <cylinderGeometry args={[0.17, 0.25, 0.46, 20]} />
            {mat}
          </mesh>
          <mesh castShadow position={[0, 0.6, 0]}>
            <sphereGeometry args={[0.17, 20, 20]} />
            {mat}
          </mesh>
          <mesh castShadow position={[0, 0.78, 0]}>
            <torusGeometry args={[0.1, 0.035, 10, 24]} />
            {mat}
          </mesh>
          {Array.from({ length: 5 }, (_, i) => {
            const a = (i / 5) * Math.PI * 2;
            return (
              <mesh key={i} castShadow position={[Math.cos(a) * 0.17, 0.74, Math.sin(a) * 0.17]}>
                <sphereGeometry args={[0.045, 10, 10]} />
                {mat}
              </mesh>
            );
          })}
        </group>
      )}
      {piece.type === 'k' && (
        <group>
          <mesh castShadow position={[0, 0.32, 0]}>
            <cylinderGeometry args={[0.18, 0.26, 0.5, 20]} />
            {mat}
          </mesh>
          <mesh castShadow position={[0, 0.64, 0]}>
            <cylinderGeometry args={[0.2, 0.16, 0.14, 20]} />
            {mat}
          </mesh>
          <mesh castShadow position={[0, 0.84, 0]}>
            <boxGeometry args={[0.07, 0.24, 0.07]} />
            {mat}
          </mesh>
          <mesh castShadow position={[0, 0.87, 0]}>
            <boxGeometry args={[0.2, 0.07, 0.07]} />
            {mat}
          </mesh>
        </group>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Board                                                               */
/* ------------------------------------------------------------------ */

export function ChessBoard({
  state,
  pieceSkin,
  boardSkin,
  viewerSeat,
  interactive,
  selected,
  onSelect,
  onMove,
}: {
  state: ChessState;
  pieceSkin: ShopSkin;
  boardSkin: ShopSkin;
  viewerSeat: 0 | 1;
  interactive: boolean;
  selected: number | null;
  onSelect: (sq: number | null) => void;
  onMove: (move: ChessMove) => void;
}) {
  const light = boardSkin.colors.light ?? '#e8d5b0';
  const dark = boardSkin.colors.dark ?? '#7a5230';
  const rim = boardSkin.colors.rim ?? '#2b2118';

  const targets = useMemo(() => {
    if (selected === null) return [] as ChessMove[];
    return legalMoves(state, viewerSeat === 0 ? 'w' : 'b').filter((m) => m.from === selected);
  }, [state, selected, viewerSeat]);

  const froms = useMemo(() => {
    if (!interactive) return new Set<number>();
    return new Set(legalMoves(state, viewerSeat === 0 ? 'w' : 'b').map((m) => m.from));
  }, [state, interactive, viewerSeat]);

  const last = state.lastMove;
  const kingInCheckSq = useMemo(() => {
    // highlight own king when in check
    return null as number | null;
  }, [state]);

  const clickSquare = (idx: number) => {
    if (!interactive) return;
    const piece = state.board[idx];
    if (selected !== null) {
      const move = targets.find((m) => m.to === idx);
      if (move) {
        onMove(move);
        onSelect(null);
        return;
      }
    }
    if (piece && piece.color === (viewerSeat === 0 ? 'w' : 'b') && froms.has(idx)) {
      onSelect(selected === idx ? null : idx);
    } else {
      onSelect(null);
    }
  };

  return (
    <group rotation-y={viewerSeat === 1 ? Math.PI : 0}>
      <RoundedBox args={[N * CELL + 0.9, 0.5, N * CELL + 0.9]} radius={0.2} smoothness={4} position={[0, -0.28, 0]} receiveShadow>
        <meshStandardMaterial color={rim} roughness={0.65} metalness={0.15} />
      </RoundedBox>
      {Array.from({ length: 64 }, (_, i) => {
        const f = i % 8;
        const r = (i / 8) | 0;
        const isDark = (f + r) % 2 === 1;
        const pos = sqPos(i);
        const isSel = selected === i;
        const isTarget = targets.some((m) => m.to === i);
        const isLast = last && (last.from === i || last.to === i);
        return (
          <group key={i} position={pos}>
            <mesh
              receiveShadow
              rotation-x={-Math.PI / 2}
              onClick={(e) => {
                e.stopPropagation();
                clickSquare(i);
              }}
            >
              <planeGeometry args={[CELL, CELL]} />
              <meshStandardMaterial
                color={isDark ? dark : light}
                roughness={0.9}
                emissive={isSel ? '#7c5cff' : isLast ? '#f59e0b' : '#000000'}
                emissiveIntensity={isSel ? 0.35 : isLast ? 0.22 : 0}
              />
            </mesh>
            {isTarget && state.board[i] === null && (
              <mesh position={[0, 0.02, 0]} rotation-x={-Math.PI / 2}>
                <circleGeometry args={[0.13, 20]} />
                <meshStandardMaterial color="#3ddc97" emissive="#3ddc97" emissiveIntensity={0.8} />
              </mesh>
            )}
            {isTarget && state.board[i] !== null && (
              <mesh position={[0, 0.02, 0]} rotation-x={-Math.PI / 2}>
                <ringGeometry args={[0.34, 0.44, 28]} />
                <meshStandardMaterial color="#fb7185" emissive="#fb7185" emissiveIntensity={0.8} side={THREE.DoubleSide} />
              </mesh>
            )}
          </group>
        );
      })}

      {state.board.map((piece, i) =>
        piece ? (
          <Damp key={`p-${i}-${piece.color}${piece.type}`} target={sqPos(i)} speed={9}>
            <group position={[0, 0.02, 0]}>
              {selected === i && (
                <mesh position={[0, -0.19, 0]} rotation-x={-Math.PI / 2}>
                  <ringGeometry args={[0.38, 0.46, 30]} />
                  <meshStandardMaterial color="#7c5cff" emissive="#7c5cff" emissiveIntensity={0.9} side={THREE.DoubleSide} />
                </mesh>
              )}
              <ChessPiece3D
                piece={piece}
                skin={pieceSkin}
                onClick={
                  interactive
                    ? () => {
                        if (selected !== null && targets.some((m) => m.to === i)) {
                          const move = targets.find((m) => m.to === i)!;
                          onMove(move);
                          onSelect(null);
                        } else {
                          clickSquare(i);
                        }
                      }
                    : undefined
                }
              />
            </group>
          </Damp>
        ) : null,
      )}
      {kingInCheckSq !== null && null}
    </group>
  );
}
