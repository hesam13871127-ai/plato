import type { GameMeta, ShopSkin } from '../../core/types';
import { MiniCanvas, Spin } from '../../ui/three/shared';
import { MinigolfPlay } from './Play';
import { HOLES } from './engine';
import { GolfCourse } from './Board';

const boardSkins: ShopSkin[] = [
  {
    id: 'minigolf-board-fairway',
    gameId: 'minigolf',
    kind: 'board',
    name: { fa: 'چمن استاندارد', en: 'Standard Fairway' },
    price: 0,
    colors: { felt: '#2f7d4f' },
    Preview: GreenPreview('#2f7d4f'),
  },
  {
    id: 'minigolf-board-neon',
    gameId: 'minigolf',
    kind: 'board',
    name: { fa: 'نئون شبانه', en: 'Neon Night' },
    price: 280,
    colors: { felt: '#116149' },
    Preview: GreenPreview('#116149'),
  },
  {
    id: 'minigolf-board-desert',
    gameId: 'minigolf',
    kind: 'board',
    name: { fa: 'چمن کویری', en: 'Desert Green' },
    price: 380,
    colors: { felt: '#8a8f3c' },
    Preview: GreenPreview('#8a8f3c'),
  },
];

function GreenPreview(color: string) {
  return () => (
    <MiniCanvas camera={{ position: [0, 3.2, 3.4], fov: 42 }}>
      <group scale={0.22}>
        <GolfCourse hole={HOLES[0]!} felt={color} />
      </group>
    </MiniCanvas>
  );
}

function Logo() {
  return (
    <MiniCanvas camera={{ position: [0, 1.2, 2.8], fov: 42 }}>
      <Spin speed={0.5}>
        <mesh position={[0, 0, 0]} rotation={[-0.2, 0, 0]} castShadow>
          <sphereGeometry args={[0.28, 20, 20]} />
          <meshStandardMaterial color="#38bdf8" roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.55, 0]} castShadow>
          <cylinderGeometry args={[0.02, 0.02, 1, 6]} />
          <meshStandardMaterial color="#e8e0cf" />
        </mesh>
        <mesh position={[0.18, 0.85, 0]}>
          <boxGeometry args={[0.34, 0.22, 0.02]} />
          <meshStandardMaterial color="#f43f5e" roughness={0.6} />
        </mesh>
      </Spin>
    </MiniCanvas>
  );
}

export const minigolfMeta: GameMeta = {
  id: 'minigolf',
  names: { fa: 'مینی‌گلف', en: 'Mini Golf' },
  tagline: { fa: 'سه حفره، کمترین ضربه!', en: 'Three holes, fewest strokes!' },
  minPlayers: 2,
  maxPlayers: 4,
  accent: '#38bdf8',
  Logo,
  Play: MinigolfPlay,
  skins: boardSkins,
  tutorial: {
    fa: [
      {
        title: 'هدف',
        body: 'سه حفره با پارهای ۲ و ۳. توپ را با کمترین ضربه وارد پرچم کن. کمترین مجموع ضربه‌ها در پایان برنده است.',
      },
      {
        title: 'ضربه',
        body: 'با ماوس جهت را نشانه بگیر (فلش زرد) و قدرت را با اسلایدر تنظیم کن، بعد «ضربه بزن». مانع‌های قرمز و نارنجی توپ را پس می‌زنند.',
      },
      {
        title: 'محدودیت',
        body: 'هر حفره حداکثر ۸ ضربه — بیشتر از آن بشود توپ برداشته می‌شود و ۸ ضربه ثبت می‌گردد. بازیکن بعدی از نقطهٔ شروع حفره آغاز می‌کند.',
      },
    ],
    en: [
      {
        title: 'Goal',
        body: 'Three holes with pars of 2 and 3. Sink the ball in the fewest strokes; the lowest total wins.',
      },
      {
        title: 'Stroke',
        body: 'Aim with the mouse (yellow arrow), set the power slider, then hit "Stroke". Red and amber bumpers bounce the ball away.',
      },
      {
        title: 'Limit',
        body: 'Each hole caps at 8 strokes — beyond that the ball is picked up and 8 is recorded. The next player tees off from the start.',
      },
    ],
  },
};
