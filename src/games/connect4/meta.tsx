import type { GameMeta, ShopSkin } from '../../core/types';
import { MiniCanvas, Spin } from '../../ui/three/shared';
import { Connect4Play } from './Play';

function DiscPreview({ color, metal = false }: { color: string; metal?: boolean }) {
  return (
    <mesh castShadow rotation-x={Math.PI / 2}>
      <cylinderGeometry args={[0.55, 0.55, 0.22, 36]} />
      <meshStandardMaterial color={color} roughness={metal ? 0.2 : 0.5} metalness={metal ? 0.9 : 0.1} />
    </mesh>
  );
}

/* ---------------- skins ---------------- */

const pieceSkins: ShopSkin[] = [
  {
    id: 'c4-pieces-classic',
    gameId: 'connect4',
    kind: 'pieces',
    name: { fa: 'قرمز و زرد', en: 'Red & Yellow' },
    price: 0,
    colors: { p0: '#ef4444', p1: '#facc15' },
    finish: 'matte',
    Preview: () => (
      <MiniCanvas>
        <group position={[0, -0.1, 0]}>
          <DiscPreview color="#ef4444" />
        </group>
      </MiniCanvas>
    ),
  },
  {
    id: 'c4-pieces-chrome',
    gameId: 'connect4',
    kind: 'pieces',
    name: { fa: 'کروم و طلایی', en: 'Chrome & Gold' },
    price: 220,
    colors: { p0: '#cbd5e1', p1: '#fbbf24' },
    finish: 'metal',
    Preview: () => (
      <MiniCanvas>
        <group position={[0, -0.1, 0]}>
          <DiscPreview color="#cbd5e1" metal />
        </group>
      </MiniCanvas>
    ),
  },
  {
    id: 'c4-pieces-candy',
    gameId: 'connect4',
    kind: 'pieces',
    name: { fa: 'آب‌نباتی', en: 'Candy Pop' },
    price: 320,
    colors: { p0: '#f472b6', p1: '#22d3ee' },
    finish: 'gem',
    Preview: () => (
      <MiniCanvas>
        <group position={[0, -0.1, 0]}>
          <DiscPreview color="#f472b6" />
        </group>
      </MiniCanvas>
    ),
  },
];

const boardSkins: ShopSkin[] = [
  {
    id: 'c4-board-classic',
    gameId: 'connect4',
    kind: 'board',
    name: { fa: 'آبی کلاسیک', en: 'Classic Blue' },
    price: 0,
    colors: { frame: '#1d4ed8' },
    Preview: FramePreview('#1d4ed8'),
  },
  {
    id: 'c4-board-midnight',
    gameId: 'connect4',
    kind: 'board',
    name: { fa: 'نیمه‌شب', en: 'Midnight' },
    price: 240,
    colors: { frame: '#1e293b' },
    Preview: FramePreview('#1e293b'),
  },
  {
    id: 'c4-board-forest',
    gameId: 'connect4',
    kind: 'board',
    name: { fa: 'جنگلی', en: 'Forest' },
    price: 240,
    colors: { frame: '#166534' },
    Preview: FramePreview('#166534'),
  },
];

function FramePreview(color: string) {
  return () => (
    <MiniCanvas camera={{ position: [0, 2.6, 4.2], fov: 40 }}>
      <mesh castShadow position={[0, -0.4, 0]}>
        <boxGeometry args={[2.8, 0.35, 0.9]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.55, 0.25]}>
        <planeGeometry args={[2.5, 1.6]} />
        <meshStandardMaterial color={color} roughness={0.55} />
      </mesh>
      <group position={[-0.6, 0.2, 0.45]}>
        <DiscPreview color="#ef4444" />
      </group>
      <group position={[0.35, 0.2, 0.45]}>
        <DiscPreview color="#facc15" />
      </group>
    </MiniCanvas>
  );
}

/* ---------------- logo ---------------- */

function Logo() {
  return (
    <MiniCanvas camera={{ position: [0, 1.6, 4.6], fov: 40 }}>
      <Spin speed={0.5}>
        <group position={[0, 0.2, 0]} rotation={[0.25, 0, -0.08]}>
          {[-1.5, -0.5, 0.5, 1.5].map((x, i) => (
            <group key={i} position={[x, 0, 0]}>
              <mesh castShadow rotation-x={Math.PI / 2}>
                <cylinderGeometry args={[0.42, 0.42, 0.18, 36]} />
                <meshStandardMaterial
                  color={i === 2 ? '#ffd166' : i % 2 === 0 ? '#ef4444' : '#facc15'}
                  emissive={i === 2 ? '#ffd166' : '#000000'}
                  emissiveIntensity={i === 2 ? 0.45 : 0}
                  roughness={0.4}
                />
              </mesh>
            </group>
          ))}
        </group>
      </Spin>
    </MiniCanvas>
  );
}

/* ---------------- meta ---------------- */

export const connect4Meta: GameMeta = {
  id: 'connect4',
  names: { fa: 'چهار در یک ردیف', en: 'Connect 4' },
  tagline: { fa: 'چهار تا ردیف کن، حریف رو غافلگیر کن', en: 'Line up four before your rival does' },
  minPlayers: 2,
  maxPlayers: 2,
  accent: '#3b82f6',
  Logo,
  Play: Connect4Play,
  skins: [...pieceSkins, ...boardSkins],
  tutorial: {
    fa: [
      {
        title: 'هدف',
        body: 'اولین بازیکنی که ۴ مهرهٔ خود را به‌صورت افقی، عمودی یا مورب در یک ردیف بچیند برنده است.',
      },
      {
        title: 'انداختن مهره',
        body: 'روی ستون موردنظر کلیک کن؛ مهرهٔ تو در پایین‌ترین خانهٔ خالی همان ستون فرود می‌آید.',
      },
      {
        title: 'تله و ضدتله',
        body: 'مراقب باش حریفت سه‌تایی نسازد؛ همیشه هم خانهٔ خطر را ببند و هم فرصت‌های دوتایی/سه‌تایی خودت را بچین. کنترل ستون وسط ارزش زیادی دارد!',
      },
    ],
    en: [
      {
        title: 'Goal',
        body: 'Be the first to align four of your discs horizontally, vertically or diagonally.',
      },
      {
        title: 'Dropping',
        body: 'Click a column — your disc falls to the lowest empty slot of that column.',
      },
      {
        title: 'Traps & counters',
        body: "Watch for your opponent's open threes, build your own double and triple threats, and fight for the center column!",
      },
    ],
  },
};
