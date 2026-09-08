import type { GameMeta, ShopSkin } from '../../core/types';
import { MiniCanvas, Spin } from '../../ui/three/shared';
import { BackgammonPlay } from './Play';

const pieceSkins: ShopSkin[] = [
  {
    id: 'backgammon-pieces-ivory',
    gameId: 'backgammon',
    kind: 'pieces',
    name: { fa: 'عاج و ابونوس', en: 'Ivory & Ebony' },
    price: 0,
    colors: { p0: '#efe6d2', p1: '#3b2f2a' },
    Preview: CheckerPreview('#efe6d2', '#3b2f2a'),
  },
  {
    id: 'backgammon-pieces-candy',
    gameId: 'backgammon',
    kind: 'pieces',
    name: { fa: 'آب‌نباتی', en: 'Candy' },
    price: 220,
    colors: { p0: '#67e8f9', p1: '#f472b6' },
    Preview: CheckerPreview('#67e8f9', '#f472b6'),
  },
];

const boardSkins: ShopSkin[] = [
  {
    id: 'backgammon-board-walnut',
    gameId: 'backgammon',
    kind: 'board',
    name: { fa: 'گردوی کلاسیک', en: 'Classic Walnut' },
    price: 0,
    colors: { frame: '#4a3623', felt: '#2c4a3a', triA: '#d9c9a8', triB: '#7a5230' },
    Preview: BoardPreview('#2c4a3a', '#d9c9a8', '#7a5230'),
  },
  {
    id: 'backgammon-board-crimson',
    gameId: 'backgammon',
    kind: 'board',
    name: { fa: 'کریمسون', en: 'Crimson' },
    price: 240,
    colors: { frame: '#3a1218', felt: '#5e1f2b', triA: '#e8c9a0', triB: '#8a4a52' },
    Preview: BoardPreview('#5e1f2b', '#e8c9a0', '#8a4a52'),
  },
  {
    id: 'backgammon-board-arctic',
    gameId: 'backgammon',
    kind: 'board',
    name: { fa: 'قطبی', en: 'Arctic' },
    price: 320,
    colors: { frame: '#1d2c3a', felt: '#28425a', triA: '#cfe0ee', triB: '#4a6a86' },
    Preview: BoardPreview('#28425a', '#cfe0ee', '#4a6a86'),
  },
];

function CheckerPreview(c0: string, c1: string) {
  return () => (
    <MiniCanvas camera={{ position: [0, 2.2, 2.4], fov: 40 }}>
      <group position={[-0.35, -0.2, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.5, 0.5, 0.16, 24]} />
          <meshStandardMaterial color={c0} roughness={0.5} />
        </mesh>
        <mesh castShadow position={[0, 0.16, 0]}>
          <cylinderGeometry args={[0.5, 0.5, 0.16, 24]} />
          <meshStandardMaterial color={c0} roughness={0.5} />
        </mesh>
      </group>
      <group position={[0.5, -0.2, 0.2]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.5, 0.5, 0.16, 24]} />
          <meshStandardMaterial color={c1} roughness={0.5} />
        </mesh>
      </group>
    </MiniCanvas>
  );
}

function BoardPreview(felt: string, triA: string, triB: string) {
  return () => (
    <MiniCanvas camera={{ position: [0, 3.4, 2.6], fov: 38 }}>
      <mesh position={[0, -0.35, 0]}>
        <boxGeometry args={[3.6, 0.3, 1.9]} />
        <meshStandardMaterial color="#4a3623" roughness={0.6} />
      </mesh>
      <mesh position={[0, -0.18, 0]}>
        <boxGeometry args={[3.4, 0.1, 1.7]} />
        <meshStandardMaterial color={felt} roughness={0.95} />
      </mesh>
      {Array.from({ length: 12 }, (_, i) => {
        const x = -1.5 + i * 0.28;
        const top = i % 2 === 0;
        return (
          <mesh key={i} position={[x, -0.12, top ? 0.42 : -0.42]} rotation={[top ? Math.PI : 0, 0, 0]}>
            <coneGeometry args={[0.13, 0.75, 3]} />
            <meshStandardMaterial color={top ? triA : triB} roughness={0.8} />
          </mesh>
        );
      })}
    </MiniCanvas>
  );
}

