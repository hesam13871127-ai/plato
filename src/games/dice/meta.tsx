import type { GameMeta, ShopSkin } from '../../core/types';
import { MiniCanvas, Spin } from '../../ui/three/shared';
import { DicePlay } from './Play';
import { DiceFelt, DieDice } from './Board';

const tableSkins: ShopSkin[] = [
  {
    id: 'dice-table-green',
    gameId: 'dice',
    kind: 'table',
    name: { fa: 'میز کلاسیک', en: 'Classic Green' },
    price: 0,
    colors: { felt: '#1c6b4a' },
    Preview: () => (
      <MiniCanvas camera={{ position: [0, 2.6, 3.2], fov: 40 }}>
        <DiceFelt />
        <group position={[0, 0.35, 0]} scale={0.55}>
          <DieDice value={6} held position={[0, 0.55, 0]} rolling={false} />
        </group>
      </MiniCanvas>
    ),
  },
  {
    id: 'dice-table-royal',
    gameId: 'dice',
    kind: 'table',
    name: { fa: 'بنفش سلطنتی', en: 'Royal Violet' },
    price: 200,
    colors: { felt: '#3b2b7a' },
    Preview: () => (
      <MiniCanvas camera={{ position: [0, 2.6, 3.2], fov: 40 }}>
        <DiceFelt felt="#3b2b7a" />
        <group position={[0, 0.35, 0]} scale={0.55}>
          <DieDice value={5} held position={[0, 0.55, 0]} rolling={false} />
        </group>
      </MiniCanvas>
    ),
  },
];

function Logo() {
  return (
    <MiniCanvas camera={{ position: [0, 1.9, 3.6], fov: 40 }}>
      <Spin speed={0.7}>
        <group position={[-0.85, 0, 0]} rotation={[0.3, 0.4, 0.1]}>
          <DieDice value={6} held={false} position={[0, 0, 0]} rolling={false} />
        </group>
        <group position={[0.85, 0, 0]} rotation={[0.5, -0.3, -0.15]}>
          <DieDice value={5} held={false} position={[0, 0.2, 0]} rolling={false} />
        </group>
      </Spin>
    </MiniCanvas>
  );
}

export const diceMeta: GameMeta = {
  id: 'dice',
  names: { fa: 'دایس پارتی', en: 'Dice Party' },
  tagline: { fa: 'پنج تاس، سه پرتاب، بهترین ترکیب!', en: 'Five dice, three rolls, best combos!' },
  minPlayers: 2,
  maxPlayers: 4,
  accent: '#34d399',
  Logo,
  Play: DicePlay,
  skins: tableSkins,
  tutorial: {
    fa: [
      {
        title: 'هدف',
        body: 'در ۱۳ دور، تاس‌هایت را می‌غلتانی و هر دور یکی از ۱۳ دسته را امتیازدهی می‌کنی. در پایان بیشترین امتیاز برنده است.',
      },
      {
        title: 'پرتاب‌ها',
        body: 'هر دور تا ۳ بار می‌ریزی. بین پرتاب‌ها روی تاس‌ها کلیک کن تا نگهشان داری و بقیه را دوباره بریز.',
      },
      {
        title: 'امتیازدهی',
        body: 'بخش بالا (۱ تا ۶) مجموع آن عدد را می‌گیرد؛ اگر مجموع بخش بالا به ۶۳ برسد ۳۵ امتیاز پاداش می‌گیری! سه‌تایی/چهارتایی مجموع همه تاس‌ها، فول‌هاوس ۲۵، راه‌راه کوچک ۳۰، راه‌راه بزرگ ۴۰، پنج‌تایی ۵۰ و شانس مجموع است.',
      },
      {
        title: 'نوبت‌ها',
        body: 'بعد از امتیازدهی، نوبت بازیکن بعدی است. هر دسته فقط یک‌بار قابل انتخاب است — حتی با صفر!',
      },
    ],
    en: [
      {
        title: 'Goal',
        body: 'Over 13 rounds, roll your dice and score one of the 13 categories each round. Highest total wins.',
      },
      {
        title: 'Rolling',
        body: 'Up to 3 rolls per round. Click dice between rolls to hold them and reroll the rest.',
      },
      {
        title: 'Scoring',
        body: 'The upper section (ones–sixes) sums that number — reach 63 total for a 35-point bonus! 3/4-of-a-kind sum all dice, full house 25, small straight 30, large straight 40, five-of-a-kind 50, chance sums everything.',
      },
      {
        title: 'Turns',
        body: 'After scoring, the next player rolls. Each category can only be used once — even for zero!',
      },
    ],
  },
};
