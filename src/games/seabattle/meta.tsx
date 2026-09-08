import type { GameMeta, ShopSkin } from '../../core/types';
import { MiniCanvas, Spin } from '../../ui/three/shared';
import { SeaBattlePlay } from './Play';

const tableSkins: ShopSkin[] = [
  {
    id: 'seabattle-ocean',
    gameId: 'seabattle',
    kind: 'table',
    name: { fa: 'اقیانوس آبی', en: 'Blue Ocean' },
    price: 0,
    colors: { felt: '#1e3a8a' },
    Preview: FeltPreview('#1e3a8a'),
  },
  {
    id: 'seabattle-night',
    gameId: 'seabattle',
    kind: 'table',
    name: { fa: 'دریای شب', en: 'Midnight Sea' },
    price: 260,
    colors: { felt: '#0c2340' },
    Preview: FeltPreview('#0c2340'),
  },
  {
    id: 'seabattle-tropical',
    gameId: 'seabattle',
    kind: 'table',
    name: { fa: 'آب‌های استوایی', en: 'Tropical Waters' },
    price: 420,
    colors: { felt: '#0e7490' },
    Preview: FeltPreview('#0e7490'),
  },
];

function FeltPreview(color: string) {
  return () => (
    <MiniCanvas camera={{ position: [0, 1.4, 2.2], fov: 42 }}>
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[2.4, 2.4]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.1, 0]} castShadow>
        <boxGeometry args={[0.7, 0.16, 0.2]} />
        <meshStandardMaterial color="#57534e" metalness={0.3} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.24, 0]} castShadow>
        <boxGeometry args={[0.12, 0.22, 0.12]} />
        <meshStandardMaterial color="#57534e" metalness={0.3} roughness={0.5} />
      </mesh>
    </MiniCanvas>
  );
}

function Logo() {
  return (
    <MiniCanvas camera={{ position: [0.9, 0.9, 2.1], fov: 42 }}>
      <Spin speed={0.5}>
        {/* hull */}
        <mesh position={[0, 0.12, 0]} castShadow>
          <boxGeometry args={[1.1, 0.22, 0.34]} />
          <meshStandardMaterial color="#4b5563" metalness={0.35} roughness={0.45} />
        </mesh>
        {/* bow wedge */}
        <mesh position={[0.62, 0.12, 0]} rotation-z={Math.PI / 4} castShadow>
          <boxGeometry args={[0.26, 0.26, 0.34]} />
          <meshStandardMaterial color="#4b5563" metalness={0.35} roughness={0.45} />
        </mesh>
        {/* bridge */}
        <mesh position={[-0.08, 0.32, 0]} castShadow>
          <boxGeometry args={[0.34, 0.2, 0.26]} />
          <meshStandardMaterial color="#6b7280" metalness={0.3} roughness={0.5} />
        </mesh>
        {/* guns */}
        <mesh position={[0.34, 0.3, 0]} rotation-z={0.5} castShadow>
          <cylinderGeometry args={[0.03, 0.03, 0.34, 8]} />
          <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.4} />
        </mesh>
        {/* mast */}
        <mesh position={[-0.08, 0.55, 0]} castShadow>
          <cylinderGeometry args={[0.02, 0.02, 0.32, 8]} />
          <meshStandardMaterial color="#9ca3af" metalness={0.6} roughness={0.3} />
        </mesh>
        {/* waves */}
        {[0.85, 1.15, 1.45].map((r, i) => (
          <mesh key={i} rotation-x={-Math.PI / 2} position={[0, 0.01, 0]}>
            <ringGeometry args={[r, r + 0.07, 48]} />
            <meshStandardMaterial color="#38bdf8" transparent opacity={0.5 - i * 0.14} />
          </mesh>
        ))}
        <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]}>
          <circleGeometry args={[2.4, 48]} />
          <meshStandardMaterial color="#1d4ed8" roughness={0.9} />
        </mesh>
      </Spin>
    </MiniCanvas>
  );
}

export const seaMeta: GameMeta = {
  id: 'seabattle',
  names: { fa: 'نبرد دریایی', en: 'Sea Battle' },
  tagline: { fa: 'ناوگان دشمن را غرق کن!', en: 'Hunt down the enemy fleet!' },
  minPlayers: 2,
  maxPlayers: 2,
  accent: '#22d3ee',
  Logo,
  Play: SeaBattlePlay,
  skins: tableSkins,
  tutorial: {
    fa: [
      {
        title: 'چیدن ناوگان',
        body: 'در شروع، چیدمان تصادفی ناوگانت را می‌بینی. با «چیدمان جدید» می‌توانی عوضش کنی و با «آماده!» آن را قفل کن. ناوگان ۵ کشتی دارد: ۵، ۴، ۳، ۳ و ۲ خانه‌ای.',
      },
      {
        title: 'شلیک',
        body: 'روی آب‌های دشمن (تختهٔ راست) خانه‌ای را انتخاب کن. اگر بخورد 🔴 نوبت دوباره مال توست؛ اگر خطا رفت ⚪ نوبت به حریف می‌رسد.',
      },
      {
        title: 'غرق کردن',
        body: 'وقتی همهٔ خانه‌های یک کشتی زده شود، لاشهٔ آن سیاه می‌شود و برای همه اعلام می‌شود. اولین نفری که هر ۵ کشتی حریف را غرق کند برنده است.',
      },
    ],
    en: [
      {
        title: 'Placing your fleet',
        body: 'You start with a random layout of your fleet — reroll it if you dislike it, then hit Ready. The fleet is 5 ships of sizes 5, 4, 3, 3 and 2.',
      },
      {
        title: 'Firing',
        body: 'Click a cell in the enemy waters (right board). A hit 🔴 keeps your turn; a miss ⚪ passes it to the opponent.',
      },
      {
        title: 'Sinking',
        body: 'When every cell of a ship is hit, its wreck turns dark and is announced to both players. First to sink all 5 enemy ships wins.',
      },
    ],
  },
};
