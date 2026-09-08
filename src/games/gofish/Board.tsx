import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';

/** a fanned stack of face-down cards standing on the table */
export function CardFan({ count, x, z, color = '#1e3a8a', rotY = 0 }: { count: number; x: number; z: number; color?: string; rotY?: number }) {
  const shown = Math.min(count, 7);
  return (
    <group position={[x, 0, z]} rotation-y={rotY}>
      {Array.from({ length: shown }, (_, i) => {
        const a = (i - (shown - 1) / 2) * 0.16;
        return (
          <mesh key={i} position={[Math.sin(a) * 0.5, 0.18 + i * 0.012, Math.cos(a) * 0.5 - 0.5]} rotation-y={a} castShadow>
            <boxGeometry args={[0.34, 0.5, 0.02]} />
            <meshStandardMaterial color={color} roughness={0.6} />
          </mesh>
        );
      })}
      {count === 0 && (
        <mesh position={[0, 0.05, 0]} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[0.34, 24]} />
          <meshStandardMaterial color="#1f2937" transparent opacity={0.35} />
        </mesh>
      )}
    </group>
  );
}

/** booked quartet lying face-up in the middle */
export function BookStack({ rank, x, z, label, color }: { rank: number; x: number; z: number; label: string; color: string }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((st, dt) => {
    if (ref.current) ref.current.scale.setScalar(THREE.MathUtils.damp(ref.current.scale.x, 1, 8, dt));
    void st;
  });
  const tex = makeRankTexture(label, color);
  return (
    <group ref={ref} position={[x, 0, z]} scale={0.01}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[i * 0.02, 0.02 + i * 0.012, i * 0.015]} castShadow>
          <planeGeometry args={[0.36, 0.52]} />
          <meshStandardMaterial map={i === 3 ? tex : undefined} color={i === 3 ? '#ffffff' : '#e2e8f0'} roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[0.06, 0.09, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[0.4, 0.56]} />
        <meshStandardMaterial color={color} transparent opacity={0.16} />
      </mesh>
    </group>
  );
}

function makeRankTexture(label: string, color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 184;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 184);
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 116, 172);
  ctx.fillStyle = color;
  ctx.font = '700 84px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 64, 96);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** pool of face-down cards in the middle */
export function Pool({ count, total }: { count: number; total: number }) {
  const stacks = Math.ceil(total / 8);
  return (
    <group>
      {Array.from({ length: stacks }, (_, s) => {
        const n = Math.max(0, Math.min(count - s * 8, 8));
        return (
          <group key={s} position={[(s - (stacks - 1) / 2) * 0.6, 0, 0]}>
            {Array.from({ length: n }, (_, i) => (
              <mesh key={i} position={[0, 0.02 + i * 0.014, 0]} rotation-x={-Math.PI / 2} castShadow>
                <planeGeometry args={[0.36, 0.52]} />
                <meshStandardMaterial color="#1e40af" roughness={0.6} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

/** table felt */
export function FishTable({ felt }: { felt: string }) {
  return (
    <RoundedBox args={[9.2, 0.4, 6.4]} radius={0.3} smoothness={4} position={[0, -0.22, 0]} receiveShadow>
      <meshStandardMaterial color={felt} roughness={0.92} />
    </RoundedBox>
  );
}
