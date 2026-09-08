import type { GameMeta, ShopSkin } from '../../core/types';
import { MiniCanvas, Spin } from '../../ui/three/shared';
import { TriviaPlay } from './Play';

const tableSkins: ShopSkin[] = [
  {
    id: 'trivia-table-violet',
    gameId: 'trivia',
    kind: 'table',
    name: { fa: 'استیج بنفش', en: 'Violet Stage' },
    price: 0,
    colors: { felt: '#2b2350' },
    Preview: FeltPreview('#2b2350'),
  },
  {
    id: 'trivia-table-teal',
    gameId: 'trivia',
    kind: 'table',
    name: { fa: 'فرش فیروزه‌ای', en: 'Teal Carpet' },
    price: 220,
    colors: { felt: '#134e4a' },
    Preview: FeltPreview('#134e4a'),
  },
  {
    id: 'trivia-table-crimson',
    gameId: 'trivia',
    kind: 'table',
    name: { fa: 'مخمل زرشکی', en: 'Crimson Velvet' },
    price: 340,
    colors: { felt: '#4c1030' },
    Preview: FeltPreview('#4c1030'),
  },
];

function FeltPreview(color: string) {
  return () => (
    <MiniCanvas camera={{ position: [0, 2.4, 2.8], fov: 40 }}>
      <mesh position={[0, -0.7, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[3.4, 2.2]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.2, 0]} rotation={[-0.3, 0, 0]} castShadow>
        <boxGeometry args={[1.5, 0.8, 0.1]} />
        <meshStandardMaterial color="#f4f0e6" roughness={0.7} />
      </mesh>
    </MiniCanvas>
  );
}

function Logo() {
  return (
    <MiniCanvas camera={{ position: [0, 1.4, 3], fov: 40 }}>
      <Spin speed={0.7}>
        <mesh castShadow>
          <boxGeometry args={[1.1, 1.1, 1.1]} />
          <meshStandardMaterial color="#f59e0b" roughness={0.4} />
        </mesh>
        <mesh position={[1.15, 0.5, 0.3]}>
          <sphereGeometry args={[0.16, 18, 18]} />
          <meshStandardMaterial color="#3ddc97" roughness={0.3} />
        </mesh>
        <mesh position={[-1.15, -0.4, 0.2]}>
          <sphereGeometry args={[0.11, 18, 18]} />
          <meshStandardMaterial color="#fb7185" roughness={0.3} />
        </mesh>
      </Spin>
    </MiniCanvas>
  );
}

export const triviaMeta: GameMeta = {
  id: 'trivia',
  names: { fa: 'دانشنامه', en: 'Trivia' },
  tagline: { fa: 'سؤال‌های چهارگزینه‌ای، زنجیرهٔ برتری بساز!', en: 'Multiple-choice quiz — build a streak!' },
  minPlayers: 2,
  maxPlayers: 4,
  accent: '#f59e0b',
  Logo,
  Play: TriviaPlay,
  skins: tableSkins,
  tutorial: {
    fa: [
      {
        title: 'هدف',
        body: 'هر بازیکن ۶ سؤال چهارگزینه‌ای پاسخ می‌دهد. بیشترین امتیاز در پایان برنده است.',
      },
      {
        title: 'امتیازدهی',
        body: 'هر پاسخ درست ۱۰ امتیاز دارد و پاسخ‌های درستِ پشت‌سرهم جایزهٔ اضافه می‌آورد (+۲ به ازای هر برتری). پاسخ نادرست برتری را صفر می‌کند.',
      },
      {
        title: 'جریان بازی',
        body: 'پاسخ را روی پدهای سه‌بعدی یا دکمه‌های پایین صفحه انتخاب کن؛ بعد از نمایش نتیجه، سؤال بعدی برای نفر بعدی می‌آید.',
      },
    ],
    en: [
      {
        title: 'Goal',
        body: 'Each player answers 6 multiple-choice questions. The highest score at the end wins.',
      },
      {
        title: 'Scoring',
        body: 'A correct answer is worth 10 points, and consecutive correct answers add a streak bonus (+2 per streak). A wrong answer resets your streak.',
      },
      {
        title: 'Flow',
        body: 'Pick an answer on the 3D pads or the buttons below the board; after the reveal, the next question goes to the next player.',
      },
    ],
  },
};
