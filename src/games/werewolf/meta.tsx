import type { GameMeta, ShopSkin } from '../../core/types';
import { MiniCanvas, Spin } from '../../ui/three/shared';
import { WerewolfPlay } from './Play';

const tableSkins: ShopSkin[] = [
  {
    id: 'werewolf-table-forest',
    gameId: 'werewolf',
    kind: 'table',
    name: { fa: 'جنگل تاریک', en: 'Dark Forest' },
    price: 0,
    colors: { felt: '#20301f' },
    Preview: FeltPreview('#20301f'),
  },
  {
    id: 'werewolf-table-blood',
    gameId: 'werewolf',
    kind: 'table',
    name: { fa: 'مه سرخ', en: 'Blood Mist' },
    price: 260,
    colors: { felt: '#41131f' },
    Preview: FeltPreview('#41131f'),
  },
];

function FeltPreview(color: string) {
  return () => (
    <MiniCanvas camera={{ position: [0, 2.4, 2.8], fov: 40 }}>
      <mesh position={[0, -0.7, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[3.4, 2.2]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <sphereGeometry args={[0.34, 18, 18]} />
        <meshStandardMaterial color="#e2e8f0" emissive="#a5b4cf" emissiveIntensity={0.6} roughness={0.9} />
      </mesh>
    </MiniCanvas>
  );
}

function Logo() {
  return (
    <MiniCanvas camera={{ position: [0, 1.4, 3], fov: 40 }}>
      <Spin speed={0.8}>
        <mesh castShadow>
          <coneGeometry args={[0.55, 1.1, 10]} />
          <meshStandardMaterial color="#6b7280" roughness={0.7} />
        </mesh>
        <mesh position={[0.85, 0.55, 0.2]}>
          <sphereGeometry args={[0.3, 20, 20]} />
          <meshStandardMaterial color="#e2e8f0" emissive="#a5b4cf" emissiveIntensity={0.7} />
        </mesh>
      </Spin>
    </MiniCanvas>
  );
}

export const werewolfMeta: GameMeta = {
  id: 'werewolf',
  names: { fa: 'گرگینه', en: 'Werewolf' },
  tagline: { fa: 'شب گرگ‌ها، روز انتقام!', en: 'Wolves at night, justice by day!' },
  minPlayers: 5,
  maxPlayers: 8,
  accent: '#fb7185',
  Logo,
  Play: WerewolfPlay,
  skins: tableSkins,
  tutorial: {
    fa: [
      {
        title: 'نقش‌ها',
        body: 'بازی مخفیانه است: گرگینه‌ها (در میزهای ۷+ نفره دو عدد)، یک فالگیر، یک پزشک و بقیه روستایی. فقط خودت نقشت را می‌بینی.',
      },
      {
        title: 'شب',
        body: 'گرگینه‌ها یک قربانی انتخاب می‌کنند؛ پزشک یک نفر را نجات می‌دهد و فالگیر نقش یک نفر را می‌بیند. اگر قربانی همان کسی باشد که پزشک نجات داد، کسی نمی‌میرد.',
      },
      {
        title: 'روز و رأی',
        body: 'روستایی‌ها رأی می‌دهند و بیشترِ آرا اعدام می‌شود (مساوی = کسی اعدام نمی‌شود). نقش اعدامی‌شده آشکار می‌شود. روستا با حذف همه گرگ‌ها می‌برد؛ گرگ‌ها با رسیدن به برابری تعداد.',
      },
    ],
    en: [
      {
        title: 'Roles',
        body: 'Hidden roles: werewolves (two on 7+ seat tables), one seer, one doctor, the rest villagers. Only you see your own role.',
      },
      {
        title: 'Night',
        body: 'Wolves pick a victim; the doctor saves one player; the seer peeks at one role. If the victim is the saved player, nobody dies.',
      },
      {
        title: 'Day & voting',
        body: 'The village votes — a strict majority is lynched (ties spare everyone). Lynched roles are revealed. The village wins by eliminating all wolves; wolves win at parity.',
      },
    ],
  },
};
