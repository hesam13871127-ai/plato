import type { GameMeta, ShopSkin } from '../../core/types';
import { MiniCanvas, Spin } from '../../ui/three/shared';
import { LudoPlay } from './Play';
import { Die3D, LudoPawn } from './Board';
import { LUDO_COLORS } from './engine';

/* ---------------- skins ---------------- */

const pieceSkins: ShopSkin[] = [
  {
    id: 'ludo-pieces-classic',
    gameId: 'ludo',
    kind: 'pieces',
    name: { fa: 'کلاسیک مات', en: 'Classic Matte' },
    price: 0,
    colors: {},
    finish: 'matte',
    Preview: () => (
      <MiniCanvas>
        <group position={[0, -0.35, 0]}>
          <LudoPawn color={LUDO_COLORS[0]!} />
        </group>
      </MiniCanvas>
    ),
  },
  {
    id: 'ludo-pieces-metal',
    gameId: 'ludo',
    kind: 'pieces',
    name: { fa: 'فلز براق', en: 'Polished Metal' },
    price: 200,
    colors: {},
    finish: 'metal',
    Preview: () => (
      <MiniCanvas>
        <group position={[0, -0.35, 0]}>
          <LudoPawn color="#eab308" skin={{ finish: 'metal' }} />
        </group>
      </MiniCanvas>
    ),
  },
  {
    id: 'ludo-pieces-gem',
    gameId: 'ludo',
    kind: 'pieces',
    name: { fa: 'جواهر', en: 'Gemstone' },
    price: 380,
    colors: {},
    finish: 'gem',
    Preview: () => (
      <MiniCanvas>
        <group position={[0, -0.35, 0]}>
          <LudoPawn color="#3b82f6" skin={{ finish: 'gem' }} />
        </group>
      </MiniCanvas>
    ),
  },
];

const boardSkins: ShopSkin[] = [
  {
    id: 'ludo-board-classic',
    gameId: 'ludo',
    kind: 'board',
    name: { fa: 'تختهٔ کلاسیک', en: 'Classic Board' },
    price: 0,
    colors: { base: '#f2ecdd', rim: '#3a2c1d', cell: '#f7f2e3' },
    Preview: BoardPreview('#f2ecdd', '#3a2c1d'),
  },
  {
    id: 'ludo-board-walnut',
    gameId: 'ludo',
    kind: 'board',
    name: { fa: 'چوب گردو', en: 'Walnut Wood' },
    price: 240,
    colors: { base: '#d9b98c', rim: '#5a3d24', cell: '#f1e2c8' },
    Preview: BoardPreview('#d9b98c', '#5a3d24'),
  },
  {
    id: 'ludo-board-obsidian',
    gameId: 'ludo',
    kind: 'board',
    name: { fa: 'ابسیدین', en: 'Obsidian' },
    price: 420,
    colors: { base: '#232130', rim: '#0d0b16', cell: '#3a3450' },
    Preview: BoardPreview('#232130', '#0d0b16'),
  },
];

function BoardPreview(base: string, rim: string) {
  return () => (
    <MiniCanvas camera={{ position: [0, 3.2, 3.4], fov: 40 }}>
      <mesh position={[0, -0.55, 0]} castShadow>
        <boxGeometry args={[2.6, 0.3, 2.6]} />
        <meshStandardMaterial color={rim} roughness={0.7} />
      </mesh>
      <mesh position={[0, -0.36, 0]}>
        <boxGeometry args={[2.3, 0.12, 2.3]} />
        <meshStandardMaterial color={base} roughness={0.9} />
      </mesh>
      {LUDO_COLORS.slice(0, 4).map((c, i) => {
        const x = i % 2 === 0 ? -0.6 : 0.6;
        const z = i < 2 ? -0.6 : 0.6;
        return (
          <mesh key={i} position={[x, -0.29, z]}>
            <boxGeometry args={[0.9, 0.06, 0.9]} />
            <meshStandardMaterial color={c} roughness={0.7} />
          </mesh>
        );
      })}
    </MiniCanvas>
  );
}

/* ---------------- logo ---------------- */

function Logo() {
  return (
    <MiniCanvas camera={{ position: [0, 2.4, 4.2], fov: 40 }}>
      <Spin speed={0.55}>
        <group position={[-0.65, 0, 0]}>
          <LudoPawn color={LUDO_COLORS[0]!} />
        </group>
        <group position={[0.75, 0.1, 0.1]}>
          <Die3D value={6} spinning={false} position={[0, 0, 0]} colors={{ face: '#fbf5e4', pip: '#221d15' }} />
        </group>
      </Spin>
    </MiniCanvas>
  );
}

/* ---------------- meta ---------------- */

export const ludoMeta: GameMeta = {
  id: 'ludo',
  names: { fa: 'منچ', en: 'Ludo' },
  tagline: { fa: 'تاس بریز، خانه برو، رفیقت رو بزن!', en: 'Roll, race, and send rivals home' },
  minPlayers: 2,
  maxPlayers: 4,
  accent: '#22c55e',
  Logo,
  Play: LudoPlay,
  skins: [...pieceSkins, ...boardSkins],
  tutorial: {
    fa: [
      {
        title: 'هدف',
        body: 'هر ۴ مهره‌ات را از حیاط به مرکز صفحه (خانه) برسان. اولین بازیکنی که هر ۴ مهره‌اش را به خانه ببرد برنده است.',
      },
      {
        title: 'شروع حرکت',
        body: 'با آوردن ۶ مهره از حیاط خارج می‌شود و روی خانهٔ شروع رنگ خودت قرار می‌گیرد. با هر ۶ یک بار دیگر هم تاس می‌اندازی!',
      },
      {
        title: 'حرکت و زدن',
        body: 'مهره‌ها به اندازهٔ عدد تاس در مسیر حرکت می‌کنند (۵۲ خانه). اگر روی خانهٔ سادهٔ حریف فرود بیایی، مهرهٔ او به حیاط برمی‌گردد. خانه‌های ستاره‌دار و خانه‌های شروع امن هستند.',
      },
      {
        title: 'ستون رنگی و خانه',
        body: 'بعد از یک دور کامل، مهره وارد ستون رنگی خودت می‌شود. برای رسیدن به خانه باید عدد دقیق بیاوری؛ عدد اضافه مجاز نیست.',
      },
      {
        title: 'سه شش',
        body: 'اگر سه بار پشت سر هم ۶ بیاوری، نوبتت سوخته می‌شود و می‌گذرد به بازیکن بعدی!',
      },
    ],
    en: [
      {
        title: 'Goal',
        body: 'Bring all four of your tokens from the yard to the center home. First player to get all four home wins.',
      },
      {
        title: 'Getting out',
        body: 'Roll a 6 to release a token onto your colored start cell. Every 6 grants an extra roll!',
      },
      {
        title: 'Moving & capturing',
        body: 'Tokens advance around the 52-cell track by the dice value. Landing on an opponent on a plain cell sends it back to the yard. Star cells and start cells are safe.',
      },
      {
        title: 'Home column',
        body: 'After a full lap, a token enters its colored home column. You need the exact roll to step into home — overshooting is not allowed.',
      },
      {
        title: 'Three sixes',
        body: 'Roll three sixes in a row and your turn is forfeited!',
      },
    ],
  },
};
