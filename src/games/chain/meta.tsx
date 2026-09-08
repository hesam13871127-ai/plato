import type { GameMeta, ShopSkin } from '../../core/types';
import { MiniCanvas, Spin } from '../../ui/three/shared';
import { ChainPlay } from './Play';
import { LetterTower } from './Board';

const tableSkins: ShopSkin[] = [
  {
    id: 'chain-table-forest',
    gameId: 'chain',
    kind: 'table',
    name: { fa: 'میز جنگلی', en: 'Forest Table' },
    price: 0,
    colors: { felt: '#1e2b1e' },
    Preview: FeltPreview('#1e2b1e'),
  },
  {
    id: 'chain-table-slate',
    gameId: 'chain',
    kind: 'table',
    name: { fa: 'تخته‌سیاهی', en: 'Chalkboard' },
    price: 180,
    colors: { felt: '#1f2430' },
    Preview: FeltPreview('#1f2430'),
  },
];

function FeltPreview(color: string) {
  return () => (
    <MiniCanvas camera={{ position: [0, 2.6, 3], fov: 40 }}>
      <mesh position={[0, -0.7, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[3.4, 2.2]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      <group position={[0, 0.45, 0]} scale={0.5}>
        <LetterTower letter="س" accent="#a3e635" />
      </group>
    </MiniCanvas>
  );
}

function Logo() {
  return (
    <MiniCanvas camera={{ position: [0, 1.5, 3.1], fov: 40 }}>
      <Spin speed={0.65}>
        <group position={[-0.85, 0.2, 0]} scale={0.62}>
          <LetterTower letter="س" accent="#a3e635" />
        </group>
        <group position={[0.85, -0.25, 0.1]} scale={0.62}>
          <LetterTower letter="ب" accent="#f472b6" />
        </group>
      </Spin>
    </MiniCanvas>
  );
}

export const chainMeta: GameMeta = {
  id: 'chain',
  names: { fa: 'زنجیرهٔ کلمات', en: 'Word Chain' },
  tagline: { fa: 'آخرِ کلمه، اولِ کلمهٔ بعد!', en: "Last letter in, first letter out!" },
  minPlayers: 2,
  maxPlayers: 4,
  accent: '#a3e635',
  Logo,
  Play: ChainPlay,
  skins: tableSkins,
  tutorial: {
    fa: [
      {
        title: 'هدف',
        body: 'هر بازیکن باید کلمه‌ای بگوید که با حرفِ روی برج شروع شود. آخرین حرفِ کلمهٔ شما، حرف شروعِ نفر بعدی می‌شود.',
      },
      {
        title: 'جان‌ها',
        body: 'هر بازیکن ۳ جان دارد. اگر جواب نداشتی «جواب نمی‌دارم» را بزن تا یک جان از دست بدهی؛ حرف عوض نمی‌شود و نفر بعدی باید جواب بدهد. آخرین بازمانده برنده است.',
      },
      {
        title: 'قانون‌ها',
        body: 'کلمه باید در واژه‌نامهٔ بازی باشد، تکراری نباشد و حداقل دو حرف داشته باشد. اگر برای حرفی هیچ کلمه‌ای نمانده باشد، دکمهٔ «حرف جدید» فعال می‌شود و بدون جریمه حرف عوض می‌شود.',
      },
    ],
    en: [
      {
        title: 'Goal',
        body: 'Say a word that starts with the letter on the tower. The last letter of your word becomes the starting letter for the next player.',
      },
      {
        title: 'Lives',
        body: 'Everyone has 3 lives. Out of ideas? Hit "No idea" to lose a life — the letter stays and the next player must answer. Last one standing wins.',
      },
      {
        title: 'Rules',
        body: 'Words must be in the game lexicon, unused, and at least 2 letters long. When a letter has no words left, the "New letter" button appears and swaps it for free.',
      },
    ],
  },
};
