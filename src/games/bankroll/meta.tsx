import type { GameMeta, ShopSkin } from '../../core/types';
import { MiniCanvas, Spin } from '../../ui/three/shared';
import { BankrollPlay } from './Play';
import { cardTexture } from './Board';
import { useMemo } from 'react';
import * as THREE from 'three';

const tableSkins: ShopSkin[] = [
  {
    id: 'bankroll-table-casino',
    gameId: 'bankroll',
    kind: 'table',
    name: { fa: 'کازینو کلاسیک', en: 'Classic Casino' },
    price: 0,
    colors: { felt: '#1e3a2f' },
    Preview: FeltPreview('#1e3a2f'),
  },
  {
    id: 'bankroll-table-royal',
    gameId: 'bankroll',
    kind: 'table',
    name: { fa: 'مخمل سلطنتی', en: 'Royal Velvet' },
    price: 300,
    colors: { felt: '#3b1f4e' },
    Preview: FeltPreview('#3b1f4e'),
  },
];

function FeltPreview(color: string) {
  return () => (
    <MiniCanvas camera={{ position: [0, 2.4, 2.8], fov: 40 }}>
      <mesh position={[0, -0.7, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[3.4, 2.2]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      <mesh position={[-0.5, 0.1, 0]} rotation={[-1.2, 0, 0.2]} castShadow>
        <boxGeometry args={[0.7, 0.03, 1]} />
        <meshStandardMaterial color="#f8f5ee" roughness={0.7} />
      </mesh>
      <mesh position={[0.6, 0.12, 0.1]} rotation={[-1.2, 0, -0.15]} castShadow>
        <boxGeometry args={[0.7, 0.03, 1]} />
        <meshStandardMaterial color="#f8f5ee" roughness={0.7} />
      </mesh>
    </MiniCanvas>
  );
}

function Logo() {
  const tex = useMemo(() => cardTexture(13, 3), []);
  return (
    <MiniCanvas camera={{ position: [0, 1.4, 3], fov: 40 }}>
      <Spin speed={0.75}>
        <mesh castShadow>
          <boxGeometry args={[0.85, 0.04, 1.2]} />
          <meshStandardMaterial map={tex} roughness={0.7} />
        </mesh>
        <mesh position={[0.95, 0.28, 0.2]} rotation={[0.4, 0.5, 0.2]} castShadow>
          <cylinderGeometry args={[0.34, 0.34, 0.16, 18]} />
          <meshStandardMaterial color="#f59e0b" roughness={0.45} metalness={0.3} />
        </mesh>
      </Spin>
    </MiniCanvas>
  );
}

export const bankrollMeta: GameMeta = {
  id: 'bankroll',
  names: { fa: 'بانکرول', en: 'Bankroll' },
  tagline: { fa: 'وسط بیفتد یا همه‌چیز برود!', en: 'Land in between — or lose it all!' },
  minPlayers: 2,
  maxPlayers: 4,
  accent: '#f59e0b',
  Logo,
  Play: BankrollPlay,
  skins: tableSkins,
  tutorial: {
    fa: [
      {
        title: 'شرط',
        body: 'هر نوبت دو کارت رو می‌شود. تو شرط می‌بندی که کارت سوم عددش میان این دو افتد. هر بازیکن ۱۰۰ مهره دارد و ۱۰ نوبت فرصت دارد.',
      },
      {
        title: 'پرداخت',
        body: 'وسط بیفتد: برد بر اساس فاصله — فاصلهٔ کم (۱ کارت برنده) ×۵، تا ×۲ برای فاصله‌های متوسط و ×۱ برای فاصله‌های باز. بیرون بیفتد: از دست دادن شرط. روی همان عددِ یکی از دو کارت (تیرک) افتد: دو برابر ضرر!',
      },
      {
        title: 'رد شدن',
        body: 'اگر فاصله خطرناک است با پرداخت ۲ مهره رد شو. کسی که مهره‌اش تمام شود حذف می‌شود؛ پس از همهٔ نوبت‌ها ثروتمندترین برنده است.',
      },
    ],
    en: [
      {
        title: 'The bet',
        body: 'Each turn two cards are dealt face up. You stake chips that the third card lands strictly between them. Everyone starts with 100 chips and 10 turns.',
      },
      {
        title: 'Payouts',
        body: 'In between: win by the spread — tight spreads (1 winning rank) pay ×5, down to ×1 for wide ones. Outside: lose your stake. Landing ON a table card (a post): DOUBLE loss!',
      },
      {
        title: 'Passing',
        body: 'Dangerous spread? Pass for a 2-chip fee. Run out of chips and you are out; after all turns, the richest player wins.',
      },
    ],
  },
};
