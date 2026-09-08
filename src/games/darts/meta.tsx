import type { GameMeta, ShopSkin } from '../../core/types';
import { MiniCanvas, Spin } from '../../ui/three/shared';
import { DartsPlay } from './Play';
import { dartboardTexture } from './Board';
import { useMemo } from 'react';
import * as THREE from 'three';

const boardSkins: ShopSkin[] = [
  {
    id: 'darts-board-classic',
    gameId: 'darts',
    kind: 'board',
    name: { fa: 'کلاسیک سرخ‌وسبز', en: 'Classic Red & Green' },
    price: 0,
    colors: { rim: '#241d31' },
    Preview: BoardPreview('#241d31'),
  },
  {
    id: 'darts-board-night',
    gameId: 'darts',
    kind: 'board',
    name: { fa: 'نئون شبانه', en: 'Neon Night' },
    price: 320,
    colors: { rim: '#0f3b45' },
    Preview: BoardPreview('#0f3b45'),
  },
];

function BoardPreview(rim: string) {
  return () => {
    const tex = useMemo(() => dartboardTexture(), []);
    return (
      <MiniCanvas camera={{ position: [0, 0, 2.6], fov: 42 }}>
        <mesh position={[0, 0, -0.1]}>
          <circleGeometry args={[1.05, 48]} />
          <meshStandardMaterial map={tex} roughness={0.85} />
        </mesh>
        <mesh position={[0, 0, -0.12]}>
          <torusGeometry args={[1.06, 0.06, 10, 48]} />
          <meshStandardMaterial color={rim} roughness={0.6} />
        </mesh>
      </MiniCanvas>
    );
  };
}

function Logo() {
  const tex = useMemo(() => dartboardTexture(), []);
  void THREE;
  return (
    <MiniCanvas camera={{ position: [0, 0.3, 2.7], fov: 42 }}>
      <Spin speed={0.55}>
        <mesh>
          <circleGeometry args={[1, 48]} />
          <meshStandardMaterial map={tex} roughness={0.85} />
        </mesh>
      </Spin>
    </MiniCanvas>
  );
}

export const dartsMeta: GameMeta = {
  id: 'darts',
  names: { fa: 'دارت', en: 'Darts' },
  tagline: { fa: 'از ۵۰۱ تا صفر — دقیق بزن!', en: 'From 501 down to zero — aim true!' },
  minPlayers: 2,
  maxPlayers: 4,
  accent: '#fb7185',
  Logo,
  Play: DartsPlay,
  skins: boardSkins,
  tutorial: {
    fa: [
      {
        title: 'قانون ۵۰۱',
        body: 'هر بازیکن با ۵۰۱ امتیاز شروع می‌کند و هر پرتاب امتیازش از باقی‌مانده کم می‌شود. اولین نفری که دقیقاً به صفر برسد برنده است!',
      },
      {
        title: 'پرتاب',
        body: 'با ماوس روی تخته نشانه بگیر و کلیک کن — پرتاب دقیقاً همان‌جا فرود می‌آید. هر نوبت ۳ دارت داری. بیرونِ تخته = صفر.',
      },
      {
        title: 'بوست',
        body: 'اگر امتیازت منفی شود کل نوبت سوخته و امتیازت به اول نوبت برمی‌گردد. پس پایان بازی را حساب‌شده بزن — T20=۶۰، Bull=۵۰، حلقهٔ بیرونی دوبرابر!',
      },
    ],
    en: [
      {
        title: '501 rules',
        body: 'Everyone starts at 501 and each throw subtracts from the remaining score. First to land EXACTLY on zero wins!',
      },
      {
        title: 'Throwing',
        body: 'Aim with the mouse and click — the dart lands exactly where you aim. You get 3 darts per turn. Missing the board scores 0.',
      },
      {
        title: 'Bust',
        body: 'Overshooting below zero busts the whole turn and reverts your score. Plan the finish: T20 = 60, Bull = 50, outer ring doubles!',
      },
    ],
  },
};
