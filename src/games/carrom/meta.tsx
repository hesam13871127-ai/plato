import type { GameMeta, ShopSkin } from '../../core/types';
import { MiniCanvas, Spin } from '../../ui/three/shared';
import { CarromPlay } from './Play';
import { Coin3D } from './Board';

const pieceSkins: ShopSkin[] = [
  {
    id: 'carrom-pieces-wood',
    gameId: 'carrom',
    kind: 'pieces',
    name: { fa: 'چوب کلاسیک', en: 'Classic Wood' },
    price: 0,
    colors: { white: '#f3ead8', black: '#26201c', queen: '#c0392b' },
    Preview: () => (
      <MiniCanvas camera={{ position: [0, 1.6, 1.9], fov: 40 }}>
        <group position={[0, -0.1, 0]}>
          <Coin3D kind="white" />
        </group>
      </MiniCanvas>
    ),
  },
  {
    id: 'carrom-pieces-ivory',
    gameId: 'carrom',
    kind: 'pieces',
    name: { fa: 'عاج و لاجورد', en: 'Ivory & Lapis' },
    price: 220,
    colors: { white: '#fffaf0', black: '#1e3350', queen: '#b91c1c' },
    Preview: () => (
      <MiniCanvas camera={{ position: [0, 1.6, 1.9], fov: 40 }}>
        <group position={[0, -0.1, 0]}>
          <Coin3D kind="black" colors={{ white: '#fffaf0', black: '#1e3350', queen: '#b91c1c' }} />
        </group>
      </MiniCanvas>
    ),
  },
  {
    id: 'carrom-pieces-gold',
    gameId: 'carrom',
    kind: 'pieces',
    name: { fa: 'طلایی', en: 'Gilded' },
    price: 400,
    colors: { white: '#f5d98b', black: '#7c5e18', queen: '#c0392b' },
    Preview: () => (
      <MiniCanvas camera={{ position: [0, 1.6, 1.9], fov: 40 }}>
        <group position={[0, -0.1, 0]}>
          <Coin3D kind="queen" colors={{ white: '#f5d98b', black: '#7c5e18', queen: '#c0392b' }} />
        </group>
      </MiniCanvas>
    ),
  },
];

const boardSkins: ShopSkin[] = [
  {
    id: 'carrom-board-classic',
    gameId: 'carrom',
    kind: 'board',
    name: { fa: 'چوب طبیعی', en: 'Natural Wood' },
    price: 0,
    colors: { wood: '#d9b98c', frame: '#5a3a1c', lines: 'rgba(60,30,10,0.55)' },
    Preview: WoodPreview('#d9b98c', '#5a3a1c'),
  },
  {
    id: 'carrom-board-mahogany',
    gameId: 'carrom',
    kind: 'board',
    name: { fa: 'ماهون', en: 'Mahogany' },
    price: 240,
    colors: { wood: '#a86b4c', frame: '#43220f', lines: 'rgba(40,15,5,0.6)' },
    Preview: WoodPreview('#a86b4c', '#43220f'),
  },
  {
    id: 'carrom-board-slate',
    gameId: 'carrom',
    kind: 'board',
    name: { fa: 'اسلیت مدرن', en: 'Modern Slate' },
    price: 340,
    colors: { wood: '#4b5563', frame: '#1f2937', lines: 'rgba(255,255,255,0.35)' },
    Preview: WoodPreview('#4b5563', '#1f2937'),
  },
];

function WoodPreview(wood: string, frame: string) {
  return () => (
    <MiniCanvas camera={{ position: [0, 2.6, 3], fov: 40 }}>
      <mesh position={[0, -0.5, 0]}>
        <boxGeometry args={[2.8, 0.3, 2.8]} />
        <meshStandardMaterial color={frame} roughness={0.6} />
      </mesh>
      <mesh position={[0, -0.32, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[2.4, 2.4]} />
        <meshStandardMaterial color={wood} roughness={0.85} />
      </mesh>
      <group position={[-0.45, -0.24, -0.3]}>
        <Coin3D kind="white" />
      </group>
      <group position={[0.35, -0.24, 0.35]}>
        <Coin3D kind="black" />
      </group>
      <group position={[0, -0.24, 0.5]}>
        <Coin3D kind="queen" />
      </group>
    </MiniCanvas>
  );
}

function Logo() {
  return (
    <MiniCanvas camera={{ position: [0, 1.8, 2.6], fov: 40 }}>
      <Spin speed={0.6}>
        <group position={[-0.42, 0, 0]}>
          <Coin3D kind="white" />
        </group>
        <group position={[0, 0.06, 0]}>
          <Coin3D kind="queen" />
        </group>
        <group position={[0.42, 0, 0]}>
          <Coin3D kind="black" />
        </group>
      </Spin>
    </MiniCanvas>
  );
}

export const carromMeta: GameMeta = {
  id: 'carrom',
  names: { fa: 'کاروم', en: 'Carrom' },
  tagline: { fa: 'پیشانی‌بازی هندی — نشانه بگیر و بزن!', en: 'Flick, pocket, cover the queen!' },
  minPlayers: 2,
  maxPlayers: 2,
  accent: '#f97316',
  Logo,
  Play: CarromPlay,
  skins: [...pieceSkins, ...boardSkins],
  tutorial: {
    fa: [
      {
        title: 'هدف',
        body: 'همهٔ سکه‌های رنگ خودت (سفید یا سیاه) را داخل جیب‌های گوشه بینداز. اولین نفری که سکه‌هایش تمام شد برنده است — اما مراقب ملکه باش!',
      },
      {
        title: 'ضربه زدن',
        body: 'جای ضربه‌زن (استریک‌کر) را روی خط پایه با اسلایدر جابه‌جا کن، با ماوس نشانه بگیر، قدرت را تنظیم کن و «ضربه» بزن. هر بار سکهٔ خودت را بیندازی، دوباره می‌زنی.',
      },
      {
        title: 'ملکه (سکهٔ قرمز)',
        body: 'ملکه را که انداختی باید در ضربهٔ بعدی یکی از سکه‌های خودت را هم بیندازی تا «پوششش بدهی». اگر نتوانی، ملکه به مرکز برمی‌گردد!',
      },
      {
        title: 'خطاها',
        body: 'اگر ضربه‌زن خودش در جیب بیفتد خطاست و نوبت می‌گذرد. همچنین آخرین سکهٔ خودت را وقتی ملکه هنوز روی تخته انداختی، سکه به مرکز برمی‌گردد — اول ملکه!',
      },
    ],
    en: [
      {
        title: 'Goal',
        body: 'Pocket all nine coins of your color (white or black) in the corner pockets. First to clear their coins wins — mind the queen!',
      },
      {
        title: 'Striking',
        body: 'Slide the striker along your baseline, aim with the pointer, set the power and strike. Pocket one of your coins and you shoot again.',
      },
      {
        title: 'The queen (red coin)',
        body: 'After pocketing the queen you must cover her: pot one of your own coins on the very next stroke. Fail, and she returns to the center!',
      },
      {
        title: 'Fouls',
        body: "Pocketing the striker is a foul and passes the turn. Potting your last coin while the queen is still on the board returns that coin — queen first!",
      },
    ],
  },
};
