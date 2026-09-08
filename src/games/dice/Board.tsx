import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { dieFaceTexture } from '../../ui/three/textures';

/* ------------------------------------------------------------------ */

export function DieDice({
  value,
  held,
  position,
  rolling,
  onClick,
}: {
  value: number;
  held: boolean;
  position: [number, number, number];
  rolling: boolean;
  onClick?: () => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const target = useRef({ x: 0, y: 0 });
  const first = useRef(true);
  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    const d = Math.min(dt, 0.05);
    if (rolling) {
      m.rotation.x += d * 9;
      m.rotation.y += d * 6;
      m.rotation.z += d * 3;
    } else {
      m.rotation.x = THREE.MathUtils.damp(m.rotation.x, 0, 10, d);
      m.rotation.y = THREE.MathUtils.damp(m.rotation.y, 0, 10, d);
      m.rotation.z = THREE.MathUtils.damp(m.rotation.z, 0, 10, d);
    }
    if (first.current) {
      m.position.set(position[0], position[1], position[2]);
      first.current = false;
      return;
    }
    m.position.x = THREE.MathUtils.damp(m.position.x, position[0], 8, d);
    m.position.y = THREE.MathUtils.damp(m.position.y, position[1] + (held ? 0.45 : 0), 8, d);
    m.position.z = THREE.MathUtils.damp(m.position.z, position[2], 8, d);
    void target;
  });
  const faces = useMemo(() => {
    const f = (n: number) => dieFaceTexture(n, { face: '#fbf5e4', pip: '#221d15' });
    return [f(2), f(5), f(value), f(1), f(value), f(3)];
  }, [value]);
  return (
    <group>
      {held && (
        <mesh position={[position[0], 0.03, position[2]]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.55, 0.68, 30]} />
          <meshStandardMaterial color="#3ddc97" emissive="#3ddc97" emissiveIntensity={0.9} side={THREE.DoubleSide} />
        </mesh>
      )}
      <mesh
        ref={ref}
        castShadow
        position={position}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onClick?.();
        }}
      >
        <boxGeometry args={[1, 1, 1]} />
        {faces.map((map, i) => (
          <meshStandardMaterial key={i} attach={`material-${i}`} map={map} roughness={0.32} />
        ))}
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */

export function DiceFelt({ felt = '#1c6b4a' }: { felt?: string }) {
  return (
    <RoundedBox args={[13.5, 0.55, 7.5]} radius={0.25} smoothness={4} position={[0, -0.35, 0]} receiveShadow>
      <meshStandardMaterial color={felt} roughness={0.95} />
    </RoundedBox>
  );
}
