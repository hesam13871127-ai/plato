import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { GameMeta, ShopSkin } from '../../core/types';
import { MiniCanvas } from '../../ui/three/shared';
import { MemoryPlay } from './Play';

const cardSkins: ShopSkin[] = [
  {
    id: 'memory-cards-violet',
    gameId: 'memory',
    kind: 'cards',
    name: { fa: 'بنفش کهکشانی', en: 'Galaxy Violet' },
    price: 0,
    colors: { back: '#7c3aed' },
    Preview: CardPreview('#7c3aed'),
  },
  {
    id: 'memory-cards-rose',
    gameId: 'memory',
    kind: 'cards',
    name: { fa: 'رز عاشق', en: 'Rose' },
    price: 150,
    colors: { back: '#e11d48' },
    Preview: CardPreview('#e11d48'),
  },
  {
    id: 'memory-cards-emerald',
    gameId: 'memory',
    kind: 'cards',
    name: { fa: 'زمرد شب', en: 'Night Emerald' },
    price: 260,
    colors: { back: '#047857' },
    Preview: CardPreview('#047857'),
  },
];

function CardPreview(color: string) {
  return () => (
    <MiniCanvas camera={{ position: [0, 2.2, 2.6], fov: 42 }}>
      <mesh position={[-0.55, 0, 0]} rotation-x={-Math.PI / 2} castShadow>
        <planeGeometry args={[1.1, 1.1]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <mesh position={[0.55, 0.1, 0]} rotation-x={-Math.PI / 2} castShadow>
        <planeGeometry args={[1.1, 1.1]} />
        <meshStandardMaterial color="#f8f5ee" roughness={0.6} />
      </mesh>
    </MiniCanvas>
  );
}

/** two cards where one keeps flipping over */
function FlipCard({ x, flip }: { x: number; flip: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((st) => {
    if (ref.current && flip) {
      ref.current.rotation.x = (st.clock.elapsedTime * 1.8) % (Math.PI * 2);
    }
  });
  return (
    <group ref={ref} position={[x, 0, 0]}>
      <mesh position={[0, 0.02, 0]} rotation-x={-Math.PI / 2} castShadow>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial color="#f8f5ee" roughness={0.6} />
      </mesh>
      <mesh position={[0, -0.02, 0]} rotation-x={Math.PI / 2}>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial color="#7c3aed" roughness={0.6} />
      </mesh>
    </group>
  );
}

function Logo() {
  return (
    <MiniCanvas camera={{ position: [0, 1.8, 2.6], fov: 42 }}>
      <FlipCard x={-0.62} flip />
      <FlipCard x={0.62} flip={false} />
    </MiniCanvas>
  );
}

export const memoryMeta: GameMeta = {
  id: 'memory',
  names: { fa: 'حافظه', en: 'Memory' },
  tagline: { fa: 'جفت‌ها رو پیدا کن و بخور!', en: 'Find the pairs, keep the turns!' },
  minPlayers: 2,
  maxPlayers: 4,
  accent: '#c084fc',
  Logo,
  Play: MemoryPlay,
  skins: cardSkins,
  tutorial: {
    fa: [
      {
        title: 'هدف',
        body: 'کارت‌ها رو به رو به پایین چیده شده‌اند. نوبتی دو کارت باز کن؛ اگر علامت‌شان یکی بود، جفت مال شما می‌شود و دوباره بازی می‌کنید.',
      },
      {
        title: 'چرخش نوبت',
        body: 'اگر دو کارت متفاوت باشند، برمی‌گردند و نوبت به نفر بعدی می‌رود. هر جفتِ بیشتر در پایان یعنی برنده!',
      },
      {
        title: 'حجم زمین',
        body: 'بازی دونفره ۱۶ کارت (۸ جفت) دارد؛ برای ۳ و ۴ نفره زمین بزرگ‌تر می‌شود (۲۰ و ۲۴ کارت).',
      },
    ],
    en: [
      {
        title: 'Goal',
        body: 'Cards lie face down. On your turn flip two cards; if they match, the pair is yours and you play again.',
      },
      {
        title: 'Turns',
        body: 'Two different cards flip back over and the turn passes. The most pairs at the end wins!',
      },
      {
        title: 'Grid size',
        body: 'Two players get 16 cards (8 pairs); 3- and 4-player tables grow to 20 and 24 cards.',
      },
    ],
  },
};
