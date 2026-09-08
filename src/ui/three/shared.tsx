import { useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, RoundedBox } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import type { ShopSkin } from '../../core/types';

/* ------------------------------------------------------------------ */
/* Canvas wrappers                                                     */
/* ------------------------------------------------------------------ */

export function GameCanvas({
  children,
  camera,
  minDistance = 8,
  maxDistance = 55,
  maxPolarAngle = 1.25,
  target = [0, 0, 0],
}: {
  children: ReactNode;
  camera?: { position: [number, number, number]; fov?: number };
  minDistance?: number;
  maxDistance?: number;
  maxPolarAngle?: number;
  target?: [number, number, number];
}) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true }}
      camera={camera ?? { position: [0, 14, 14], fov: 45 }}
    >
      <Lights />
      {children}
      <OrbitControls
        makeDefault
        enablePan={false}
        target={target}
        minDistance={minDistance}
        maxDistance={maxDistance}
        minPolarAngle={0.15}
        maxPolarAngle={maxPolarAngle}
        enableDamping
        dampingFactor={0.12}
      />
    </Canvas>
  );
}

/** Tiny canvas for logos + shop previews (cheap: no shadows, fixed camera). */
export function MiniCanvas({ children, camera }: { children: ReactNode; camera?: { position: [number, number, number]; fov?: number } }) {
  return (
    <Canvas dpr={[1, 2]} gl={{ antialias: true }} camera={camera ?? { position: [0, 2.6, 4.6], fov: 42 }}>
      <ambientLight intensity={0.85} />
      <directionalLight position={[3, 6, 4]} intensity={1.1} />
      <directionalLight position={[-4, 2, -3]} intensity={0.3} color="#9f7dff" />
      {children}
    </Canvas>
  );
}

export function Lights() {
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[6, 12, 5]}
        intensity={1.25}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-6, 8, -6]} intensity={0.35} color="#8f7bff" />
      <pointLight position={[0, 6, 0]} intensity={0.25} color="#ffd9f2" />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Table                                                               */
/* ------------------------------------------------------------------ */

export function TableTop({
  skin,
  size = [24, 14],
  children,
}: {
  skin: ShopSkin;
  size?: [number, number];
  children?: ReactNode;
}) {
  const felt = skin.colors.felt ?? '#1c6b4a';
  const rim = skin.colors.rim ?? '#0f3d2c';
  return (
    <group>
      <RoundedBox args={[size[0], 0.7, size[1]]} radius={0.28} smoothness={4} position={[0, -0.45, 0]} receiveShadow>
        <meshStandardMaterial color={felt} roughness={0.95} />
      </RoundedBox>
      <RoundedBox args={[size[0] + 1.5, 0.35, size[1] + 1.5]} radius={0.2} smoothness={4} position={[0, -0.92, 0]} receiveShadow>
        <meshStandardMaterial color={rim} roughness={0.8} metalness={0.15} />
      </RoundedBox>
      {children}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Motion helpers                                                      */
/* ------------------------------------------------------------------ */

/**
 * Group that smoothly eases toward `target` every frame. Optional `lift`
 * automatically raises the object mid-flight for a hop feel.
 */
export function Damp({
  target,
  lift = 0,
  speed = 5,
  children,
  ...rest
}: {
  target: [number, number, number];
  lift?: number;
  speed?: number;
  children?: ReactNode;
} & React.ComponentProps<'group'>) {
  const ref = useRef<THREE.Group>(null);
  const first = useRef(true);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    if (first.current) {
      g.position.set(target[0], target[1], target[2]);
      first.current = false;
      return;
    }
    const d = Math.min(dt, 0.05);
    g.position.x = THREE.MathUtils.damp(g.position.x, target[0], speed, d);
    g.position.z = THREE.MathUtils.damp(g.position.z, target[2], speed, d);
    const dist = Math.hypot(target[0] - g.position.x, target[2] - g.position.z);
    const wantY = target[1] + (lift > 0 ? Math.min(dist * lift, 1.1) : 0);
    g.position.y = THREE.MathUtils.damp(g.position.y, wantY, speed + 1, d);
  });
  return (
    <group ref={ref} {...rest}>
      {children}
    </group>
  );
}

/** Component that slowly spins its children (logos, decorative pieces). */
export function Spin({ children, speed = 0.6 }: { children?: ReactNode; speed?: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * speed;
  });
  return <group ref={ref}>{children}</group>;
}

/** Gently pulses scale — used for "clickable" markers. */
export function Pulse({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ref.current) ref.current.scale.setScalar(1 + Math.sin(t * 3.2) * 0.09);
  });
  return <group ref={ref}>{children}</group>;
}

/** Camera auto-fit: keeps a given world width in frame. */
export function CameraFit({ width, height = 14, fov = 45 }: { width: number; height?: number; fov?: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { update?: () => void; target?: THREE.Vector3 } | null;
  useFrame((_, dt) => {
    const need = Math.max(width * 0.95 + 6, 14);
    const targetZ = need / (2 * Math.tan((fov * Math.PI) / 360)) + 4;
    const d = Math.min(dt, 0.05);
    camera.position.x = THREE.MathUtils.damp(camera.position.x, 0, 3, d);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, targetZ * 0.82, 3, d);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, targetZ, 3, d);
    controls?.update?.();
  });
  return null;
}

/* ------------------------------------------------------------------ */
/* Common click/hover handler                                          */
/* ------------------------------------------------------------------ */

export function useMeshClick(onClick?: (e: ThreeEvent<MouseEvent>) => void) {
  const hovered = useRef(false);
  useFrame(() => {
    document.body.style.cursor = hovered.current && onClick ? 'pointer' : 'auto';
  });
  return {
    onPointerOver: () => {
      hovered.current = true;
    },
    onPointerOut: () => {
      hovered.current = false;
    },
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      onClick?.(e);
    },
  };
}

/** Material finish derived from a skin. */
export function finishProps(skin: Pick<ShopSkin, 'finish'> | undefined): {
  roughness: number;
  metalness: number;
  emissiveIntensity: number;
} {
  switch (skin?.finish) {
    case 'metal':
      return { roughness: 0.22, metalness: 0.92, emissiveIntensity: 0 };
    case 'gem':
      return { roughness: 0.12, metalness: 0.35, emissiveIntensity: 0.28 };
    case 'glow':
      return { roughness: 0.4, metalness: 0.15, emissiveIntensity: 0.85 };
    default:
      return { roughness: 0.55, metalness: 0.08, emissiveIntensity: 0 };
  }
}
