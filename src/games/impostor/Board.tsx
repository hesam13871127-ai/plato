import { useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { RoundedBox } from '@react-three/drei';
import type { ImpostorState } from './engine';
import { WORDS } from './words';

/* ------------------------------------------------------------------ */

function clueTexture(text: string, accent: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.ellipse(192, 64, 186, 60, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '700 46px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 192, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function wordCardTexture(front: string, sub: string, color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f8f5ee';
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = color;
  ctx.lineWidth = 22;
  ctx.strokeRect(24, 24, 464, 464);
  ctx.fillStyle = '#221b33';
  ctx.font = '900 64px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(front, 256, 220);
  ctx.fillStyle = color;
  ctx.font = '700 40px Arial';
  ctx.fillText(sub, 256, 330);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** center card: flips to reveal the round outcome */
export function ImpostorTable({
  state,
  names,
  accents,
  lang,
}: {
  state: ImpostorState;
  names: string[];
  accents: string[];
  lang: 'fa' | 'en';
}) {
  const cardRef = useRef<THREE.Group>(null);
  useFrame((st, dt) => {
    if (cardRef.current) {
      cardRef.current.rotation.y = THREE.MathUtils.damp(cardRef.current.rotation.y, Math.PI * 2, 5, dt);
    }
  });
  const word = WORDS[state.words[state.round] ?? 0]!;
  const cardTexture = useMemo(
    () => wordCardTexture('❓', lang === 'fa' ? 'کلمهٔ مخفی' : 'secret word', '#8b5cf6'),
    [lang],
  );
  const roundClues = state.clues[state.round] ?? [];
  const n = state.playerCount;
  // precompute clue textures OUTSIDE the render loop (stable hook count)
  const clueTextures = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => {
        const clue = roundClues[i];
        return clue ? clueTexture(clue[lang], accents[i % accents.length] ?? '#8b5cf6') : null;
      }),
    [roundClues, lang, accents, n],
  );

  return (
    <group>
      <RoundedBox args={[15, 0.5, 15]} radius={0.25} smoothness={4} position={[0, -0.28, 0]} receiveShadow>
        <meshStandardMaterial color="#263042" roughness={0.95} />
      </RoundedBox>
      {/* center word card */}
      <group ref={cardRef} position={[0, 1.05, 0]} rotation={[0, Math.PI / 2, 0]}>
        <RoundedBox args={[2.2, 0.08, 3.2]} radius={0.04} smoothness={3} castShadow>
          <meshStandardMaterial color="#5a4632" roughness={0.7} />
        </RoundedBox>
        <mesh position={[0, 0.06, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[2, 3]} />
          <meshStandardMaterial map={cardTexture} roughness={0.8} />
        </mesh>
      </group>
      {/* seats with clue bubbles */}
      {Array.from({ length: n }, (_, i) => {
        const angle = (i / n) * Math.PI * 2 + Math.PI / 2;
        const x = Math.cos(angle) * 4.4;
        const z = Math.sin(angle) * 4.4;
        const texture = clueTextures[i];
        return (
          <group key={i} position={[x, 0, z]}>
            <mesh position={[0, 0.4, 0]} castShadow>
              <capsuleGeometry args={[0.34, 0.6, 6, 12]} />
              <meshStandardMaterial color={accents[i % accents.length] ?? '#8b5cf6'} roughness={0.65} />
            </mesh>
            <mesh position={[0, 0.95, 0]}>
              <sphereGeometry args={[0.23, 16, 16]} />
              <meshStandardMaterial color="#f7d9b8" roughness={0.6} />
            </mesh>
            {texture && (
              <mesh position={[0, 1.75, 0]} rotation={[-0.35, 0, 0]}>
                <planeGeometry args={[2.1, 0.7]} />
                <meshStandardMaterial map={texture} roughness={0.8} transparent />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}
