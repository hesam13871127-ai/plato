import type { GameMeta, ShopSkin } from '../../core/types';
import { MiniCanvas, Spin } from '../../ui/three/shared';
import { BingoPlay } from './Play';
import { DrawnBall } from './Board';

const tableSkins: ShopSkin[] = [
  {
    id: 'bingo-table-green',
    gameId: 'bingo',
    kind: 'table',
    name: { fa: 'میز کلاسیک', en: 'Classic Green' },
    price: 0,
    colors: { felt: '#1c6b4a' },
    Preview: FeltPreview('#1c6b4a'),
  },
  {
    id: 'bingo-table-violet',
    gameId: 'bingo',
    kind: 'table',
    name: { fa: 'بنفش مخملی', en: 'Velvet Violet' },
    price: 200,
    colors: { felt: '#3b2b7a' },
    Preview: FeltPreview('#3b2b7a'),
  },
];

function FeltPreview(color: string) {
  return () => (
    <MiniCanvas camera={{ position: [0, 2.6, 3], fov: 40 }}>
      <mesh position={[0, -0.7, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[3.6, 2.2]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      <group position={[0, 0.15, 0]} scale={0.55}>
        <DrawnBall number={7} />
      </group>
    </MiniCanvas>
  );
}

function Logo() {
  return (
    <MiniCanvas camera={{ position: [0, 1.6, 3.2], fov: 40 }}>
      <Spin speed={0.6}>
        <group position={[-0.75, 0.1, 0]} scale={0.75}>
          <DrawnBall number={8} />
        </group>
        <group position={[0.75, -0.05, 0.1]} scale={0.75}>
          <DrawnBall number={3} />
        </group>
      </Spin>
    </MiniCanvas>
  );
}

export const bingoMeta: GameMeta = {
  id: 'bingo',
  names: { fa: 'بینگو', en: 'Bingo' },
  tagline: { fa: 'شماره‌ها رو بکش، کارتت رو پر کن!', en: 'Draw the balls, fill your card!' },
  minPlayers: 2,
  maxPlayers: 4,
  accent: '#fb7185',
  Logo,
  Play: BingoPlay,
  skins: tableSkins,
  tutorial: {
    fa: [
      {
        title: 'هدف',
        body: 'هر بازیکن یک کارت ۵×۵ دارد با ستون‌های B-I-N-G-O. اولین کارتی که یک خط کامل (افقی، عمودی یا ضربدری) کامل شود برنده است!',
      },
      {
        title: 'کشیدن توپ',
        body: 'بازیکنان نوبتی از میان ۷۵ توپ می‌کشند. عدد کشیده‌شده روی همهٔ کارت‌ها به‌طور خودکار علامت می‌خورد.',
      },
      {
        title: 'خانهٔ آزاد',
        body: 'خانهٔ وسط کارت (زیر N) از ابتدا آزاد و علامت‌خورده است — برای کامل‌کردن خط‌ها حساب می‌شود.',
      },
    ],
    en: [
      {
        title: 'Goal',
        body: 'Each player holds a 5×5 B-I-N-G-O card. The first card to complete a full line (row, column or diagonal) wins!',
      },
      {
        title: 'Drawing',
        body: 'Players take turns drawing balls from the 75-ball pool. The drawn number is auto-daubed on every card.',
      },
      {
        title: 'Free space',
        body: 'The center square (under the N) starts already marked — it counts towards every line through it.',
      },
    ],
  },
};
