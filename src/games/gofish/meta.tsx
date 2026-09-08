import type { GameMeta, ShopSkin } from '../../core/types';
import { MiniCanvas, Spin } from '../../ui/three/shared';
import { GoFishPlay } from './Play';

const tableSkins: ShopSkin[] = [
  {
    id: 'gofish-felt',
    gameId: 'gofish',
    kind: 'table',
    name: { fa: 'میز سبز', en: 'Green Felt' },
    price: 0,
    colors: { felt: '#065f46' },
    Preview: FeltPreview('#065f46', '#1e3a8a'),
  },
  {
    id: 'gofish-lake',
    gameId: 'gofish',
    kind: 'table',
    name: { fa: 'دریاچه', en: 'Lake House' },
    price: 240,
    colors: { felt: '#155e75' },
    Preview: FeltPreview('#155e75', '#0c4a6e'),
  },
  {
    id: 'gofish-crimson',
    gameId: 'gofish',
    kind: 'table',
    name: { fa: 'مخمل سرخ', en: 'Crimson Velvet' },
    price: 400,
    colors: { felt: '#7f1d1d' },
    Preview: FeltPreview('#7f1d1d', '#450a0a'),
  },
  {
    id: 'gofish-cards-vintage',
    gameId: 'gofish',
    kind: 'cards',
    name: { fa: 'کارت‌های کلاسیک', en: 'Vintage Backs' },
    price: 300,
    colors: { back: '#1e3a8a' },
    Preview: FeltPreview('#065f46', '#1e3a8a'),
  },
];

function FeltPreview(felt: string, card: string) {
  return () => (
    <MiniCanvas camera={{ position: [0, 1.6, 2], fov: 44 }}>
      <mesh castShadow>
        <boxGeometry args={[2, 0.16, 1.4]} />
        <meshStandardMaterial color={felt} roughness={0.9} />
      </mesh>
      {[-0.25, 0, 0.25].map((x, i) => (
        <mesh key={i} position={[x, 0.14, 0]} rotation-y={(i - 1) * 0.25} castShadow>
          <boxGeometry args={[0.3, 0.44, 0.02]} />
          <meshStandardMaterial color={card} roughness={0.6} />
        </mesh>
      ))}
    </MiniCanvas>
  );
}

function Logo() {
  return (
    <MiniCanvas camera={{ position: [0.2, 1.1, 2.1], fov: 44 }}>
      <Spin speed={0.6}>
        {/* fish body */}
        <mesh castShadow scale={[1.25, 0.8, 0.8]}>
          <sphereGeometry args={[0.55, 24, 18]} />
          <meshStandardMaterial color="#38bdf8" roughness={0.5} />
        </mesh>
        {/* tail */}
        <mesh position={[-0.75, 0, 0]} rotation-z={Math.PI / 4} castShadow>
          <coneGeometry args={[0.28, 0.42, 4]} />
          <meshStandardMaterial color="#0ea5e9" roughness={0.5} />
        </mesh>
        {/* eye */}
        <mesh position={[0.32, 0.14, 0.42]}>
          <sphereGeometry args={[0.07, 12, 12]} />
          <meshStandardMaterial color="#0f172a" roughness={0.3} />
        </mesh>
        {/* fins */}
        <mesh position={[0, 0.42, 0]} rotation-z={-0.4} castShadow>
          <coneGeometry args={[0.14, 0.3, 4]} />
          <meshStandardMaterial color="#0ea5e9" roughness={0.5} />
        </mesh>
        {/* card behind */}
        <mesh position={[0.1, 0.5, -0.5]} rotation={[0.3, 0.2, 0.1]} castShadow>
          <boxGeometry args={[0.5, 0.72, 0.02]} />
          <meshStandardMaterial color="#1e3a8a" roughness={0.6} />
        </mesh>
      </Spin>
    </MiniCanvas>
  );
}

export const gofishMeta: GameMeta = {
  id: 'gofish',
  names: { fa: 'برو ماهی بگیر', en: 'Go Fish' },
  tagline: { fa: 'بپرس، بگیر، چهارتایی بساز!', en: 'Ask, catch, book four of a kind!' },
  minPlayers: 2,
  maxPlayers: 4,
  accent: '#38bdf8',
  Logo,
  Play: GoFishPlay,
  skins: tableSkins,
  tutorial: {
    fa: [
      {
        title: 'پرسیدن',
        body: 'نوبت که شد، یکی از کارت‌های دستت را انتخاب کن و از یک حریف همان رنک را بخواه. اگر داشته باشد همهٔ کارت‌های آن رنک را می‌گیری و دوباره می‌پرسی!',
      },
      {
        title: 'برو ماهی بگیر',
        body: 'اگر حریف آن کارت را نداشته باشد «برو ماهی بگیر!»: از حوض یک کارت می‌کشی و نوبت به بعدی می‌رود. اگر همان رنکِ پرسیده بیرون بیاید، شانسی بودی و نوبت می‌ماند!',
      },
      {
        title: 'کتاب',
        body: 'چهارتای یک رنک = یک کتاب 📖 که روی میز می‌ماند و یک امتیاز است. وقتی همهٔ ۱۳ رنک رزرو شود یا کارتی نماند، بیشترین کتاب برنده است.',
      },
    ],
    en: [
      {
        title: 'Asking',
        body: 'On your turn pick a rank from your hand and ask an opponent for it. If they hold any, you take ALL their cards of that rank and ask again!',
      },
      {
        title: 'Go fish',
        body: 'If they have none — "go fish!": you draw from the pool and the turn passes. Draw the very rank you asked for and you got lucky: keep the turn!',
      },
      {
        title: 'Books',
        body: 'Four of a kind is a book 📖 — it stays on the table and scores a point. When all 13 ranks are booked or no cards remain, most books wins.',
      },
    ],
  },
};
