import { useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { ChainLink, DominoState } from './engine';
import type { ShopSkin } from '../../core/types';
import { CameraFit, Damp, Pulse, TableTop, useMeshClick } from '../../ui/three/shared';
import { dominoFaceTexture } from '../../ui/three/textures';

export const TILE_LEN = 1.75;
export const TILE_WID = 0.95;
export const TILE_H = 0.18;
const GAP = 0.07;

export interface DominoSkinColors {
  face: string;
  pip: string;
  bone: string;
}

/** A single lying domino. `a` is on the left half, `b` on the right. */
export function DominoPiece({
  a,
  b,
  colors,
  skinKey,
  position,
  rotationY = 0,
  faceDown = false,
  onClick,
}: {
  a: number;
  b: number;
  colors: DominoSkinColors;
  skinKey: string;
  position?: [number, number, number];
  rotationY?: number;
  faceDown?: boolean;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const texture = useMemo(
    () => (faceDown ? null : dominoFaceTexture(a, b, skinKey, { face: colors.face, pip: colors.pip })),
    [a, b, skinKey, colors.face, colors.pip, faceDown],
  );
  const click = useMeshClick(onClick);
  return (
    <group position={position} rotation-y={rotationY}>
      <mesh castShadow receiveShadow {...click}>
        <boxGeometry args={[TILE_LEN, TILE_H, TILE_WID]} />
        <meshStandardMaterial attach="material-0" color={colors.bone} roughness={0.45} />
        <meshStandardMaterial attach="material-1" color={colors.bone} roughness={0.45} />
        <meshStandardMaterial
          attach="material-2"
          map={faceDown ? undefined : texture ?? undefined}
          color={faceDown ? '#2a232f' : '#ffffff'}
          roughness={0.35}
        />
        <meshStandardMaterial attach="material-3" color={colors.bone} roughness={0.45} />
        <meshStandardMaterial attach="material-4" color={colors.bone} roughness={0.45} />
        <meshStandardMaterial attach="material-5" color={colors.bone} roughness={0.45} />
      </mesh>
    </group>
  );
}

export interface ChainSlot {
  link: ChainLink;
  x: number;
  rotationY: number;
}

/** Serpentine-free layout: straight horizontal chain, doubles crosswise. */
export function layoutChain(chain: ChainLink[]): { slots: ChainSlot[]; width: number; leftX: number; rightX: number } {
  let cursor = 0;
  const slots: ChainSlot[] = chain.map((link) => {
    const double = link.double;
    const w = double ? TILE_WID : TILE_LEN;
    const slot: ChainSlot = { link, x: cursor + w / 2, rotationY: double ? Math.PI / 2 : 0 };
    cursor += w + GAP;
    return slot;
  });
  const total = Math.max(cursor - GAP, 0);
  const shift = -total / 2;
  for (const s of slots) s.x += shift;
  return { slots, width: total, leftX: shift - 1.4, rightX: total + shift + 1.4 };
}

function EndMarker({ x, onClick }: { x: number; onClick: () => void }) {
  const click = useMeshClick(() => onClick());
  return (
    <group position={[x, 0.12, 0]}>
      <Pulse>
        <mesh {...click}>
          <torusGeometry args={[0.55, 0.1, 12, 40]} />
          <meshStandardMaterial color="#3ddc97" emissive="#3ddc97" emissiveIntensity={0.9} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.02, 0]} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[0.8, 32]} />
          <meshStandardMaterial color="#3ddc97" transparent opacity={0.22} />
        </mesh>
      </Pulse>
      {/* generous invisible hit area */}
      <mesh
        visible={false}
        position={[0, 0.3, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <boxGeometry args={[2, 1, 3]} />
      </mesh>
    </group>
  );
}

/** Face-down boneyard stack. */
export function Boneyard({ count, colors, skinKey }: { count: number; colors: DominoSkinColors; skinKey: string }) {
  const stacks = Math.min(count, 6);
  return (
    <group position={[-9.5, 0, 4.8]}>
      {Array.from({ length: stacks }, (_, i) => (
        <DominoPiece
          key={i}
          a={0}
          b={0}
          faceDown
          colors={colors}
          skinKey={skinKey}
          position={[i * 0.25, 0.02 + (i % 2) * 0.01, i * 0.06]}
          rotationY={0.12 * i}
        />
      ))}
    </group>
  );
}

export function DominoBoard({
  state,
  pieceSkin,
  tableSkin,
  legalEnds,
  onEndClick,
}: {
  state: DominoState;
  pieceSkin: ShopSkin;
  tableSkin: ShopSkin;
  legalEnds: ('left' | 'right')[];
  onEndClick: (end: 'left' | 'right') => void;
}) {
  const colors: DominoSkinColors = {
    face: pieceSkin.colors.face ?? '#f7f1e1',
    pip: pieceSkin.colors.pip ?? '#221d15',
    bone: pieceSkin.colors.bone ?? '#efe6cc',
  };
  const layout = useMemo(() => layoutChain(state.chain), [state.chain]);
  const tableW = Math.max(24, layout.width + 7);

  return (
    <>
      <TableTop skin={tableSkin} size={[tableW, 13]}>
        {layout.slots.map((slot) => (
          <Damp key={slot.link.tileId} target={[slot.x, TILE_H / 2, 0]} speed={6}>
            <DominoPiece
              a={slot.link.left}
              b={slot.link.right}
              colors={colors}
              skinKey={pieceSkin.id}
              rotationY={slot.rotationY}
            />
          </Damp>
        ))}
        {legalEnds.includes('left') && <EndMarker x={layout.leftX} onClick={() => onEndClick('left')} />}
        {legalEnds.includes('right') && <EndMarker x={layout.rightX} onClick={() => onEndClick('right')} />}
        <Boneyard count={state.boneyard.length} colors={colors} skinKey={pieceSkin.id} />
      </TableTop>
      <CameraFit width={layout.width} height={13} />
    </>
  );
}
