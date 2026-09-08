import type { GameMeta, ShopSkin } from '../../core/types';
import { MiniCanvas, Spin } from '../../ui/three/shared';
import { SkeePlay } from './Play';

const boardSkins: ShopSkin[] = [
  {
    id: 'skee-maple',
    gameId: 'skee',
    kind: 'board',
    name: { fa: 'چوب افرا', en: 'Maple Lane' },
    price: 0,
    colors: { lane: '#d9c69b', ramp: '#b45309' },
    Preview: LanePreview('#d9c69b', '#b45309'),
  },
  {
    id: 'skee-neon',
    gameId: 'skee',
    kind: 'board',
    name: { fa: 'نئون آرکید', en: 'Arcade Neon' },
    price: 340,
    colors: { lane: '#312e81', ramp: '#4f46e5' },
    Preview: LanePreview('#312e81', '#4f46e5'),
  },
  {
    id: 'skee-cherry',
    gameId: 'skee',
    kind: 'board',
    name: { fa: 'گیلاسی', en: 'Cherry Wood' },
    price: 480,
    colors: { lane: '#9a3412', ramp: '#7c2d12' },
    Preview: LanePreview('#9a3412', '#7c2d12'),
  },
];

function LanePreview(lane: string, ramp: string) {
  return () => (
    <MiniCanvas camera={{ position: [0, 1.1, 1.9], fov: 46 }}>
      <mesh castShadow>
        <boxGeometry args={[1.4, 0.12, 0.6]} />
        <meshStandardMaterial color={ramp} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.02, 0.7]} rotation-x={-0.35}>
        <boxGeometry args={[1.4, 0.05, 0.9]} />
        <meshStandardMaterial color={lane} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.16, -0.35]} castShadow>
        <sphereGeometry args={[0.14, 14, 12]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.1, -0.6]}>
        <cylinderGeometry args={[0.16, 0.16, 0.08, 20]} />
        <meshStandardMaterial color="#0c0a09" />
      </mesh>
    </MiniCanvas>
  );
}

function Logo() {
  return (
    <MiniCanvas camera={{ position: [0.5, 0.9, 2] , fov: 44 }}>
      <Spin speed={0.8}>
        {/* ball */}
        <mesh position={[0, 0.5, 0]} castShadow>
          <sphereGeometry args={[0.55, 24, 18]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.3} />
        </mesh>
        {/* 100 ring */}
        <mesh rotation-x={Math.PI / 2} position={[0, 0.5, 0]}>
          <torusGeometry args={[0.72, 0.05, 10, 32]} />
          <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.5} />
        </mesh>
        {/* hole below */}
        <mesh position={[0, -0.35, 0]}>
          <cylinderGeometry args={[0.4, 0.4, 0.1, 24]} />
          <meshStandardMaterial color="#0c0a09" />
        </mesh>
        <mesh position={[0, -0.3, 0]}>
          <cylinderGeometry args={[0.44, 0.44, 0.06, 24]} />
          <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={0.3} />
        </mesh>
      </Spin>
    </MiniCanvas>
  );
}

export const skeeMeta: GameMeta = {
  id: 'skee',
  names: { fa: 'اسکی‌بال', en: 'Skeeball' },
  tagline: { fa: '۹ توپ، شیب تند، حفرهٔ ۱۰۰ امتیازی', en: '9 balls up the ramp — chase the 100 hole!' },
  minPlayers: 2,
  maxPlayers: 4,
  accent: '#fbbf24',
  Logo,
  Play: SkeePlay,
  skins: boardSkins,
  tutorial: {
    fa: [
      {
        title: 'پرتاب',
        body: 'با دو اسلایدر زاویه و قدرت را تنظیم کن و «پرتاب» را بزن. توپ از پایین لاین به سمت بالا می‌رود؛ شیب وسط راه سرعتش را می‌گیرد.',
      },
      {
        title: 'حفره‌ها',
        body: '۸ حفره با امتیازهای ۱۰۰ (وسطِ دور)، ۵۰، ۳۰ و ۲۰. فقط توپِ آرام در حفره می‌افتد — توپ پرسرعت از رویش رد می‌شود!',
      },
      {
        title: 'امتیاز',
        body: 'هر بازیکن ۹ توپ دارد. مجموع امتیاز حفره‌ها می‌شمارد؛ اگر توپ به لاین برگردد ۰ امتیاز است. بیشترین مجموع برنده است.',
      },
    ],
    en: [
      {
        title: 'Rolling',
        body: 'Set angle and power with the two sliders, then hit Roll. The ball launches up the lane — the mid ramp scrubs its speed.',
      },
      {
        title: 'Holes',
        body: 'Eight holes worth 100 (center-back), 50, 30 and 20. Only a SLOW ball drops in — fast balls fly right over the rings!',
      },
      {
        title: 'Scoring',
        body: 'Each player rolls 9 balls. Hole points accumulate; a ball that rolls back down scores nothing. Highest total wins.',
      },
    ],
  },
};
