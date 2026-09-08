import type { GameMeta, ShopSkin } from '../../core/types';
import { MiniCanvas, Spin } from '../../ui/three/shared';
import { MinesPlay } from './Play';

const boardSkins: ShopSkin[] = [
  {
    id: 'mines-stone',
    gameId: 'mines',
    kind: 'board',
    name: { fa: 'سنگ خاکستری', en: 'Grey Stone' },
    price: 0,
    colors: { tile: '#a8a29e' },
    Preview: BoardPreview('#a8a29e'),
  },
  {
    id: 'mines-sand',
    gameId: 'mines',
    kind: 'board',
    name: { fa: 'شن کویری', en: 'Desert Sand' },
    price: 260,
    colors: { tile: '#d6bb8b' },
    Preview: BoardPreview('#d6bb8b'),
  },
  {
    id: 'mines-mint',
    gameId: 'mines',
    kind: 'board',
    name: { fa: 'نعنایی', en: 'Mint Chip' },
    price: 420,
    colors: { tile: '#a7d7c5' },
    Preview: BoardPreview('#a7d7c5'),
  },
];

function BoardPreview(tile: string) {
  return () => (
    <MiniCanvas camera={{ position: [0, 1.6, 1.9], fov: 44 }}>
      {[-0.3, 0, 0.3].map((z, r) =>
        [-0.3, 0, 0.3].map((x, c) => (
          <mesh key={`${r}-${c}`} position={[x, r === 1 && c === 1 ? 0.14 : 0.02, z]} castShadow>
            <boxGeometry args={[0.26, 0.16, 0.26]} />
            <meshStandardMaterial color={r === 1 && c === 1 ? '#7f1d1d' : tile} roughness={0.85} />
          </mesh>
        )),
      )}
    </MiniCanvas>
  );
}

function Logo() {
  return (
    <MiniCanvas camera={{ position: [0.6, 1.1, 1.9], fov: 44 }}>
      <Spin speed={0.7}>
        {/* classic mine ball */}
        <mesh castShadow>
          <sphereGeometry args={[0.62, 26, 20]} />
          <meshStandardMaterial color="#1c1917" roughness={0.35} metalness={0.5} />
        </mesh>
        {/* highlight */}
        <mesh position={[-0.2, 0.24, 0.42]}>
          <sphereGeometry args={[0.1, 12, 12]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.2} />
        </mesh>
        {/* spikes */}
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62]} rotation-z={-a} castShadow>
              <cylinderGeometry args={[0.03, 0.05, 0.24, 6]} />
              <meshStandardMaterial color="#292524" roughness={0.4} metalness={0.6} />
            </mesh>
          );
        })}
        {/* fuse spark */}
        <mesh position={[0, 0.75, 0]}>
          <sphereGeometry args={[0.08, 10, 10]} />
          <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={2} />
        </mesh>
      </Spin>
    </MiniCanvas>
  );
}

export const minesMeta: GameMeta = {
  id: 'mines',
  names: { fa: 'مین‌روب', en: 'Minesweepers' },
  tagline: { fa: 'میدان مین مشترک — امتیاز جمع کن، منفجر نشو!', en: 'Shared minefield — grab points, dodge boom!' },
  minPlayers: 2,
  maxPlayers: 4,
  accent: '#f97316',
  Logo,
  Play: MinesPlay,
  skins: boardSkins,
  tutorial: {
    fa: [
      {
        title: 'میدان مشترک',
        body: 'همه روی یک تختهٔ ۱۲×۱۲ با ۲۲ مین بازی می‌کنند. خانه‌هایی که تو باز کنی به رنگ تو درمی‌آیند و هر خانهٔ سالم ۱ امتیاز دارد.',
      },
      {
        title: 'نخستین حرکت امن است',
        body: 'اولین خانه‌ای که در کل بازی باز شود هیچ‌وقت مین نیست — پس بی‌خیال شروع کن! اعداد روی خانه‌ها یعنی چند مین در خانه‌های مجاور است؛ خانهٔ صفر به‌صورت خودکار باز می‌شود.',
      },
      {
        title: 'انفجار',
        body: 'اگر روی مین بروی ۵− امتیاز می‌گیری و نوبت رد می‌شود. وقتی همهٔ خانه‌های سالم باز شود، بیشترین امتیاز برنده است.',
      },
    ],
    en: [
      {
        title: 'Shared field',
        body: 'Everyone races on the same 12×12 board with 22 mines. Cells you reveal take your colour — every safe cell is +1 point.',
      },
      {
        title: 'First click is safe',
        body: 'The very first reveal of the game is never a mine — open anywhere! Numbers count neighbouring mines; a zero opens its whole neighbourhood automatically.',
      },
      {
        title: 'Boom',
        body: 'Step on a mine and you lose 5 points and the turn passes. When all safe cells are open, the highest score wins.',
      },
    ],
  },
};
