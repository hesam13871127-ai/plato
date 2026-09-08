import type { GameMeta, ShopSkin } from '../../core/types';
import { MiniCanvas, Spin } from '../../ui/three/shared';
import { PoolPlay } from './Play';
import { ballTexture } from '../../ui/three/textures';
import * as THREE from 'three';

function BallPreview({ num, scale = 1 }: { num: number; scale?: number }) {
  return (
    <mesh castShadow scale={scale}>
      <sphereGeometry args={[0.55, 24, 24]} />
      <meshStandardMaterial map={ballTexture(num)} roughness={0.22} />
    </mesh>
  );
}

const pieceSkins: ShopSkin[] = [
  {
    id: 'pool-pieces-classic',
    gameId: 'pool',
    kind: 'pieces',
    name: { fa: 'توپ‌های کلاسیک', en: 'Classic Balls' },
    price: 0,
    colors: {},
    Preview: () => (
      <MiniCanvas camera={{ position: [0, 1.2, 2.2], fov: 40 }}>
        <group position={[0, -0.15, 0]}>
          <BallPreview num={8} />
        </group>
      </MiniCanvas>
    ),
  },
  {
    id: 'pool-pieces-arcade',
    gameId: 'pool',
    kind: 'pieces',
    name: { fa: 'آرکید', en: 'Arcade' },
    price: 240,
    colors: {},
    Preview: () => (
      <MiniCanvas camera={{ position: [0, 1.2, 2.2], fov: 40 }}>
        <group position={[0, -0.15, 0]}>
          <BallPreview num={13} />
        </group>
      </MiniCanvas>
    ),
  },
];

const tableSkins: ShopSkin[] = [
  {
    id: 'pool-table-green',
    gameId: 'pool',
    kind: 'table',
    name: { fa: 'میز کلاسیک', en: 'Classic Green' },
    price: 0,
    colors: { felt: '#1a6b48', rail: '#4a3623' },
    Preview: FeltPreview('#1a6b48', '#4a3623'),
  },
  {
    id: 'pool-table-royal',
    gameId: 'pool',
    kind: 'table',
    name: { fa: 'آبی سلطنتی', en: 'Royal Blue' },
    price: 260,
    colors: { felt: '#1e4976', rail: '#232f45' },
    Preview: FeltPreview('#1e4976', '#232f45'),
  },
  {
    id: 'pool-table-crimson',
    gameId: 'pool',
    kind: 'table',
    name: { fa: 'کریمسون', en: 'Crimson' },
    price: 260,
    colors: { felt: '#7a1f2b', rail: '#3a1218' },
    Preview: FeltPreview('#7a1f2b', '#3a1218'),
  },
];

function FeltPreview(felt: string, rail: string) {
  return () => (
    <MiniCanvas camera={{ position: [0, 3.2, 3.4], fov: 40 }}>
      <mesh position={[0, -0.6, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[3.4, 1.9]} />
        <meshStandardMaterial color={felt} roughness={0.97} />
      </mesh>
      <mesh position={[0, -0.75, 0]}>
        <boxGeometry args={[3.7, 0.3, 2.2]} />
        <meshStandardMaterial color={rail} roughness={0.6} />
      </mesh>
      <group position={[-0.9, -0.38, 0]}>
        <BallPreview num={1} scale={0.55} />
      </group>
      <group position={[0, -0.38, 0]}>
        <BallPreview num={8} scale={0.55} />
      </group>
      <group position={[0.9, -0.38, 0]}>
        <BallPreview num={14} scale={0.55} />
      </group>
    </MiniCanvas>
  );
}

function Logo() {
  return (
    <MiniCanvas camera={{ position: [0, 1.5, 3.2], fov: 40 }}>
      <ambientLight intensity={0.9} />
      <directionalLight position={[2, 4, 3]} intensity={1.2} />
      <Spin speed={0.55}>
        <group position={[0, 0, 0]}>
          <BallPreview num={8} scale={1.05} />
          <mesh position={[-1.1, -0.35, -0.2]}>
            <sphereGeometry args={[0.34, 18, 18]} />
            <meshStandardMaterial map={ballTexture(3)} roughness={0.22} />
          </mesh>
          <mesh position={[1.1, -0.35, -0.2]}>
            <sphereGeometry args={[0.34, 18, 18]} />
            <meshStandardMaterial map={ballTexture(11)} roughness={0.22} />
          </mesh>
        </group>
      </Spin>
      <mesh position={[0, -1.05, 0]} rotation-x={-Math.PI / 2} rotation-z={0}>
        <circleGeometry args={[1.7, 32]} />
        <meshStandardMaterial color={new THREE.Color('#1a6b48')} roughness={0.95} />
      </mesh>
    </MiniCanvas>
  );
}

export const poolMeta: GameMeta = {
  id: 'pool',
  names: { fa: 'بیلیارد ۸', en: '8-Ball Pool' },
  tagline: { fa: 'گروهت رو تموم کن و توپ ۸ رو بنداز!', en: 'Clear your suit, then sink the 8!' },
  minPlayers: 2,
  maxPlayers: 2,
  accent: '#06b6d4',
  Logo,
  Play: PoolPlay,
  skins: [...pieceSkins, ...tableSkins],
  tutorial: {
    fa: [
      {
        title: 'هدف',
        body: 'اول گروه مهره‌هایت (تک‌رنگ ۱–۷ یا راه‌راه ۹–۱۵) را همه در جیب بینداز، بعد توپ ۸ را — اما نه زودتر از موعد!',
      },
      {
        title: 'شوت زدن',
        body: 'با حرکت ماوس روی میز نشانه بگیر (خط سبز جهت ضربه را نشان می‌دهد)، قدرت را با اسلایدر تنظیم کن و «ضربه» را بزن یا کلیک کن.',
      },
      {
        title: 'گروه‌بندی',
        body: 'میز در شروع باز است؛ اولین توپی که قانونی بیندازی گروه تو را مشخص می‌کند. حریف گروه دیگر را می‌گیرد.',
      },
      {
        title: 'خطاها',
        body: 'اگر توپ سفید در جیب بیفتد یا با هیچ توپی برخورد نکنی خطاست: نوبت می‌گذرد و توپ سفید روی نقطهٔ شروع برمی‌گردد.',
      },
      {
        title: 'توپ ۸',
        body: 'توپ ۸ را قبل از تمام‌کردن گروهت بیندازی = باخته‌ای! بعد از تموم‌کردن گروه، توپ ۸ قانونی تو برنده را قطعی می‌کند.',
      },
    ],
    en: [
      {
        title: 'Goal',
        body: 'Pot all seven balls of your suit (solids 1–7 or stripes 9–15), then sink the 8-ball — never earlier!',
      },
      {
        title: 'Shooting',
        body: 'Move the pointer over the felt to aim (green guide line), set the power with the slider, then hit Strike or click.',
      },
      {
        title: 'Open table',
        body: 'The table starts open — the first ball you legally pot assigns your suit. Your rival takes the other one.',
      },
      {
        title: 'Fouls',
        body: 'Pocketing the cue ball or hitting nothing at all is a foul: your turn ends and the cue is respotted.',
      },
      {
        title: 'The 8-ball',
        body: 'Potting the 8 before clearing your suit loses the game. After clearing it, a legal 8 wins everything.',
      },
    ],
  },
};
