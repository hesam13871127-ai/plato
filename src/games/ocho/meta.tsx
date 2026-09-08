import type { GameMeta, ShopSkin } from '../../core/types';
import { MiniCanvas, Spin } from '../../ui/three/shared';
import { OchoPlay } from './Play';
import { CardBack, CardFlat } from './Board';

/* ---------------- skins ---------------- */

const cardSkins: ShopSkin[] = [
  {
    id: 'ocho-cards-classic',
    gameId: 'ocho',
    kind: 'cards',
    name: { fa: 'کلاسیک بنفش', en: 'Classic Indigo' },
    price: 0,
    colors: { bg: '#1e1b4b', fg: '#818cf8' },
    Preview: BackPreview('#1e1b4b', '#818cf8'),
  },
  {
    id: 'ocho-cards-flame',
    gameId: 'ocho',
    kind: 'cards',
    name: { fa: 'شعله', en: 'Flame' },
    price: 160,
    colors: { bg: '#7f1d1d', fg: '#fb923c' },
    Preview: BackPreview('#7f1d1d', '#fb923c'),
  },
  {
    id: 'ocho-cards-galaxy',
    gameId: 'ocho',
    kind: 'cards',
    name: { fa: 'کهکشان', en: 'Galaxy' },
    price: 300,
    colors: { bg: '#0f172a', fg: '#22d3ee' },
    Preview: BackPreview('#0f172a', '#22d3ee'),
  },
];

const tableSkins: ShopSkin[] = [
  {
    id: 'ocho-table-green',
    gameId: 'ocho',
    kind: 'table',
    name: { fa: 'میز کلاسیک', en: 'Classic Green' },
    price: 0,
    colors: { felt: '#1c6b4a', rim: '#0f3d2c' },
    Preview: FeltPreview('#1c6b4a'),
  },
  {
    id: 'ocho-table-violet',
    gameId: 'ocho',
    kind: 'table',
    name: { fa: 'م مخملی بنفش', en: 'Velvet Violet' },
    price: 220,
    colors: { felt: '#3b2b7a', rim: '#241a52' },
    Preview: FeltPreview('#3b2b7a'),
  },
];

function BackPreview(bg: string, fg: string) {
  return () => (
    <MiniCanvas>
      <group position={[0, -0.15, 0]} rotation={[0, 0.15, 0]}>
        <CardBack skinKey={`prev-${bg}`} colors={{ bg, fg }} position={[0, 0.3, 0]} scale={1.5} />
      </group>
    </MiniCanvas>
  );
}

function FeltPreview(color: string) {
  return () => (
    <MiniCanvas camera={{ position: [0, 3.4, 3.6], fov: 40 }}>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.6, 0]}>
        <circleGeometry args={[1.8, 48]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      <CardFlat
        card={{ id: 1, color: 'red', value: '7' }}
        skinKey="ocho-shared"
        position={[0, -0.54, 0]}
        rotationY={0.4}
      />
    </MiniCanvas>
  );
}

/* ---------------- logo ---------------- */

function Logo() {
  return (
    <MiniCanvas camera={{ position: [0, 1.4, 4.4], fov: 40 }}>
      <Spin speed={0.6}>
        <group position={[0, 0.35, 0]}>
          <CardBack skinKey="logo-flame" colors={{ bg: '#7f1d1d', fg: '#fb923c' }} position={[-0.75, 0, -0.15]} rotationY={0.5} scale={1.05} />
          <CardBack skinKey="logo-classic" colors={{ bg: '#1e1b4b', fg: '#818cf8' }} position={[0, 0.05, 0]} scale={1.15} />
          <CardBack skinKey="logo-galaxy" colors={{ bg: '#0f172a', fg: '#22d3ee' }} position={[0.75, 0, -0.15]} rotationY={-0.5} scale={1.05} />
        </group>
      </Spin>
    </MiniCanvas>
  );
}

/* ---------------- meta ---------------- */

export const ochoMeta: GameMeta = {
  id: 'ocho',
  names: { fa: 'اُچو', en: 'Ocho' },
  tagline: { fa: 'رنگ یا عدد؟ عجله کن که یک کارت مانده!', en: 'Match color or number before they call Ocho!' },
  minPlayers: 2,
  maxPlayers: 4,
  accent: '#ef4444',
  Logo,
  Play: OchoPlay,
  skins: [...cardSkins, ...tableSkins],
  tutorial: {
    fa: [
      {
        title: 'هدف',
        body: 'اولین بازیکنی که همهٔ کارت‌هایش را تمام کند برنده است و امتیازش مجموع ارزش کارت‌های باقی‌ماندهٔ حریفان می‌شود.',
      },
      {
        title: 'بازی کردن کارت',
        body: 'در نوبت خودت کارتی بزا که رنگش با رنگ فعال یکی باشد یا عدد/علامتش با کارت روی میز یکی باشد. کارت‌های سیاه (ویلد) همیشه قابل بازی هستند.',
      },
      {
        title: 'کارت‌های ویژه',
        body: '⊘ یک نفر را رد می‌کند، ⇄ جهت بازی را برمی‌گرداند، +2 بازیکن بعدی ۲ کارت می‌کشد و نوبتش می‌سوزد، و +4 همان +2 است با ۴ کارت به‌همراه تعویض رنگ.',
      },
      {
        title: 'کشیدن کارت',
        body: 'اگر کارت قابل بازی نداشتی یک کارت بکش. اگر کارت کشیده‌شده قابل بازی باشد می‌توانی همان لحظه بازی‌اش کنی یا نگهش داری و رد شوی.',
      },
      {
        title: 'کارت ویلد',
        body: 'وقتی ویلد بازی می‌کنی رنگ بعدی را خودت انتخاب می‌کنی — رنگی را انتخاب کن که بیشترین کارت را از آن داری!',
      },
    ],
    en: [
      {
        title: 'Goal',
        body: 'Be the first to play every card from your hand. You score the total value of cards left in opponents’ hands.',
      },
      {
        title: 'Playing',
        body: 'Play a card matching the active color or the value of the top card. Black wilds can always be played.',
      },
      {
        title: 'Action cards',
        body: '⊘ skips one player, ⇄ reverses direction, +2 makes the next player draw two and lose their turn, and +4 does the same with four cards plus a color change.',
      },
      {
        title: 'Drawing',
        body: 'No playable card? Draw one. If the drawn card is playable you may play it immediately or keep it and pass.',
      },
      {
        title: 'Wild cards',
        body: 'Playing a wild lets you choose the next active color — pick the color you hold the most of!',
      },
    ],
  },
};
