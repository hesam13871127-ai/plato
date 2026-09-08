import { createContext, useContext, useEffect, type ReactNode } from 'react';
import type { Localized } from '../core/types';
import { useProfile } from '../state/store';

export type Lang = 'fa' | 'en';

const strings: Record<string, Localized> = {
  'app.title': { fa: 'پلاتو', en: 'Plato' },
  'app.subtitle': { fa: 'باشگاه بازی‌های رومیزی', en: 'The board game club' },
  'hub.play': { fa: 'بازی', en: 'Play' },
  'hub.tutorial': { fa: 'آموزش', en: 'How to play' },
  'hub.shop': { fa: 'فروشگاه', en: 'Shop' },
  'hub.players': { fa: 'بازیکن', en: 'players' },
  'hub.new': { fa: 'جدید', en: 'NEW' },
  'hub.progress': { fa: 'موج ۳ از ۵ · ۱۵ بازی از ۲۵', en: 'Wave 3 of 5 · 15 of 25 games' },
  'hub.coins': { fa: 'سکه', en: 'coins' },
  'setup.title': { fa: 'آماده‌سازی بازی', en: 'Game setup' },
  'setup.players': { fa: 'تعداد بازیکن', en: 'Players' },
  'setup.human': { fa: 'انسان', en: 'Human' },
  'setup.bot': { fa: 'ربات', en: 'Bot' },
  'setup.easy': { fa: 'آسان', en: 'Easy' },
  'setup.medium': { fa: 'متوسط', en: 'Medium' },
  'setup.hard': { fa: 'سخت', en: 'Hard' },
  'setup.name': { fa: 'نام', en: 'Name' },
  'setup.you': { fa: 'شما', en: 'You' },
  'setup.start': { fa: 'شروع بازی', en: 'Start game' },
  'setup.back': { fa: 'بازگشت', en: 'Back' },
  'game.back': { fa: 'خروج', en: 'Quit' },
  'game.yourTurn': { fa: 'نوبت شما', en: 'Your turn' },
  'game.turnOf': { fa: 'نوبت {name}', en: "{name}'s turn" },
  'game.thinking': { fa: 'در حال فکر…', en: 'thinking…' },
  'game.roll': { fa: 'تاس بریز', en: 'Roll' },
  'game.draw': { fa: 'کش بکش', en: 'Draw' },
  'game.pass': { fa: 'رد شو', en: 'Pass' },
  'game.chooseColor': { fa: 'رنگ را انتخاب کن', en: 'Choose a color' },
  'game.cancel': { fa: 'انصراف', en: 'Cancel' },
  'game.pickTile': { fa: 'یک دومینو انتخاب کن', en: 'Pick a domino' },
  'game.pickEnd': { fa: 'سمت چین را انتخاب کن', en: 'Pick an end of the chain' },
  'game.pickCard': { fa: 'کارت قابل بازی را انتخاب کن', en: 'Pick a playable card' },
  'game.pickToken': { fa: 'مهرهٔ قابل حرکت را انتخاب کن', en: 'Pick a movable token' },
  'game.pickPiece': { fa: 'مهره را انتخاب کن', en: 'Pick a piece' },
  'game.pickTarget': { fa: 'مقصد را انتخاب کن', en: 'Pick a destination' },
  'game.dropCol': { fa: 'روی ستون کلیک کن', en: 'Click a column' },
  'game.winner': { fa: '{name} برنده شد!', en: '{name} wins!' },
  'game.drawResult': { fa: 'مساوی!', en: "It's a draw!" },
  'game.rematch': { fa: 'بازی مجدد', en: 'Rematch' },
  'game.backToHub': { fa: 'بازگشت به هاب', en: 'Back to hub' },
  'game.reward': { fa: 'جوایز', en: 'Reward' },
  'game.noReward': { fa: 'این بار شانس نیاوردی — دوباره تلاش کن!', en: 'No luck this time — try again!' },
  'game.hand': { fa: 'دست', en: 'hand' },
  'game.tiles': { fa: 'دومینو', en: 'tiles' },
  'game.cards': { fa: 'کارت', en: 'cards' },
  'game.boneyard': { fa: 'گنجینه', en: 'Boneyard' },
  'game.direction': { fa: 'جهت بازی', en: 'Direction' },
  'game.activeColor': { fa: 'رنگ فعال', en: 'Active color' },
  'game.sixAgain': { fa: 'شش آمد! دوباره بریز', en: 'Six! Roll again' },
  'game.mustCapture': { fa: 'زدن اجباری است', en: 'Capture is mandatory' },
  'game.chain': { fa: 'ادامهٔ زنجیرهٔ ضربه', en: 'Keep capturing' },
  'game.crowned': { fa: 'مهره پادشاه شد!', en: 'Crowned a king!' },
  'game.check': { fa: 'کیش!', en: 'Check!' },
  'game.checkmate': { fa: 'کیش و مات!', en: 'Checkmate!' },
  'game.stalemate': { fa: 'پات — مساوی', en: 'Stalemate — draw' },
  'game.promote': { fa: 'ارتقای سرباز — مهره را انتخاب کن', en: 'Promote your pawn' },
  'game.openTable': { fa: 'میز باز', en: 'Open table' },
  'game.solids': { fa: 'تک‌رنگ', en: 'Solids' },
  'game.stripes': { fa: 'راه‌راه', en: 'Stripes' },
  'game.foul': { fa: 'خطا', en: 'Foul' },
  'game.aim': { fa: 'نشانه بگیر و ضربه بزن', en: 'Aim and shoot' },
  'game.power': { fa: 'قدرت', en: 'Power' },
  'game.strike': { fa: 'ضربه', en: 'Strike' },
  'game.strikerPos': { fa: 'جای ضربه‌زن', en: 'Striker position' },
  'game.queen': { fa: 'ملکه', en: 'Queen' },
  'game.mustCover': { fa: 'باید پوشش بدهی', en: 'You must cover' },
  'game.drawLine': { fa: 'یک خط بین دو نقطه بکش', en: 'Draw a line between two dots' },
  'game.snakeBite': { fa: 'مار گزشت! 🐍', en: 'Snake bite! 🐍' },
  'game.ladderUp': { fa: 'پله بالا! 🪜', en: 'Ladder up! 🪜' },
  'game.drawBall': { fa: 'یک توپ بکش', en: 'Draw a ball' },
  'game.recent': { fa: 'آخرین اعداد', en: 'Recent numbers' },
  'game.holdDice': { fa: 'روی تاس کلیک کن تا نگهش داری', en: 'Click dice to hold them' },
  'game.rollDice': { fa: 'تاس بریز', en: 'Roll' },
  'game.scoreCategory': { fa: 'یک ردیف برای امتیازدهی انتخاب کن', en: 'Pick a row to score' },
  'game.enterFromBar': { fa: 'باید از بار وارد شوی', en: 'You must enter from the bar' },
  'game.bearOff': { fa: 'خارج‌کردن مهره', en: 'Bear off' },
  'game.frame': { fa: 'فریم', en: 'Frame' },
  'game.throwBall': { fa: 'پرتاب', en: 'Throw' },
  'game.strikeMsg': { fa: 'استرایک! 🎳', en: 'Strike! 🎳' },
  'game.spareMsg': { fa: 'اسپر! /', en: 'Spare! /' },
  'shop.title': { fa: 'فروشگاه', en: 'Shop' },
  'shop.coins': { fa: 'سکه‌های شما', en: 'Your coins' },
  'shop.free': { fa: 'پیش‌فرض', en: 'Default' },
  'shop.buy': { fa: 'خرید', en: 'Buy' },
  'shop.equip': { fa: 'فعال‌سازی', en: 'Equip' },
  'shop.equipped': { fa: 'فعال', en: 'Equipped' },
  'shop.owned': { fa: 'خریداری‌شده', en: 'Owned' },
  'shop.notEnough': { fa: 'سکه کافی نداری!', en: 'Not enough coins!' },
  'shop.earnHint': { fa: 'با برد در برابر ربات‌ها سکه بگیر', en: 'Beat bots to earn coins' },
  'shop.kind.pieces': { fa: 'مهره‌ها', en: 'Pieces' },
  'shop.kind.board': { fa: 'صفحه', en: 'Board' },
  'shop.kind.table': { fa: 'میز', en: 'Table' },
  'shop.kind.cards': { fa: 'کارت‌ها', en: 'Cards' },
  'shop.kind.dice': { fa: 'تاس', en: 'Dice' },
  'tut.title': { fa: 'آموزش بازی', en: 'How to play' },
  'tut.next': { fa: 'بعدی', en: 'Next' },
  'tut.prev': { fa: 'قبلی', en: 'Prev' },
  'tut.close': { fa: 'بستن', en: 'Close' },
  'tut.step': { fa: 'قدم {n} از {m}', en: 'Step {n} of {m}' },
  'common.you': { fa: 'شما', en: 'You' },
  'common.bot': { fa: 'ربات', en: 'Bot' },
  'common.close': { fa: 'بستن', en: 'Close' },
};

interface I18nValue {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  t: (key: string, params?: Record<string, string>) => string;
  L: (l: Localized) => string;
  setLang: (lang: Lang) => void;
}

const I18nCtx = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const lang = useProfile((s) => s.lang);
  const setLangState = useProfile((s) => s.setLang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
  }, [lang]);

  const t = (key: string, params?: Record<string, string>): string => {
    const entry = strings[key];
    let out = entry ? entry[lang] : key;
    if (params) for (const [k, v] of Object.entries(params)) out = out.replace(`{${k}}`, v);
    return out;
  };

  const value: I18nValue = {
    lang,
    dir: lang === 'fa' ? 'rtl' : 'ltr',
    t,
    L: (l: Localized) => l[lang],
    setLang: setLangState,
  };

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nCtx);
  if (!ctx) throw new Error('useI18n outside provider');
  return ctx;
}
