import { useMemo } from 'react';
import * as THREE from 'three';
import type { GameMeta, ShopSkin } from '../../core/types';
import { MiniCanvas, Spin } from '../../ui/three/shared';
import { EmojiPlay } from './Play';

const tableSkins: ShopSkin[] = [
  {
    id: 'emoji-table-night',
    gameId: 'emoji',
    kind: 'table',
    name: { fa: 'شب نئون', en: 'Neon Night' },
    price: 0,
    colors: { felt: '#14304d' },
    Preview: FeltPreview('#14304d'),
  },
  {
    id: 'emoji-table-mango',
    gameId: 'emoji',
    kind: 'table',
    name: { fa: 'انبه‌ای گرم', en: 'Mango Warm' },
    price: 240,
    colors: { felt: '#7c3a12' },
    Preview: FeltPreview('#7c3a12'),
  },
];

function FeltPreview(color: string) {
  return () => (
    <MiniCanvas camera={{ position: [0, 2.4, 2.8], fov: 40 }}>
      <mesh position={[0, -0.7, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[3.4, 2.2]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.25, 0]} rotation={[-0.3, 0, 0]} castShadow>
        <boxGeometry args={[1.3, 0.7, 0.1]} />
        <meshStandardMaterial color="#22d3ee" roughness={0.6} emissive="#22d3ee" emissiveIntensity={0.3} />
      </mesh>
    </MiniCanvas>
  );
}

function Logo() {
  return (
    <MiniCanvas camera={{ position: [0, 1.3, 3], fov: 40 }}>
      <Spin speed={0.8}>
        <mesh castShadow>
          <boxGeometry args={[1.3, 1.3, 0.18]} />
          <meshStandardMaterial color="#fde68a" roughness={0.5} emissive="#fde68a" emissiveIntensity={0.15} />
        </mesh>
        <EmojiFace position={[0, 0, 0.12]} />
      </Spin>
    </MiniCanvas>
  );
}

function EmojiFace({ position }: { position: [number, number, number] }) {
  const texture = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(0, 0, 256, 256);
    ctx.font = '170px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('😜', 128, 140);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  return (
    <mesh position={position}>
      <planeGeometry args={[1.1, 1.1]} />
      <meshStandardMaterial map={texture} roughness={0.7} />
    </mesh>
  );
}

export const emojiMeta: GameMeta = {
  id: 'emoji',
  names: { fa: 'ایموجی شاراد', en: 'Emoji Charades' },
  tagline: { fa: 'اموجی‌ها چی می‌گن؟ حدس بزن!', en: 'What are the emojis saying? Guess!' },
  minPlayers: 2,
  maxPlayers: 4,
  accent: '#22d3ee',
  Logo,
  Play: EmojiPlay,
  skins: tableSkins,
  tutorial: {
    fa: [
      {
        title: 'هدف',
        body: 'روی صفحه یک رشته اموجی نمایش داده می‌شود که یک کلمه یا عبارت را نشان می‌دهد. از میان چهار گزینه، معنی درست را انتخاب کن.',
      },
      {
        title: 'امتیازدهی',
        body: 'هر معما ۵ بار برای هر بازیکن تکرار می‌شود. پاسخ درست ۱۰ امتیاز + پاداش برتری دارد. بیشترین امتیاز برنده است.',
      },
      {
        title: 'نکته',
        body: 'اموجی‌ها گاهی مستقیم هستند و گاهی کنایه — «🦁👑» یعنی شیرشاه، نه تاج شیر!',
      },
    ],
    en: [
      {
        title: 'Goal',
        body: 'A sequence of emojis depicts a word or phrase. Pick the right meaning out of four options.',
      },
      {
        title: 'Scoring',
        body: 'Each player gets 5 riddles. A correct guess is 10 points plus a streak bonus. Highest score wins.',
      },
      {
        title: 'Tip',
        body: 'Emojis are sometimes literal and sometimes playful — "🦁👑" means The Lion King, not a lion crown!',
      },
    ],
  },
};
