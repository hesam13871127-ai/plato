import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import type { SeaState } from './engine';
import { GRID } from './engine';

/* ------------------------------------------------------------------ */

const TILE = 0.62;

function cellPos(i: number, cx: number, cz: number): [number, number, number] {
  const x = i % GRID;
  const y = Math.floor(i / GRID);
  return [(x - (GRID - 1) / 2) * TILE + cx, 0, (y - (GRID - 1) / 2) * TILE + cz];
}

function Peg({ hit, position }: { hit: boolean; position: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((st, dt) => {
    if (ref.current) {
      const want = 0.16;
      ref.current.scale.setScalar(THREE.MathUtils.damp(ref.current.scale.x, want, 9, dt));
      ref.current.position.y = want / 2 + 0.03;
    }
    void st;
  });
  return (
    <mesh ref={ref} position={position} scale={0.01} castShadow>
      <cylinderGeometry args={[0.09, 0.11, 0.3, 12]} />
      <meshStandardMaterial
        color={hit ? '#ef4444' : '#e8e8f2'}
        emissive={hit ? '#ef4444' : '#000000'}
        emissiveIntensity={hit ? 0.5 : 0}
        roughness={0.4}
      />
    </mesh>
  );
}

/** one board panel: 10×10 tiles + optional ships/pegs + click targets */
function SeaPanel({
  center: [cx, cz],
  label,
  water,
  ships,
  shots,
  sunkCells,
  interactive,
  onFire,
  accent,
}: {
  center: [number, number];
  label: string;
  water: string;
  /** own fleet cells (rendered as ship hulls) */
  ships: number[];
  /** shots on this board */
  shots: { x: number; y: number; hit: boolean }[];
  /** announced sunk cells (rendered as wrecks) */
  sunkCells: number[];
  interactive: boolean;
  onFire?: (x: number, y: number) => void;
  accent: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shipSet = new Set(ships);
  const sunkSet = new Set(sunkCells);
  const shotMap = new Map(shots.map((s) => [s.y * GRID + s.x, s]));
  return (
    <group>
      {/* label strip */}
      <mesh position={[cx, 0.03, cz - GRID * TILE / 2 - 0.65]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[GRID * TILE, 0.5]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.25} roughness={0.5} />
      </mesh>
      {/* water base */}
      <RoundedBox args={[GRID * TILE + 0.7, 0.4, GRID * TILE + 1.4]} radius={0.18} smoothness={3} position={[cx, -0.22, cz]} receiveShadow>
        <meshStandardMaterial color={water} roughness={0.85} />
      </RoundedBox>
      {/* cells */}
      {Array.from({ length: GRID * GRID }, (_, i) => {
        const pos = cellPos(i, cx, cz);
        const shot = shotMap.get(i);
        const isShip = shipSet.has(i);
        const isSunk = sunkSet.has(i);
        const clickable = interactive && !shot;
        return (
          <group key={i}>
            <mesh
              position={pos}
              rotation-x={-Math.PI / 2}
              receiveShadow
              onPointerOver={(e: ThreeEvent<PointerEvent>) => {
                if (clickable) {
                  setHover(i);
                  void e.stopPropagation();
                  document.body.style.cursor = 'pointer';
                }
              }}
              onPointerOut={() => {
                setHover(null);
                document.body.style.cursor = 'auto';
              }}
              onPointerDown={(e: ThreeEvent<PointerEvent>) => {
                if (clickable) {
                  void e.stopPropagation();
                  onFire?.(i % GRID, Math.floor(i / GRID));
                }
              }}
            >
              <planeGeometry args={[TILE - 0.05, TILE - 0.05]} />
              <meshStandardMaterial
                color={
                  hover === i && clickable
                    ? '#fbbf24'
                    : isSunk
                      ? '#450a0a'
                      : isShip
                        ? '#3f3f46'
                        : (i + Math.floor(i / GRID)) % 2 === 0
                          ? '#1d4ed8'
                          : '#2563eb'
                }
                roughness={0.75}
              />
            </mesh>
            {isShip && !isSunk && (
              <mesh position={[pos[0], 0.09, pos[2]]} castShadow>
                <boxGeometry args={[TILE - 0.16, 0.18, TILE - 0.16]} />
                <meshStandardMaterial color="#57534e" roughness={0.6} metalness={0.2} />
              </mesh>
            )}
            {shot && <Peg hit={shot.hit} position={pos} />}
          </group>
        );
      })}
      <mesh position={[cx, 2.2, cz - GRID * TILE / 2 - 0.65]} rotation={[-0.5, 0, 0]}>
        <planeGeometry args={[2.6, 0.5]} />
        <meshStandardMaterial color="#241d31" roughness={0.7} />
      </mesh>
      <mesh position={[cx, 2.2, cz - GRID * TILE / 2 - 0.64]} rotation={[-0.5, 0, 0]}>
        <planeGeometry args={[2.4, 0.4]} />
        <meshStandardMaterial color={accent} roughness={0.7} />
      </mesh>
      <LabelTexture text={label} position={[cx, 2.2, cz - GRID * TILE / 2 - 0.62]} accent={accent} />
    </group>
  );
}

function LabelTexture({ text, position, accent }: { text: string; position: [number, number, number]; accent: string }) {
  const texture = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 84;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, 512, 84);
    ctx.fillStyle = '#fff';
    ctx.font = '700 42px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 46);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [text, accent]);
  return (
    <mesh position={position} rotation={[-0.5, 0, 0]}>
      <planeGeometry args={[2.4, 0.4]} />
      <meshStandardMaterial map={texture} roughness={0.7} />
    </mesh>
  );
}

export function SeaBattleScene({
  state,
  viewer,
  water,
  accent,
  labelOwn,
  labelEnemy,
  interactive,
  onFire,
}: {
  state: SeaState;
  viewer: number;
  water: string;
  accent: string;
  labelOwn: string;
  labelEnemy: string;
  interactive: boolean;
  onFire: (x: number, y: number) => void;
}) {
  const enemy = 1 - viewer;
  const ownShips = state.fleets[viewer]!.flatMap((s) => (s.hits >= s.size ? [] : s.cells));
  const myShots = state.shots[enemy]!; // shots I fired at the enemy
  return (
    <group>
      <SeaPanel
        center={[-4.2, 0.4]}
        label={labelOwn}
        water={water}
        ships={ownShips}
        shots={state.shots[viewer]!}
        sunkCells={state.sunkCells[viewer]!}
        interactive={false}
        accent="#22d3ee"
      />
      <SeaPanel
        center={[4.2, 0.4]}
        label={labelEnemy}
        water={water}
        ships={[]}
        shots={myShots}
        sunkCells={state.sunkCells[enemy]!}
        interactive={interactive && state.phase === 'battle'}
        onFire={onFire}
        accent={accent}
      />
    </group>
  );
}
