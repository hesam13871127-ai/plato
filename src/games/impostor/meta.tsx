import type { GameMeta, ShopSkin } from '../../core/types';
import { MiniCanvas, Spin } from '../../ui/three/shared';
import { ImpostorPlay } from './Play';

const tableSkins: ShopSkin[] = [
  {
    id: 'impostor-table-slate',
    gameId: 'impostor',
    kind: 'table',
    name: { fa: 'میز محاکمه', en: 'Interrogation Slate' },
    price: 0,
    colors: { felt: '#263042' },
    Preview: FeltPreview('#263042'),
  },
  {
    id: 'impostor-table-mystery',
    gameId: 'impostor',
    kind: 'table',
    name: { fa: 'بنفش رازآلود', en: 'Mystery Violet' },
    price: 240,
    colors: { felt: '#2e2350' },
    Preview: FeltPreview('#2e2350'),
  },
];

function FeltPreview(color: string) {
  return () => (
    <MiniCanvas camera={{ position: [0, 2.4, 2.8], fov: 40 }}>
      <mesh position={[0, -0.7, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[3.4, 2.2]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.3, 0]} rotation={[-0.4, 0.6, 0]} castShadow>
        <boxGeometry args={[1, 0.07, 1.45]} />
        <meshStandardMaterial color="#f8f5ee" roughness={0.7} />
      </mesh>
    </MiniCanvas>
  );
}

function Logo() {
  return (
    <MiniCanvas camera={{ position: [0, 1.3, 3], fov: 40 }}>
      <Spin speed={0.7}>
        <mesh castShadow position={[-0.7, 0, 0]}>
          <boxGeometry args={[0.9, 0.06, 1.3]} />
          <meshStandardMaterial color="#f8f5ee" roughness={0.7} />
        </mesh>
        <mesh position={[0.75, 0.1, 0.2]}>
          <sphereGeometry args={[0.28, 20, 20]} />
          <meshStandardMaterial color="#fb7185" roughness={0.4} />
        </mesh>
      </Spin>
    </MiniCanvas>
  );
}

export const impostorMeta: GameMeta = {
  id: 'impostor',
  names: { fa: 'جاسوس', en: 'Impostor' },
  tagline: { fa: 'یک نفر کلمه را نمی‌داند! کیست؟', en: 'One player doesn’t know the word — who?' },
  minPlayers: 3,
  maxPlayers: 6,
  accent: '#38bdf8',
  Logo,
  Play: ImpostorPlay,
  skins: tableSkins,
  tutorial: {
    fa: [
      {
        title: 'کلمهٔ مخفی',
        body: 'همه یک کلمهٔ مخفی مشترک دریافت می‌کنند — جز جاسوس! هر نفر نوبتی یک سرنخ کوتاه می‌دهد. سرنخ‌های خدمه از خودِ کلمه می‌آیند؛ جاسوس باید با سرنخ‌های مبهم بلند شود.',
      },
      {
        title: 'رأی‌گیری',
        body: 'بعد از همهٔ سرنخ‌ها، هر نفر به مظنون‌ترین نفر رأی می‌دهد. اگر جاسوس لو برود، یک شانس هم برای حدس زدن کلمه دارد!',
      },
      {
        title: 'امتیازها',
        body: 'جان به در بردن رأی = ۲ امتیاز برای جاسوس. لو رفتن و حدس غلط = ۱ امتیاز برای هر خدمه. لو رفتن و حدس درست = ۳ امتیاز سرقت! هر بازیکن یک بار جاسوس می‌شود؛ بیشترین امتیاز برنده است.',
      },
    ],
    en: [
      {
        title: 'Secret word',
        body: 'Everyone shares a secret word — except the impostor! Players take turns giving one clue. Crew clues come from the word itself; the impostor must bluff with vague ones.',
      },
      {
        title: 'Voting',
        body: 'After all clues, everyone votes for the most suspicious player. If the impostor is caught, they get one chance to guess the word!',
      },
      {
        title: 'Scoring',
        body: 'Surviving the vote = 2 points for the impostor. Caught with a wrong guess = 1 point per crew member. Caught with the RIGHT guess = a 3-point steal! Everyone gets one turn as impostor; highest score wins.',
      },
    ],
  },
};
