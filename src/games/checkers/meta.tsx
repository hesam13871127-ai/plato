import type { GameMeta, ShopSkin } from '../../core/types';
import { MiniCanvas, Spin } from '../../ui/three/shared';
import { CheckersPlay } from './Play';
import { CheckerPiece } from './Board';

/* ---------------- skins ---------------- */

const pieceSkins: ShopSkin[] = [
  {
    id: 'checkers-pieces-walnut',
    gameId: 'checkers',
    kind: 'pieces',
    name: { fa: 'چوب گردو', en: 'Walnut' },
    price: 0,
    colors: { p0: '#f0e6d2', p1: '#3b2f2a' },
    finish: 'matte',
    Preview: () => (
      <MiniCanvas>
        <group position={[0, -0.28, 0]}>
          <CheckerPiece color="#f0e6d2" />
        </group>
      </MiniCanvas>
    ),
  },
  {
    id: 'checkers-pieces-onyx',
    gameId: 'checkers',
    kind: 'pieces',
    name: { fa: 'ابونوس و شنگرف', en: 'Onyx & Vermilion' },
    price: 200,
    colors: { p0: '#181818', p1: '#c0392b' },
    finish: 'matte',
    Preview: () => (
      <MiniCanvas>
        <group position={[0, -0.28, 0]}>
          <CheckerPiece color="#181818" />
        </group>
      </MiniCanvas>
    ),
  },
  {
    id: 'checkers-pieces-crystal',
    gameId: 'checkers',
    kind: 'pieces',
    name: { fa: 'بلور', en: 'Crystal' },
    price: 360,
    colors: { p0: '#a5f3fc', p1: '#e2e8f0' },
    finish: 'gem',
    Preview: () => (
      <MiniCanvas>
        <group position={[0, -0.28, 0]}>
          <CheckerPiece color="#a5f3fc" skin={{ finish: 'gem' }} />
        </group>
      </MiniCanvas>
    ),
  },
];

const boardSkins: ShopSkin[] = [
  {
    id: 'checkers-board-walnut',
    gameId: 'checkers',
    kind: 'board',
    name: { fa: 'تختهٔ گردو', en: 'Walnut Board' },
    price: 0,
    colors: { light: '#e8d5b0', dark: '#7a5230', rim: '#3a2c1d' },
    Preview: BoardPreview('#e8d5b0', '#7a5230'),
  },
  {
    id: 'checkers-board-slate',
    gameId: 'checkers',
    kind: 'board',
    name: { fa: 'سنگ اسلیت', en: 'Slate Stone' },
    price: 220,
    colors: { light: '#94a3b8', dark: '#1e293b', rim: '#0f172a' },
    Preview: BoardPreview('#94a3b8', '#1e293b'),
  },
  {
    id: 'checkers-board-neon',
    gameId: 'checkers',
    kind: 'board',
    name: { fa: 'نئون', en: 'Neon Grid' },
    price: 380,
    colors: { light: '#161628', dark: '#242447', rim: '#0d0b16' },
    Preview: BoardPreview('#161628', '#242447'),
  },
];

function BoardPreview(light: string, dark: string) {
  return () => (
    <MiniCanvas camera={{ position: [0, 3, 3.4], fov: 40 }}>
      <group position={[0, -0.55, 0]} rotation-x={-Math.PI / 2}>
        {Array.from({ length: 16 }, (_, i) => {
          const r = Math.floor(i / 4);
          const c = i % 4;
          return (
            <mesh key={i} position={[(c - 1.5) * 0.62, (r - 1.5) * 0.62, 0.01]}>
              <planeGeometry args={[0.62, 0.62]} />
              <meshStandardMaterial color={(r + c) % 2 === 0 ? light : dark} roughness={0.85} />
            </mesh>
          );
        })}
      </group>
      <group position={[-0.31, -0.28, -0.31]}>
        <CheckerPiece color="#f0e6d2" />
      </group>
      <group position={[0.31, -0.28, 0.31]}>
        <CheckerPiece color="#3b2f2a" />
      </group>
    </MiniCanvas>
  );
}

/* ---------------- logo ---------------- */

function Logo() {
  return (
    <MiniCanvas camera={{ position: [0, 2.2, 4.4], fov: 40 }}>
      <Spin speed={0.55}>
        <group position={[-0.55, 0, 0]}>
          <CheckerPiece color="#f0e6d2" />
        </group>
        <group position={[0.55, 0, 0.1]}>
          <CheckerPiece color="#3b2f2a" king />
        </group>
      </Spin>
    </MiniCanvas>
  );
}

/* ---------------- meta ---------------- */

export const checkersMeta: GameMeta = {
  id: 'checkers',
  names: { fa: 'داما', en: 'Checkers' },
  tagline: { fa: 'بزن، بپر، پادشاه شو', en: 'Jump, capture, crown your kings' },
  minPlayers: 2,
  maxPlayers: 2,
  accent: '#eab308',
  Logo,
  Play: CheckersPlay,
  skins: [...pieceSkins, ...boardSkins],
  tutorial: {
    fa: [
      {
        title: 'هدف',
        body: 'همهٔ مهره‌های حریف را بزن یا طوری بازی کن که هیچ حرکتی برایش نماند. مهره‌ها فقط روی خانه‌های تیره حرکت می‌کنند.',
      },
      {
        title: 'حرکت ساده',
        body: 'مهرهٔ معمولی یک خانه به‌صورت مورب و فقط به جلو حرکت می‌کند. نوبت‌ها یکی‌درمیان است و زدن اجباری است!',
      },
      {
        title: 'زدن و زنجیره',
        body: 'اگر مهرهٔ حریف در خانهٔ مورب مجاورت باشد و خانهٔ بعدیِ او خالی، از رویش می‌پری و می‌زنی‌اش. اگر بعد از زدن بتوانی دوباره بزنی، باید زنجیره را ادامه بدهی.',
      },
      {
        title: 'پادشاه شدن',
        body: 'مهره‌ای که به ردیف آخر برسد «پادشاه» می‌شود و می‌تواند به هر دو جهت جلو و عقب حرکت و ضربه بزند. تاج طلایی رویش می‌نشیند!',
      },
    ],
    en: [
      {
        title: 'Goal',
        body: 'Capture all enemy pieces or leave them with no legal move. Pieces only ever move on dark squares.',
      },
      {
        title: 'Simple move',
        body: 'A man moves one square diagonally forward. Turns alternate — and captures are mandatory!',
      },
      {
        title: 'Capturing & chains',
        body: 'If an enemy piece is diagonally adjacent with an empty square behind it, you jump and capture it. If another capture is available afterwards you must keep jumping with the same piece.',
      },
      {
        title: 'Kings',
        body: "A man reaching the far row is crowned a king and may move and capture both forward and backward — it gets a golden crown!",
      },
    ],
  },
};