function Logo() {
  return (
    <MiniCanvas camera={{ position: [0, 2.4, 3.2], fov: 40 }}>
      <Spin speed={0.55}>
        <group position={[-0.6, 0, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.42, 0.42, 0.14, 24]} />
            <meshStandardMaterial color="#efe6d2" roughness={0.5} />
          </mesh>
          <mesh castShadow position={[0, 0.15, 0]}>
            <cylinderGeometry args={[0.42, 0.42, 0.14, 24]} />
            <meshStandardMaterial color="#efe6d2" roughness={0.5} />
          </mesh>
          <mesh castShadow position={[0, 0.3, 0]}>
            <cylinderGeometry args={[0.42, 0.42, 0.14, 24]} />
            <meshStandardMaterial color="#efe6d2" roughness={0.5} />
          </mesh>
        </group>
        <group position={[0.65, 0, 0.1]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.42, 0.42, 0.14, 24]} />
            <meshStandardMaterial color="#3b2f2a" roughness={0.5} />
          </mesh>
          <mesh castShadow position={[0, 0.15, 0]}>
            <cylinderGeometry args={[0.42, 0.42, 0.14, 24]} />
            <meshStandardMaterial color="#3b2f2a" roughness={0.5} />
          </mesh>
        </group>
      </Spin>
    </MiniCanvas>
  );
}

export const backgammonMeta: GameMeta = {
  id: 'backgammon',
  names: { fa: 'تخته نرد', en: 'Backgammon' },
  tagline: { fa: 'کهن‌ترین بازی جهان روی چوب گردو', en: 'The world’s oldest race game' },
  minPlayers: 2,
  maxPlayers: 2,
  accent: '#b45309',
  Logo,
  Play: BackgammonPlay,
  skins: [...pieceSkins, ...boardSkins],
  tutorial: {
    fa: [
      {
        title: 'هدف',
        body: 'هر ۱۵ مهرهٔ خودت را دور صفحه بچرخان و قبل از حریف همه را از صفحه خارج کن (خانگی کن).',
      },
      {
        title: 'حرکت',
        body: 'تاس بریز و مهره‌ها را به اندازهٔ تاس جلو ببر (سفیدها خلاف عقربه، سیاه‌ها با عقربه). روی هر خانه می‌توانی چند مهره داشته باشی؛ روی خانهٔ حریف که ۲ مهره یا بیشتر دارد نمی‌توانی بنشینی.',
      },
      {
        title: 'زدن و بار',
        body: 'مهرهٔ تنها حریف را می‌زنی و به «بار» می‌فرستی. مهرهٔ باری باید قبل از هر حرکت دیگری از نوار وسط وارد صفحه شود!',
      },
      {
        title: 'جفت',
        body: 'اگر دو تاس یک عدد بیاید (جفت)، آن عدد را ۴ بار بازی می‌کنی.',
      },
      {
        title: 'خانگی کردن',
        body: 'وقتی همهٔ مهره‌هایت در ۶ خانهٔ آخر (خانگی) باشند، با تاس دقیق آن‌ها را از صفحه خارج می‌کنی. اگر تاس بزرگ‌تر از فاصله باشد و مهرهٔ دورتری نباشد، دورترین مهره خارج می‌شود.',
      },
    ],
    en: [
      {
        title: 'Goal',
        body: 'Race all 15 of your checkers around the board and bear them off before your rival does.',
      },
      {
        title: 'Moving',
        body: 'Roll the dice and advance checkers accordingly (white counter-clockwise, black clockwise). You may stack your checkers freely; you cannot land on a point where the rival holds two or more.',
      },
      {
        title: 'Hitting & the bar',
        body: 'A lone rival checker gets hit and sent to the bar. Barred checkers must re-enter before anything else may move!',
      },
      {
        title: 'Doubles',
        body: 'Roll a double and you play that number four times.',
      },
      {
        title: 'Bearing off',
        body: 'Once all your checkers are in your home board, roll exact numbers to bear them off. A larger roll may bear off the farthest checker when nothing farther remains.',
      },
    ],
  },
};
