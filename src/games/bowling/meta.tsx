import type { GameMeta, ShopSkin } from '../../core/types';
import { MiniCanvas, Spin } from '../../ui/three/shared';
import { BowlingPlay } from './Play';
import { Pin3D } from './Board';

const pieceSkins: ShopSkin[] = [
  {
    id: 'bowling-pieces-violet',
    gameId: 'bowling',
    kind: 'pieces',
    name: { fa: 'بنفش کلاسیک', en: 'Classic Violet' },
    price: 0,
    colors: { ball: '#6b21a8' },
    Preview: BallPreview('#6b21a8'),
  },
  {
    id: 'bowling-pieces-fire',
    gameId: 'bowling',
    kind: 'pieces',
    name: { fa: 'آتش', en: 'Fire' },
    price: 200,
    colors: { ball: '#c2410c' },
    Preview: BallPreview('#c2410c'),
  },
  {
    id: 'bowling-pieces-ocean',
    gameId: 'bowling',
    kind: 'pieces',
    name: { fa: 'اقیانوس', en: 'Ocean' },
    price: 200,
    colors: { ball: '#0e7490' },
    Preview: BallPreview('#0e7490'),
  },
];

const boardSkins: ShopSkin[] = [
  {
    id: 'bowling-board-maple',
    gameId: 'bowling',
    kind: 'board',
    name: { fa: 'چوب افرا', en: 'Maple Lane' },
    price: 0,
    colors: { wood: '#c9a165', gutter: '#2b2317' },
    Preview: LanePreview('#c9a165'),
  },
  {
    id: 'bowling-board-midnight',
    gameId: 'bowling',
    kind: 'board',
    name: { fa: 'نیمه‌شب', en: 'Midnight Lane' },
    price: 240,
    colors: { wood: '#3d3550', gutter: '#151221' },
    Preview: LanePreview('#3d3550'),
  },
];

function BallPreview(color: string) {
  return () => (
    <MiniCanvas camera={{ position: [0, 1.2, 2.2], fov: 40 }}>
      <mesh castShadow position={[0, -0.1, 0]}>
        <sphereGeometry args={[0.62, 26, 26]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.15} />
      </mesh>
    </MiniCanvas>
  );
}

function LanePreview(wood: string) {
  return () => (
    <MiniCanvas camera={{ position: [0, 2.8, 3.2], fov: 40 }}>
      <mesh position={[0, -0.5, 0]} receiveShadow>
        <boxGeometry args={[1.6, 0.2, 3.4]} />
        <meshStandardMaterial color={wood} roughness={0.55} />
      </mesh>
      <group position={[0, -0.38, -1.2]}>
        <Pin3D />
      </group>
    </MiniCanvas>
  );
}

function Logo() {
  return (
    <MiniCanvas camera={{ position: [0, 1.7, 3.2], fov: 40 }}>
      <Spin speed={0.6}>
        <mesh castShadow position={[-0.8, 0.25, 0.2]}>
          <sphereGeometry args={[0.52, 24, 24]} />
          <meshStandardMaterial color="#6b21a8" roughness={0.3} metalness={0.15} />
        </mesh>
        <group position={[0.75, 0, 0]}>
          <Pin3D />
        </group>
      </Spin>
    </MiniCanvas>
  );
}

export const bowlingMeta: GameMeta = {
  id: 'bowling',
  names: { fa: 'بولینگ', en: 'Bowling' },
  tagline: { fa: 'استرایک بزن، اسپر کن، قهرمان شو!', en: 'Throw strikes, pick up spares!' },
  minPlayers: 2,
  maxPlayers: 4,
  accent: '#a3e635',
  Logo,
  Play: BowlingPlay,
  skins: [...pieceSkins, ...boardSkins],
  tutorial: {
    fa: [
      {
        title: 'هدف',
        body: 'در ۱۰ فریم بیشترین امتیاز را بگیر. هر فریم دو پرتاب داری تا ۱۰ پین را بیندازی.',
      },
      {
        title: 'پرتاب',
        body: 'با حرکت ماوس روی لاین نشانه بگیر (خط سبز) و قدرت را با اسلایدر تنظیم کن، بعد «پرتاب» یا کلیک کن.',
      },
      {
        title: 'استرایک و اسپر',
        body: 'استرایک (انداختن همهٔ پین‌ها در پرتاب اول) = ۱۰ + دو پرتاب بعدی. اسپر (تمام‌کردن پین‌ها در دو پرتاب) = ۱۰ + یک پرتاب بعدی. در فریم دهم با استرایک/اسپر پرتاب اضافه می‌گیری.',
      },
      {
        title: 'گتر',
        body: 'اگر توپ از لاین خارج شود به گتر می‌افتد و آن پرتاب صفر می‌شود — نشانه‌گیری دقیق مهم‌تر از قدرت است!',
      },
    ],
    en: [
      {
        title: 'Goal',
        body: 'Score the most over 10 frames. Each frame gives you two throws to fell all ten pins.',
      },
      {
        title: 'Throwing',
        body: 'Aim by moving the pointer along the lane (green guide), set the power with the slider, then hit Throw or click.',
      },
      {
        title: 'Strikes & spares',
        body: 'A strike (all pins on the first throw) scores 10 + your next two throws. A spare (all pins in two throws) scores 10 + your next throw. The 10th frame grants bonus throws on strikes/spares.',
      },
      {
        title: 'Gutters',
        body: 'Miss the lane and the ball drops into the gutter for a zero — accuracy beats power!',
      },
    ],
  },
};
