import type { GameMeta, ShopSkin } from '../../core/types';
import { MiniCanvas, Spin } from '../../ui/three/shared';
import { SnakesPlay } from './Play';
import { SnakesMeeple } from './Board';
import { snakesBoardTexture } from '../../ui/three/textures';
import { LADDERS, SNAKES } from './engine';

const boardSkins: ShopSkin[] = [
  {
    id: 'snakes-board-parchment',
    gameId: 'snakes',
    kind: 'board',
    name: { fa: 'پارچمنت کلاسیک', en: 'Classic Parchment' },
    price: 0,
    colors: { light: '#f2e9d8', dark: '#d8c7a9', line: 'rgba(60,40,20,0.5)', rim: '#7a5230' },
    Preview: BoardPreview('#f2e9d8', '#d8c7a9'),
  },
  {
    id: 'snakes-board-meadow',
    gameId: 'snakes',
    kind: 'board',
    name: { fa: 'چمنزار', en: 'Meadow' },
    price: 200,
    colors: { light: '#dcefcf', dark: '#b5d9a0', line: 'rgba(30,60,25,0.45)', rim: '#3f5a2e' },
    Preview: BoardPreview('#dcefcf', '#b5d9a0'),
  },
  {
    id: 'snakes-board-candy',
    gameId: 'snakes',
    kind: 'board',
    name: { fa: 'آب‌نباتی', en: 'Candy' },
    price: 320,
    colors: { light: '#fde8f1', dark: '#f9c9df', line: 'rgba(120,30,80,0.35)', rim: '#a13d75' },
    Preview: BoardPreview('#fde8f1', '#f9c9df'),
  },
];

function BoardPreview(light: string, dark: string) {
  return () => (
    <MiniCanvas camera={{ position: [0, 3.1, 3.1], fov: 40 }}>
      <group position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh>
          <planeGeometry args={[2.9, 2.9]} />
          <meshBasicMaterial map={snakesBoardTexture({ light, dark, line: 'rgba(60,40,20,0.5)' }, SNAKES, LADDERS)} />
        </mesh>
      </group>
      <group position={[-0.5, -0.2, 0.6]}>
        <SnakesMeeple color="#8b5cf6" />
      </group>
      <group position={[0.55, -0.2, -0.4]}>
        <SnakesMeeple color="#f59e0b" />
      </group>
    </MiniCanvas>
  );
}

function Logo() {
  return (
    <MiniCanvas camera={{ position: [0, 1.9, 3.4], fov: 40 }}>
      <Spin speed={0.55}>
        {/* dice + snake coil */}
        <mesh castShadow position={[-0.7, 0.3, 0]} rotation={[0.5, 0.4, 0]}>
          <boxGeometry args={[0.55, 0.55, 0.55]} />
          <meshStandardMaterial color="#fbf5e4" roughness={0.4} />
        </mesh>
        <group position={[0.75, 0, 0]}>
          {[0, 1, 2].map((i) => (
            <mesh key={i} castShadow position={[0, 0.18 + i * 0.16, 0]}>
              <torusGeometry args={[0.28 - i * 0.06, 0.075, 10, 24]} />
              <meshStandardMaterial color="#e05252" roughness={0.45} />
            </mesh>
          ))}
          <mesh castShadow position={[0, 0.62, 0]}>
            <sphereGeometry args={[0.14, 16, 16]} />
            <meshStandardMaterial color="#e05252" roughness={0.45} />
          </mesh>
        </group>
      </Spin>
    </MiniCanvas>
  );
}

export const snakesMeta: GameMeta = {
  id: 'snakes',
  names: { fa: 'ماروپله', en: 'Snakes & Ladders' },
  tagline: { fa: 'بالا برو با پله، سقوط کن با مار!', en: 'Climb the ladders, dodge the snakes!' },
  minPlayers: 2,
  maxPlayers: 4,
  accent: '#4ade80',
  Logo,
  Play: SnakesPlay,
  skins: boardSkins,
  tutorial: {
    fa: [
      {
        title: 'هدف',
        body: 'اولین بازیکنی که به خانهٔ ۱۰۰ برسد برنده است. تاس بریز و مهره‌ات را به اندازهٔ عدد تاس جلو ببر.',
      },
      {
        title: 'پله‌ها 🪜',
        body: 'اگر روی پایهٔ پله فرود بیایی مستقیم به بالای آن می‌روی — خبر خوب!',
      },
      {
        title: 'مارها 🐍',
        body: 'اگر سر مار را پیدا کنی تا دُمش سُر می‌خوری و عقب می‌روی. خانه‌های ۱۶، ۴۷، ۴۹، ۶۲، ۶۴، ۸۷، ۹۳، ۹۵ و ۹۸ مار هستند.',
      },
      {
        title: 'شش بیاور',
        body: 'با آوردن ۶ یک بار دیگر تاس می‌اندازی — ولی مراقب باش مار نباشی!',
      },
    ],
    en: [
      {
        title: 'Goal',
        body: 'Be the first to reach square 100. Roll the die and advance your meeple by that many squares.',
      },
      {
        title: 'Ladders 🪜',
        body: 'Land on the foot of a ladder and shoot straight to its top — good news!',
      },
      {
        title: 'Snakes 🐍',
        body: "Find a snake's head and you slide all the way to its tail. Snakes wait at 16, 47, 49, 62, 64, 87, 93, 95 and 98.",
      },
      {
        title: 'Rolling sixes',
        body: 'A 6 grants another roll — just watch out for the snakes!',
      },
    ],
  },
};
