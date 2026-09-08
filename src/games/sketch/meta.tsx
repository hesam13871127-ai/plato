import type { GameMeta, ShopSkin } from '../../core/types';
import { MiniCanvas, Spin } from '../../ui/three/shared';
import { SketchPlay } from './Play';
import { Easel } from './Board';

const boardSkins: ShopSkin[] = [
  {
    id: 'sketch-board-oak',
    gameId: 'sketch',
    kind: 'board',
    name: { fa: 'چوب بلوط', en: 'Oak Easel' },
    price: 0,
    colors: { wood: '#b98a4e' },
    Preview: WoodPreview('#b98a4e'),
  },
  {
    id: 'sketch-board-walnut',
    gameId: 'sketch',
    kind: 'board',
    name: { fa: 'گردوی تیره', en: 'Dark Walnut' },
    price: 190,
    colors: { wood: '#6b4a2b' },
    Preview: WoodPreview('#6b4a2b'),
  },
  {
    id: 'sketch-board-mint',
    gameId: 'sketch',
    kind: 'board',
    name: { fa: 'سفید نعنایی', en: 'Mint White' },
    price: 300,
    colors: { wood: '#d8cfc0' },
    Preview: WoodPreview('#d8cfc0'),
  },
];

function WoodPreview(color: string) {
  return () => (
    <MiniCanvas camera={{ position: [0, 1.4, 2.6], fov: 42 }}>
      <group scale={0.55}>
        <Easel targetIdx={0} wood={color} />
      </group>
    </MiniCanvas>
  );
}

function Logo() {
  return (
    <MiniCanvas camera={{ position: [0, 1.1, 2.8], fov: 42 }}>
      <Spin speed={0.5}>
        <group scale={0.5} position={[0, -0.2, 0]}>
          <Easel targetIdx={1} wood="#b98a4e" />
        </group>
      </Spin>
      {/* pencil */}
      <group position={[1.05, -0.1, 0.4]} rotation={[0, 0, -0.7]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.06, 0.06, 1.1, 8]} />
          <meshStandardMaterial color="#f59e0b" roughness={0.5} />
        </mesh>
        <mesh position={[0, -0.66, 0]} castShadow>
          <coneGeometry args={[0.06, 0.22, 8]} />
          <meshStandardMaterial color="#221b33" roughness={0.4} />
        </mesh>
      </group>
    </MiniCanvas>
  );
}

export const sketchMeta: GameMeta = {
  id: 'sketch',
  names: { fa: 'اسکچ', en: 'Sketch' },
  tagline: { fa: 'کپی کن، امتیاز شباهت بگیر!', en: 'Copy the doodle, score the similarity!' },
  minPlayers: 2,
  maxPlayers: 4,
  accent: '#f43f5e',
  Logo,
  Play: SketchPlay,
  skins: boardSkins,
  tutorial: {
    fa: [
      {
        title: 'هدف',
        body: 'در هر دور یک شکل ساده روی ایزل نمایش داده می‌شود. هر بازیکن همان شکل را روی بوم می‌کشد؛ هرچه شبیه‌تر، امتیاز بیشتر (۰ تا ۱۰۰).',
      },
      {
        title: 'امتیاز شباهت',
        body: '۶۵٪ امتیاز از پوشش (خطوطی که از هدف نگذاشتی) و ۳۵٪ از دقت (خطوط اضافه نکشی) می‌آید. سه دور بازی می‌شود و بیشترین مجموع برنده است.',
      },
      {
        title: 'ابزار',
        body: 'با ماوس یا انگشت روی بوم بکش. دکمهٔ واگرد آخرین خط را حذف می‌کند و پاک کن همه را. نقاشی هر بازیکن به دیوار گالری می‌رود!',
      },
    ],
    en: [
      {
        title: 'Goal',
        body: 'Each round a simple doodle appears on the easel. Every player redraws it on their canvas — the closer the copy, the higher the similarity score (0–100).',
      },
      {
        title: 'Similarity',
        body: "65% of the score is coverage (did you trace the whole target?) and 35% is precision (no stray lines). Three rounds; highest total wins.",
      },
      {
        title: 'Tools',
        body: 'Draw with mouse or touch. Undo removes the last stroke, clear wipes the canvas. Every attempt joins the gallery wall!',
      },
    ],
  },
};
