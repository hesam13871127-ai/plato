import type { GameMeta, ShopSkin } from '../../core/types';
import { MiniCanvas } from '../../ui/three/shared';
import { DotsPlay } from './Play';

const boardSkins: ShopSkin[] = [
  {
    id: 'dots-board-parchment',
    gameId: 'dots',
    kind: 'board',
    name: { fa: 'کاغذ کهن', en: 'Parchment' },
    price: 0,
    colors: { light: '#efe6d5', rim: '#3a2c1d' },
    Preview: BoardPreview('#efe6d5', '#3a2c1d'),
  },
  {
    id: 'dots-board-mint',
    gameId: 'dots',
    kind: 'board',
    name: { fa: 'نعنایی', en: 'Mint' },
    price: 180,
    colors: { light: '#d7f0e4', rim: '#14532d' },
    Preview: BoardPreview('#d7f0e4', '#14532d'),
  },
  {
    id: 'dots-board-night',
    gameId: 'dots',
    kind: 'board',
    name: { fa: 'شب', en: 'Nightfall' },
    price: 300,
    colors: { light: '#221f33', rim: '#0d0b16' },
    Preview: BoardPreview('#221f33', '#0d0b16'),
  },
];

function BoardPreview(light: string, rim: string) {
  return () => (
    <MiniCanvas camera={{ position: [0, 2.8, 3], fov: 40 }}>
      <mesh position={[0, -0.4, 0]}>
        <boxGeometry args={[2.9, 0.2, 2.9]} />
        <meshStandardMaterial color={rim} roughness={0.7} />
      </mesh>
      <mesh position={[0, -0.28, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[2.6, 2.6]} />
        <meshStandardMaterial color={light} roughness={0.95} />
      </mesh>
      {Array.from({ length: 16 }, (_, i) => {
        const r = Math.floor(i / 4);
        const c = i % 4;
        return (
          <mesh key={i} position={[(c - 1.5) * 0.7, -0.22, (r - 1.5) * 0.7]}>
            <sphereGeometry args={[0.06, 10, 10]} />
            <meshStandardMaterial color="#3a3450" />
          </mesh>
        );
      })}
      <mesh position={[0, -0.18, -0.35]}>
        <boxGeometry args={[0.65, 0.06, 0.06]} />
        <meshStandardMaterial color="#8b5cf6" emissive="#8b5cf6" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[0.35, -0.18, 0]}>
        <boxGeometry args={[0.65, 0.06, 0.06]} />
        <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.5} />
      </mesh>
    </MiniCanvas>
  );
}

function Logo() {
  return (
    <MiniCanvas camera={{ position: [0, 2.6, 2.8], fov: 40 }}>
      <group rotation={[0.5, 0.4, 0]}>
        {Array.from({ length: 9 }, (_, i) => {
          const r = Math.floor(i / 3);
          const c = i % 3;
          return (
            <mesh key={i} position={[(c - 1) * 0.75, 0, (r - 1) * 0.75]}>
              <sphereGeometry args={[0.11, 14, 14]} />
              <meshStandardMaterial color="#3a3450" roughness={0.5} />
            </mesh>
          );
        })}
        <mesh position={[0, 0, -0.375]}>
          <boxGeometry args={[0.7, 0.1, 0.1]} />
          <meshStandardMaterial color="#8b5cf6" emissive="#8b5cf6" emissiveIntensity={0.6} />
        </mesh>
        <mesh position={[0.375, 0, 0]}>
          <boxGeometry args={[0.7, 0.1, 0.1]} />
          <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.6} />
        </mesh>
        <mesh position={[0, 0.01, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[0.62, 0.62]} />
          <meshStandardMaterial color="#8b5cf6" transparent opacity={0.35} />
        </mesh>
      </group>
    </MiniCanvas>
  );
}

export const dotsMeta: GameMeta = {
  id: 'dots',
  names: { fa: 'نقطه‌ومربع', en: 'Dots & Boxes' },
  tagline: { fa: 'خط بکش، مربع ببند، امتیاز بگیر!', en: 'Draw lines, close boxes, score!' },
  minPlayers: 2,
  maxPlayers: 4,
  accent: '#f472b6',
  Logo,
  Play: DotsPlay,
  skins: boardSkins,
  tutorial: {
    fa: [
      {
        title: 'هدف',
        body: 'در پایان بازی، بیشترین مربعِ بسته‌شده را داشته باشی. هر مربعی که با خط‌های تو کامل شود یک امتیاز برایت دارد.',
      },
      {
        title: 'نوبت‌ها',
        body: 'در هر نوبت یک خط بین دو نقطهٔ مجاور می‌کشی (افقی یا عمودی). اگر خط تو مربعی را کامل کند، یک امتیاز می‌گیری و دوباره خط می‌کشی!',
      },
      {
        title: 'زنجیره‌ها',
        body: 'مربع‌های با سه خط مثل تله‌اند: هرکس خط چهارم را بکشد مربع را می‌گیرد. سعی کن خطی نکشی که مربعی را با ۳ خط رها کنی — مگر اینکه مجبور باشی!',
      },
    ],
    en: [
      {
        title: 'Goal',
        body: 'End the game with the most closed boxes. Every box you complete with your line is a point.',
      },
      {
        title: 'Turns',
        body: 'On each turn draw one line between two adjacent dots. Completing a box scores a point and immediately grants another line!',
      },
      {
        title: 'Chains',
        body: "Boxes with three sides are traps: whoever draws the last line claims them. Avoid handing your rival 3-sided boxes — unless you have no choice!",
      },
    ],
  },
};
