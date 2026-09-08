import type { GameMeta, ShopSkin } from '../../core/types';
import { MiniCanvas, Spin } from '../../ui/three/shared';
import { DominoesPlay } from './Play';
import { DominoPiece } from './Board';

/* ---------------- skins ---------------- */

const pieceSkins: ShopSkin[] = [
  {
    id: 'dominoes-pieces-classic',
    gameId: 'dominoes',
    kind: 'pieces',
    name: { fa: 'عاج و ابونوس', en: 'Ivory & Ebony' },
    price: 0,
    colors: { face: '#f7f1e1', pip: '#221d15', bone: '#efe6cc' },
    finish: 'matte',
    Preview: () => (
      <MiniCanvas>
        <group position={[0, -0.4, 0]}>
          <DominoPiece a={6} b={3} colors={{ face: '#f7f1e1', pip: '#221d15', bone: '#efe6cc' }} skinKey="dominoes-pieces-classic" />
        </group>
      </MiniCanvas>
    ),
  },
  {
    id: 'dominoes-pieces-neon',
    gameId: 'dominoes',
    kind: 'pieces',
    name: { fa: 'نئون', en: 'Neon' },
    price: 150,
    colors: { face: '#191932', pip: '#39ff88', bone: '#23234a' },
    finish: 'glow',
    Preview: () => (
      <MiniCanvas>
        <group position={[0, -0.4, 0]}>
          <DominoPiece a={5} b={2} colors={{ face: '#191932', pip: '#39ff88', bone: '#23234a' }} skinKey="dominoes-pieces-neon" />
        </group>
      </MiniCanvas>
    ),
  },
  {
    id: 'dominoes-pieces-marble',
    gameId: 'dominoes',
    kind: 'pieces',
    name: { fa: 'مرمر سلطنتی', en: 'Royal Marble' },
    price: 280,
    colors: { face: '#e9eef2', pip: '#3c4854', bone: '#dfe6ec' },
    finish: 'gem',
    Preview: () => (
      <MiniCanvas>
        <group position={[0, -0.4, 0]}>
          <DominoPiece a={4} b={6} colors={{ face: '#e9eef2', pip: '#3c4854', bone: '#dfe6ec' }} skinKey="dominoes-pieces-marble" />
        </group>
      </MiniCanvas>
    ),
  },
];

const tableSkins: ShopSkin[] = [
  {
    id: 'dominoes-table-green',
    gameId: 'dominoes',
    kind: 'table',
    name: { fa: 'میز کلاسیک', en: 'Classic Green' },
    price: 0,
    colors: { felt: '#1c6b4a', rim: '#0f3d2c' },
    Preview: FeltPreview('#1c6b4a'),
  },
  {
    id: 'dominoes-table-royal',
    gameId: 'dominoes',
    kind: 'table',
    name: { fa: 'م مخملی بنفش', en: 'Royal Purple' },
    price: 220,
    colors: { felt: '#3b2b7a', rim: '#241a52' },
    Preview: FeltPreview('#3b2b7a'),
  },
  {
    id: 'dominoes-table-crimson',
    gameId: 'dominoes',
    kind: 'table',
    name: { fa: 'میز کریمسون', en: 'Crimson Club' },
    price: 220,
    colors: { felt: '#7a1f2b', rim: '#4d121b' },
    Preview: FeltPreview('#7a1f2b'),
  },
];

function FeltPreview(color: string) {
  return () => (
    <MiniCanvas camera={{ position: [0, 3.4, 3.6], fov: 40 }}>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.6, 0]}>
        <circleGeometry args={[1.8, 48]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.16, 0]} rotation-y={0.5}>
        <DominoPiece a={6} b={6} colors={{ face: '#f7f1e1', pip: '#221d15', bone: '#efe6cc' }} skinKey="dominoes-pieces-classic" />
      </mesh>
    </MiniCanvas>
  );
}

/* ---------------- logo ---------------- */

function Logo() {
  return (
    <MiniCanvas camera={{ position: [0, 2.2, 4.4], fov: 40 }}>
      <Spin speed={0.5}>
        <group position={[-0.75, 0, 0]} rotation={[0.15, 0.5, 0]}>
          <DominoPiece a={6} b={6} colors={{ face: '#f7f1e1', pip: '#221d15', bone: '#efe6cc' }} skinKey="dominoes-pieces-classic" position={[0, 0.45, 0]} />
        </group>
        <group position={[0.8, 0, 0.1]} rotation={[0.1, -0.4, 0]}>
          <DominoPiece a={3} b={5} colors={{ face: '#e9eef2', pip: '#3c4854', bone: '#dfe6ec' }} skinKey="dominoes-pieces-marble" position={[0, 0.45, 0]} />
        </group>
      </Spin>
    </MiniCanvas>
  );
}

/* ---------------- meta ---------------- */

export const dominoesMeta: GameMeta = {
  id: 'dominoes',
  names: { fa: 'دومینو', en: 'Dominoes' },
  tagline: { fa: 'چینش زنجیرهٔ استخوان‌ها', en: 'Match the bones, build the chain' },
  minPlayers: 2,
  maxPlayers: 4,
  accent: '#f59e0b',
  Logo,
  Play: DominoesPlay,
  skins: [...pieceSkins, ...tableSkins],
  tutorial: {
    fa: [
      {
        title: 'هدف بازی',
        body: 'هر کس زودتر همهٔ دومینوهای دستش را روی میز بچیند برندهٔ آن دست است. هر دومینو دو نیمه دارد که مجموع نقاط هر نیمه ۰ تا ۶ است.',
      },
      {
        title: 'شروع بازی',
        body: 'دارندهٔ بلندترین دوبله (مثل ۶|۶) بازی را شروع می‌کند و باید همان را وسط میز بچیند. نوبت‌ها پادساعت‌گرد ادامه پیدا می‌کند.',
      },
      {
        title: 'چینش',
        body: 'در نوبت خودت یک دومینو انتخاب کن که یکی از نیمه‌هایش با یکی از دو سرِ زنجیره برابر باشد و روی همان سر بچین. دوبله‌ها به‌صورت عمود چیده می‌شوند.',
      },
      {
        title: 'کش بکش و رد شدن',
        body: 'اگر دومینوی قابل چینش نداشته باشی از گنجینه می‌کشی تا زمانی که بتوانی بچینی. اگر گنجینه خالی بود، رد می‌شوی.',
      },
      {
        title: 'پایان و امتیاز',
        body: 'با خالی‌شدن دست یک بازیکن یا مسدودشدن بازی (رد شدن همه)، دست تمام می‌شود. برنده مجموع امتیاز (نقطه‌های) دست بقیه را می‌گیرد؛ در حالت مسدود، کم‌نقطه‌ترین دست برنده است.',
      },
    ],
    en: [
      {
        title: 'Goal',
        body: 'Be the first to play every domino from your hand. Each domino has two halves, each worth 0–6 pips.',
      },
      {
        title: 'Opening',
        body: 'The holder of the highest double (e.g. 6|6) starts and must lay it on the table. Turns continue counter-clockwise.',
      },
      {
        title: 'Playing',
        body: 'On your turn, pick a domino with a half matching one of the two open ends of the chain and lay it there. Doubles are placed crosswise.',
      },
      {
        title: 'Draw & pass',
        body: 'If nothing matches, draw from the boneyard until you can play. If the boneyard is empty, you pass.',
      },
      {
        title: 'Scoring',
        body: 'A round ends when someone empties their hand or the game blocks. The winner scores the total pips left in other hands; on a block, the lightest hand wins.',
      },
    ],
  },
};
