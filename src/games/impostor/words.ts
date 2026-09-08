export interface CluePair {
  fa: string;
  en: string;
}

export interface ImpostorWord {
  name: { fa: string; en: string };
  clues: CluePair[];
}

/**
 * Word bank for the impostor game. Every clue string is globally unique
 * across the whole bank (fa and en separately) — `engine.test.ts` enforces
 * it, because the impostor's decoy options must never accidentally match
 * the real word's clues.
 */
export const WORDS: readonly ImpostorWord[] = [
  {
    name: { fa: 'ساحل', en: 'Beach' },
    clues: [
      { fa: 'موج', en: 'Wave' }, { fa: 'ماسه', en: 'Sand' }, { fa: 'نخل', en: 'Palm' },
      { fa: 'صدف', en: 'Shell' }, { fa: 'آفتاب', en: 'Sun' }, { fa: 'لباس دریایی', en: 'Swimsuit' },
      { fa: 'بادبادک', en: 'Kite' }, { fa: 'قایق', en: 'Boat' },
    ],
  },
  {
    name: { fa: 'آشپزخانه', en: 'Kitchen' },
    clues: [
      { fa: 'قابلمه', en: 'Pot' }, { fa: 'یخچال', en: 'Fridge' }, { fa: 'چاقو', en: 'Knife' },
      { fa: 'اجاق', en: 'Stove' }, { fa: 'سینک', en: 'Sink' }, { fa: 'تخم‌مرغ', en: 'Egg' },
      { fa: 'همزن', en: 'Whisk' }, { fa: 'چای‌جوش', en: 'Kettle' },
    ],
  },
  {
    name: { fa: 'بیمارستان', en: 'Hospital' },
    clues: [
      { fa: 'پزشک', en: 'Doctor' }, { fa: 'تخت', en: 'Bed' }, { fa: 'سرم', en: 'IV' },
      { fa: 'آمبولانس', en: 'Ambulance' }, { fa: 'گچ', en: 'Cast' }, { fa: 'پرستار', en: 'Nurse' },
      { fa: 'دارو', en: 'Medicine' }, { fa: 'معاینه', en: 'Checkup' },
    ],
  },
  {
    name: { fa: 'فرودگاه', en: 'Airport' },
    clues: [
      { fa: 'پاسپورت', en: 'Passport' }, { fa: 'چمدان', en: 'Suitcase' }, { fa: 'باند', en: 'Runway' },
      { fa: 'پرواز', en: 'Flight' }, { fa: 'خلبان', en: 'Pilot' }, { fa: 'ترمینال', en: 'Terminal' },
      { fa: 'بلیت', en: 'Ticket' }, { fa: 'برج مراقبت', en: 'Tower' },
    ],
  },
  {
    name: { fa: 'جنگل', en: 'Jungle' },
    clues: [
      { fa: 'درخت', en: 'Tree' }, { fa: 'موز', en: 'Banana' }, { fa: 'ببر', en: 'Tiger' },
      { fa: 'خزه', en: 'Moss' }, { fa: 'باران', en: 'Rain' }, { fa: 'میمون', en: 'Monkey' },
      { fa: 'سایه', en: 'Shadow' }, { fa: 'ریشه', en: 'Root' },
    ],
  },
  {
    name: { fa: 'مدرسه', en: 'School' },
    clues: [
      { fa: 'تخته', en: 'Board' }, { fa: 'نمره', en: 'Grade' }, { fa: 'زنگ', en: 'Bell' },
      { fa: 'کیف', en: 'Backpack' }, { fa: 'معلم', en: 'Teacher' }, { fa: 'کتاب', en: 'Book' },
      { fa: 'مداد', en: 'Pencil' }, { fa: 'صندلی', en: 'Chair' },
    ],
  },
  {
    name: { fa: 'بازار', en: 'Bazaar' },
    clues: [
      { fa: 'چانه', en: 'Bargain' }, { fa: 'میوه', en: 'Fruit' }, { fa: 'مغازه', en: 'Shop' },
      { fa: 'خرید', en: 'Shopping' }, { fa: 'سبد', en: 'Basket' }, { fa: 'تخفیف', en: 'Discount' },
      { fa: 'فروشنده', en: 'Seller' }, { fa: 'دست‌فروش', en: 'Stall' },
    ],
  },
  {
    name: { fa: 'کوهستان', en: 'Mountain' },
    clues: [
      { fa: 'قله', en: 'Summit' }, { fa: 'صخره', en: 'Cliff' }, { fa: 'کوله', en: 'Rucksack' },
      { fa: 'طناب', en: 'Rope' }, { fa: 'برف', en: 'Snow' }, { fa: 'عقاب', en: 'Eagle' },
      { fa: 'شیب', en: 'Slope' }, { fa: 'اکسیژن', en: 'Oxygen' },
    ],
  },
  {
    name: { fa: 'استخر', en: 'Swimming Pool' },
    clues: [
      { fa: 'شنا', en: 'Swim' }, { fa: 'عمق', en: 'Depth' }, { fa: 'کاشی', en: 'Tile' },
      { fa: 'عینک', en: 'Goggles' }, { fa: 'شیرآب', en: 'Faucet' }, { fa: 'لوله', en: 'Hose' },
      { fa: 'مربی', en: 'Coach' }, { fa: 'شنای پروانه', en: 'Butterfly' },
    ],
  },
  {
    name: { fa: 'سیرک', en: 'Circus' },
    clues: [
      { fa: 'چادر', en: 'Tent' }, { fa: 'دلقک', en: 'Clown' }, { fa: 'شعبده', en: 'Magic' },
      { fa: 'حلقه', en: 'Ring' }, { fa: 'تراپیز', en: 'Trapeze' }, { fa: 'تماشاگر', en: 'Audience' },
      { fa: 'آکروبات', en: 'Acrobat' }, { fa: 'شلاق', en: 'Whip' },
    ],
  },
  {
    name: { fa: 'کتابخانه', en: 'Library' },
    clues: [
      { fa: 'سکوت', en: 'Silence' }, { fa: 'قفسه', en: 'Shelf' }, { fa: 'امانت', en: 'Loan' },
      { fa: 'جریمه', en: 'Fine' }, { fa: 'رمان', en: 'Novel' }, { fa: 'نویسنده', en: 'Author' },
      { fa: 'کارت', en: 'Card' }, { fa: 'چراغ', en: 'Lamp' },
    ],
  },
  {
    name: { fa: 'باشگاه', en: 'Gym' },
    clues: [
      { fa: 'دمبل', en: 'Dumbbell' }, { fa: 'تردمیل', en: 'Treadmill' }, { fa: 'وزنه', en: 'Weight' },
      { fa: 'بدنساز', en: 'Bodybuilder' }, { fa: 'عرق', en: 'Sweat' }, { fa: 'آینه', en: 'Mirror' },
      { fa: 'پروتئین', en: 'Protein' }, { fa: 'دویدن', en: 'Running' },
    ],
  },
  {
    name: { fa: 'پارک', en: 'Park' },
    clues: [
      { fa: 'نیمکت', en: 'Bench' }, { fa: 'فواره', en: 'Fountain' }, { fa: 'چمن', en: 'Grass' },
      { fa: 'سگ', en: 'Dog' }, { fa: 'الاکلنگ', en: 'Seesaw' }, { fa: 'دوچرخه', en: 'Bicycle' },
      { fa: 'بستنی', en: 'Ice cream' }, { fa: 'قدم زدن', en: 'Stroll' },
    ],
  },
  {
    name: { fa: 'رستوران', en: 'Restaurant' },
    clues: [
      { fa: 'منو', en: 'Menu' }, { fa: 'پیش‌غذا', en: 'Appetizer' }, { fa: 'انعام', en: 'Tip' },
      { fa: 'سفارش', en: 'Order' }, { fa: 'ظرف', en: 'Plate' }, { fa: 'سرآشپز', en: 'Chef' },
      { fa: 'میز', en: 'Table' }, { fa: 'پیشخدمت', en: 'Waiter' },
    ],
  },
];
