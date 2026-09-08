import type { GameMeta, ShopSkin } from '../../core/types';
import { MiniCanvas, Spin } from '../../ui/three/shared';
import { MancalaPlay } from './Play';

const boardSkins: ShopSkin[] = [
  {
    id: 'mancala-board-oak',
    gameId: 'mancala',
    kind: 'board',
    name: { fa: 'بلوط', en: 'Oak' },
    price: 0,
    colors: { wood: '#a8713f', woodDark: '#7a4c25', seedA: '#4a3524', seedB: '#d9c9a8' },
    Preview: WoodPreview('#a8713f', '#7a4c25'),
  },
  {
    id: 'mancala-board-ebony',
    gameId: 'mancala',
    kind: 'board',
    name: { fa: 'ابونوس', en: 'Ebony' },
    price: 240,
    colors: { wood: '#3a3129', woodDark: '#1f1913', seedA: '#c9a86a', seedB: '#efe2c2' },
    Preview: WoodPreview('#3a3129', '#1f1913'),
  },
  {
    id: 'mancala-board-celestine',
    gameId: 'mancala',
    kind: 'board',
    name: { fa: 'سماوی', en: 'Celestine' },
    price: 320,
    colors: { wood: '#3f4a6b', woodDark: '#232b41', seedA: '#ffd9a0', seedB: '#9fe8dd' },
    Preview: WoodPreview('#3f4a6b', '#232b41'),
  },
];

function WoodPreview(wood: string, woodDark: string) {
  return () => (
    <MiniCanvas camera={{ position: [0, 3, 3.4], fov: 40 }}>
      <mesh castShadow position={[0, -0.5, 0]}>
        <boxGeometry args={[3.4, 0.4, 1.5]} />
        <meshStandardMaterial color={woodDark} roughness={0.6} />
      </mesh>
      <mesh position={[0, -0.28, 0]}>
        <boxGeometry args={[3.2, 0.16, 1.3]} />
        <meshStandardMaterial color={wood} roughness={0.75} />
      </mesh>
      {[-1.15, -0.55, 0.05, 0.65].map((x, i) => (
        <group key={i} position={[x, -0.2, 0]}>
          <mesh>
            <cylinderGeometry args={[0.2, 0.16, 0.1, 18]} />
            <meshStandardMaterial color="#3a2712" roughness={0.9} />
          </mesh>
          {[0, 1, 2, 3].map((k) => (
            <mesh key={k} castShadow position={[(k % 2) * 0.08 - 0.04, 0.1, ((k / 2) | 0) * 0.08 - 0.04]}>
              <sphereGeometry args={[0.045, 8, 8]} />
              <meshStandardMaterial color={k % 2 ? '#d9c9a8' : '#4a3524'} roughness={0.55} />
            </mesh>
          ))}
        </group>
      ))}
    </MiniCanvas>
  );
}

function Logo() {
  return (
    <MiniCanvas camera={{ position: [0, 2.2, 3.2], fov: 40 }}>
      <Spin speed={0.6}>
        {[0, 1, 2, 3, 4].map((i) => {
          const a = (i / 5) * Math.PI * 2;
          return (
            <mesh key={i} castShadow position={[Math.cos(a) * 0.85, 0.1 + i * 0.02, Math.sin(a) * 0.85]}>
              <sphereGeometry args={[0.24, 14, 14]} />
              <meshStandardMaterial color={i % 2 ? '#d9c9a8' : '#4a3524'} roughness={0.5} />
            </mesh>
          );
        })}
      </Spin>
    </MiniCanvas>
  );
}

export const mancalaMeta: GameMeta = {
  id: 'mancala',
  names: { fa: 'منقله', en: 'Mancala' },
  tagline: { fa: 'بذر بکار، برداشت کن، ذخیره کن!', en: 'Sow, capture, and stock your store!' },
  minPlayers: 2,
  maxPlayers: 2,
  accent: '#d97706',
  Logo,
  Play: MancalaPlay,
  skins: boardSkins,
  tutorial: {
    fa: [
      {
        title: 'هدف',
        body: 'تا پایان بازی بیشترین دانه را در انبار خودت (کاسهٔ سمت راست) جمع کن.',
      },
      {
        title: 'کاشتن',
        body: 'در نوبت خودت یکی از ۶ گودی سمت خودت را انتخاب کن؛ همهٔ دانه‌هایش را یکی‌یکی خلاف عقربهٔ ساعت می‌کاری — شامل انبار خودت اما نه انبار حریف.',
      },
      {
        title: 'نوبت اضافه',
        body: 'اگر آخرین دانه در انبار خودت بیفتد، دوباره بازی می‌کنی! با انتخاب هوشمندانه می‌توانی زنجیرهٔ نوبت‌های اضافه بسازی.',
      },
      {
        title: 'برداشت',
        body: 'اگر آخرین دانه در یک گودی خالیِ خودت بیفتد، آن دانه و همهٔ دانه‌های گودی روبه‌رو را می‌گیری و به انبار می‌ریزی.',
      },
      {
        title: 'پایان',
        body: 'وقتی گودی‌های یک طرف خالی شود، بازی تمام است و هر طرف دانه‌های باقی‌ماندهٔ سمت خودش را می‌گیرد.',
      },
    ],
    en: [
      {
        title: 'Goal',
        body: 'Collect the most seeds in your store (the big bowl on your right) by the end of the game.',
      },
      {
        title: 'Sowing',
        body: 'Pick one of your six pits; its seeds are sown one by one counter-clockwise — including your own store, but never your rival’s.',
      },
      {
        title: 'Extra turns',
        body: 'If your last seed lands in your store, you play again! Smart picks can chain extra turns.',
      },
      {
        title: 'Capturing',
        body: 'If your last seed lands in an empty pit on your side, you capture it plus everything in the opposite pit.',
      },
      {
        title: 'Ending',
        body: 'When one side’s pits run empty, the game ends and each side collects the seeds remaining on their side.',
      },
    ],
  },
};
