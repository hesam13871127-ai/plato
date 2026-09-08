import { useMemo, useState } from 'react';
import * as THREE from 'three';
import type { ShopSkin } from '../../core/types';
import type { DotsAction, DotsState } from './engine';
import { edgeIndex } from './engine';

const N = 4; // boxes per side
const GAP = 1.5;

/** dot (r, c) → world position (r: 0..N rows of dots) */
function dotPos(r: number, c: number): [number, number, number] {
  return [(c - N / 2) * GAP, 0, (r - N / 2) * GAP];
}

/** midpoint + orientation of an edge */
function edgePos(kind: 'h' | 'v', r: number, c: number): { pos: [number, number, number]; horizontal: boolean } {
  if (kind === 'h') {
    const d = dotPos(r, c);
    const d2 = dotPos(r, c + 1);
    return { pos: [(d[0] + d2[0]) / 2, 0, d[2]], horizontal: true };
  }
  const d = dotPos(r, c);
  const d2 = dotPos(r + 1, c);
  return { pos: [d[0], 0, (d[2] + d2[2]) / 2], horizontal: false };
}

function boxPos(r: number, c: number): [number, number, number] {
  const d = dotPos(r, c);
  return [d[0] + GAP / 2, 0, d[2] + GAP / 2];
}

const PLAYER_COLORS = ['#8b5cf6', '#f59e0b', '#22d3ee', '#fb7185'];

export function DotsBoard({
  state,
  boardSkin,
  interactive,
  onLine,
}: {
  state: DotsState;
  boardSkin: ShopSkin;
  interactive: boolean;
  onLine: (action: DotsAction) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const light = boardSkin.colors.light ?? '#efe6d5';
  const rim = boardSkin.colors.rim ?? '#3a2c1d';

  const hEdges = useMemo(() => {
    const out: { r: number; c: number; owner: number }[] = [];
    for (let r = 0; r <= N; r++) {
      for (let c = 0; c < N; c++) {
        const idx = edgeIndex('h', r, c, N)!;
        const owner = state.h[idx]!;
        if (owner !== -1) out.push({ r, c, owner });
      }
    }
    return out;
  }, [state.h]);

  const vEdges = useMemo(() => {
    const out: { r: number; c: number; owner: number }[] = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c <= N; c++) {
        const idx = edgeIndex('v', r, c, N)!;
        const owner = state.v[idx]!;
        if (owner !== -1) out.push({ r, c, owner });
      }
    }
    return out;
  }, [state.v]);

  const Line = ({ kind, r, c, owner, ghost }: { kind: 'h' | 'v'; r: number; c: number; owner: number; ghost?: boolean }) => {
    const { pos, horizontal } = edgePos(kind, r, c);
    const color = PLAYER_COLORS[owner % 4]!;
    return (
      <mesh position={[pos[0], 0.06, pos[2]]} rotation-z={horizontal ? 0 : Math.PI / 2} castShadow>
        <boxGeometry args={[GAP * 0.92, 0.12, 0.12]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={ghost ? 0.25 : 0.5}
          transparent={ghost}
          opacity={ghost ? 0.35 : 1}
          roughness={0.4}
        />
      </mesh>
    );
  };

  return (
    <group>
      {/* base */}
      <mesh position={[0, -0.15, 0]} receiveShadow>
        <boxGeometry args={[N * GAP + 1, 0.24, N * GAP + 1]} />
        <meshStandardMaterial color={rim} roughness={0.7} />
      </mesh>
      <mesh position={[0, -0.02, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[N * GAP + 0.7, N * GAP + 0.7]} />
        <meshStandardMaterial color={light} roughness={0.95} />
      </mesh>

      {/* claimed boxes */}
      {state.boxes.map((owner, i) => {
        if (owner === -1) return null;
        const r = (i / N) | 0;
        const c = i % N;
        const pos = boxPos(r, c);
        return (
          <mesh key={`b-${i}`} position={[pos[0], 0.015, pos[2]]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[GAP * 0.86, GAP * 0.86]} />
            <meshStandardMaterial color={PLAYER_COLORS[owner % 4]!} transparent opacity={0.35} roughness={0.6} />
          </mesh>
        );
      })}

      {/* dots */}
      {Array.from({ length: (N + 1) * (N + 1) }, (_, i) => {
        const r = (i / (N + 1)) | 0;
        const c = i % (N + 1);
        const pos = dotPos(r, c);
        return (
          <mesh key={`d-${i}`} position={[pos[0], 0.03, pos[2]]} castShadow>
            <sphereGeometry args={[0.14, 16, 16]} />
            <meshStandardMaterial color="#3a3450" roughness={0.5} />
          </mesh>
        );
      })}

      {/* drawn lines */}
      {hEdges.map((e) => (
        <Line key={`h-${e.r}-${e.c}`} kind="h" r={e.r} c={e.c} owner={e.owner} />
      ))}
      {vEdges.map((e) => (
        <Line key={`v-${e.r}-${e.c}`} kind="v" r={e.r} c={e.c} owner={e.owner} />
      ))}

      {/* hover ghost + click targets */}
      {interactive && (
        <>
          {Array.from({ length: (N + 1) * N }, (_, i) => {
            const r = (i / N) | 0;
            const c = i % N;
            if (state.h[edgeIndex('h', r, c, N)!] !== -1) return null;
            const key = `h-${r}-${c}`;
            const hovered = hover === key;
            return (
              <group key={`hh-${key}`}>
                {hovered && <Line kind="h" r={r} c={c} owner={state.turn} ghost />}
                <mesh
                  position={[edgePos('h', r, c).pos[0], 0.06, edgePos('h', r, c).pos[2]]}
                  rotation-z={0}
                  onPointerOver={(e) => {
                    e.stopPropagation();
                    setHover(key);
                  }}
                  onPointerOut={() => setHover((h) => (h === key ? null : h))}
                  onClick={(e) => {
                    e.stopPropagation();
                    onLine({ type: 'line', kind: 'h', r, c });
                  }}
                  visible={false}
                >
                  <boxGeometry args={[GAP, 0.4, 0.5]} />
                </mesh>
              </group>
            );
          })}
          {Array.from({ length: N * (N + 1) }, (_, i) => {
            const r = (i / (N + 1)) | 0;
            const c = i % (N + 1);
            if (state.v[edgeIndex('v', r, c, N)!] !== -1) return null;
            const key = `v-${r}-${c}`;
            const hovered = hover === key;
            return (
              <group key={`vh-${key}`}>
                {hovered && <Line kind="v" r={r} c={c} owner={state.turn} ghost />}
                <mesh
                  position={[edgePos('v', r, c).pos[0], 0.06, edgePos('v', r, c).pos[2]]}
                  onPointerOver={(e) => {
                    e.stopPropagation();
                    setHover(key);
                  }}
                  onPointerOut={() => setHover((h) => (h === key ? null : h))}
                  onClick={(e) => {
                    e.stopPropagation();
                    onLine({ type: 'line', kind: 'v', r, c });
                  }}
                  visible={false}
                >
                  <boxGeometry args={[0.5, 0.4, GAP]} />
                </mesh>
              </group>
            );
          })}
        </>
      )}
    </group>
  );
}

export { PLAYER_COLORS as DOTS_PLAYER_COLORS, dotPos as dotsDotPos };
export type { DotsState as DotsBoardState };
export const DOTS_N = N;
export const DOTS_GAP = GAP;
export type ThreeNamespace = typeof THREE;
