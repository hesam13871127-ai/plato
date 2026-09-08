import { useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import type { ShopSkin } from '../../core/types';
import { TableTop, useMeshClick } from '../../ui/three/shared';
import { cardBackTexture, cardFaceTexture, type CardVisualColor } from '../../ui/three/textures';
import type { OchoCard, OchoState } from './engine';

const COLOR_HEX: Record<string, string> = {
  red: '#ef4444',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
};

/* ---------------- cards ---------------- */

/** Lying card, face up (top face textured). */
export function CardFlat({
  card,
  skinKey,
  position,
  rotationY = 0,
}: {
  card: OchoCard;
  skinKey: string;
  position?: [number, number, number];
  rotationY?: number;
}) {
  const texture = useMemo(
    () => cardFaceTexture(card.color as CardVisualColor, card.value, skinKey),
    [card.color, card.value, skinKey],
  );
  return (
    <mesh castShadow receiveShadow position={position} rotation-y={rotationY}>
      <boxGeometry args={[1.05, 0.035, 1.5]} />
      <meshStandardMaterial attach="material-0" color="#fff" roughness={0.4} />
      <meshStandardMaterial attach="material-1" color="#fff" roughness={0.4} />
      <meshStandardMaterial attach="material-2" map={texture} roughness={0.32} />
      <meshStandardMaterial attach="material-3" color="#fff" roughness={0.4} />
      <meshStandardMaterial attach="material-4" color="#fff" roughness={0.4} />
      <meshStandardMaterial attach="material-5" color="#fff" roughness={0.4} />
    </mesh>
  );
}

/** Standing card showing its back (opponent hands / draw pile). */
export function CardBack({
  skinKey,
  colors,
  position,
  rotationY = 0,
  tiltX = -0.28,
  scale = 1,
}: {
  skinKey: string;
  colors: { bg: string; fg: string };
  position?: [number, number, number];
  rotationY?: number;
  tiltX?: number;
  scale?: number;
}) {
  const texture = useMemo(() => cardBackTexture(skinKey, colors), [skinKey, colors.bg, colors.fg]);
  return (
    <group position={position} rotation={[tiltX, rotationY, 0]} scale={scale}>
      <mesh castShadow>
        <boxGeometry args={[0.62, 0.9, 0.02]} />
        <meshStandardMaterial attach="material-4" map={texture} roughness={0.35} />
        <meshStandardMaterial attach="material-5" color={colors.bg} roughness={0.35} />
        <meshStandardMaterial attach="material-0" color="#ddd" roughness={0.4} />
        <meshStandardMaterial attach="material-1" color="#ddd" roughness={0.4} />
        <meshStandardMaterial attach="material-2" color="#ddd" roughness={0.4} />
        <meshStandardMaterial attach="material-3" color="#ddd" roughness={0.4} />
      </mesh>
    </group>
  );
}

/* ---------------- board ---------------- */

function seatTransform(seatId: number, playerCount: number): { pos: [number, number, number]; faceCamera: number } {
  // seat 0 is the bottom (viewer); arrange the rest around the table
  if (playerCount === 2) return { pos: [0, 0, -4.4], faceCamera: 0 };
  if (playerCount === 3) return seatId === 1 ? { pos: [5, 0, -1.2], faceCamera: -0.5 } : { pos: [-5, 0, -1.2], faceCamera: 0.5 };
  // 4 players
  if (seatId === 1) return { pos: [5.4, 0, -1.2], faceCamera: -0.5 };
  if (seatId === 2) return { pos: [0, 0, -4.4], faceCamera: 0 };
  return { pos: [-5.4, 0, -1.2], faceCamera: 0.5 };
}

function OpponentFan({
  count,
  skinKey,
  colors,
  seatId,
  playerCount,
}: {
  count: number;
  skinKey: string;
  colors: { bg: string; fg: string };
  seatId: number;
  playerCount: number;
}) {
  const { pos, faceCamera } = seatTransform(seatId, playerCount);
  const shown = Math.min(count, 12);
  return (
    <group position={pos} rotation-y={faceCamera}>
      {Array.from({ length: shown }, (_, i) => {
        const n = shown;
        const off = i - (n - 1) / 2;
        return (
          <CardBack
            key={i}
            skinKey={skinKey}
            colors={colors}
            position={[off * 0.42, 0.45, Math.abs(off) * Math.abs(off) * 0.05]}
            rotationY={off * 0.1}
            scale={0.9}
          />
        );
      })}
      {count === 0 && (
        <mesh position={[0, 0.1, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.4, 0.5, 28]} />
          <meshStandardMaterial color="#6b6288" />
        </mesh>
      )}
    </group>
  );
}

export function OchoBoard({
  state,
  cardSkin,
  tableSkin,
  viewerSeat,
  canDraw,
  onDraw,
}: {
  state: OchoState;
  cardSkin: ShopSkin;
  tableSkin: ShopSkin;
  viewerSeat: number;
  canDraw: boolean;
  onDraw: () => void;
}) {
  const backColors = { bg: cardSkin.colors.bg ?? '#1e1b4b', fg: cardSkin.colors.fg ?? '#818cf8' };
  const top3 = state.discard.slice(-3);
  const click = useMeshClick((_e: ThreeEvent<MouseEvent>) => onDraw());

  return (
    <TableTop skin={tableSkin} size={[15, 11]}>
      {/* active color ring */}
      <mesh position={[1.5, 0.04, 0]} rotation-x={-Math.PI / 2}>
        <torusGeometry args={[1.85, 0.06, 10, 60]} />
        <meshStandardMaterial
          color={COLOR_HEX[state.activeColor] ?? '#fff'}
          emissive={COLOR_HEX[state.activeColor] ?? '#fff'}
          emissiveIntensity={0.85}
        />
      </mesh>
      {/* direction arrows */}
      {[1, -1].map((side) => (
        <mesh
          key={side}
          position={[1.5 + side * 2.3, 0.09, side * 1.1]}
          rotation={[Math.PI / 2, 0, state.dir === 1 ? 0 : Math.PI]}
          castShadow
        >
          <coneGeometry args={[0.16, 0.42, 4]} />
          <meshStandardMaterial color="#e8e2f7" emissive="#8f7bff" emissiveIntensity={0.35} roughness={0.4} />
        </mesh>
      ))}

      {/* draw pile */}
      <group position={[-2.5, 0, 0]}>
        {canDraw && (
          <mesh position={[0, 0.14, 0]} {...click}>
            <boxGeometry args={[1.35, 0.3, 1.8]} />
            <meshStandardMaterial color="#3ddc97" transparent opacity={0.18} emissive="#3ddc97" emissiveIntensity={0.25} />
          </mesh>
        )}
        {Array.from({ length: Math.min(5, Math.max(1, Math.ceil(state.drawPile.length / 8))) }, (_, i) => (
          <CardBack
            key={i}
            skinKey={cardSkin.id}
            colors={backColors}
            position={[0, 0.03 + i * 0.022, 0]}
            tiltX={-Math.PI / 2}
            scale={1.55}
          />
        ))}
      </group>

      {/* discard */}
      {top3.map((card, i) => (
        <CardFlat
          key={card.id}
          card={card}
          skinKey="ocho-shared"
          position={[1.5, 0.03 + i * 0.02, 0]}
          rotationY={(card.id % 7 - 3) * 0.11}
        />
      ))}

      {/* opponents */}
      {state.hands.map((hand, seat) =>
        seat === viewerSeat ? null : (
          <OpponentFan
            key={seat}
            count={hand.length}
            skinKey={cardSkin.id}
            colors={backColors}
            seatId={seat}
            playerCount={state.playerCount}
          />
        ),
      )}
    </TableTop>
  );
}
