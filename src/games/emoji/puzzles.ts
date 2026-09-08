import type { Localized } from '../../core/types';

export interface EmojiPuzzle {
  emojis: string;
  options: Localized[];
  /** correct option index in data-space */
  answer: number;
}

/** Guess the word/phrase from the emoji sequence. */
export const PUZZLES: readonly EmojiPuzzle[] = [
  { emojis: '🦁👑', options: [{ fa: 'شیرشاه', en: 'The Lion King' }, { fa: 'شهر شیراز', en: 'Shiraz' }, { fa: 'تاج و تخت', en: 'Game of Thrones' }, { fa: 'ملکهٔ برفی', en: 'Snow Queen' }], answer: 0 },
  { emojis: '🧛‍♂️🦇', options: [{ fa: 'دراکولا', en: 'Dracula' }, { fa: 'خفاش شب', en: 'Night bat' }, { fa: 'شب هولناک', en: 'Scary night' }, { fa: 'قصر تاریک', en: 'Dark castle' }], answer: 0 },
  { emojis: '🐀👨‍🍳', options: [{ fa: 'راتاتویی', en: 'Ratatouille' }, { fa: 'موش آزمایشگاهی', en: 'Lab mouse' }, { fa: 'آشپزخانه', en: 'Kitchen' }, { fa: 'شکار موش', en: 'Mouse hunt' }], answer: 0 },
  { emojis: '🦖🏞️', options: [{ fa: 'پارک ژوراسیک', en: 'Jurassic Park' }, { fa: 'باغ وحش', en: 'Zoo' }, { fa: 'دنیای دایناسورها', en: 'Dino world' }, { fa: 'موزهٔ طبیعت', en: 'Nature museum' }], answer: 0 },
  { emojis: '🧙‍♂️⚡', options: [{ fa: 'هری پاتر', en: 'Harry Potter' }, { fa: 'جادوگر شهر اوز', en: 'Wizard of Oz' }, { fa: 'ثبت اختراع', en: 'Invention' }, { fa: 'طوفان تندر', en: 'Thunderstorm' }], answer: 0 },
  { emojis: '🧊🚢', options: [{ fa: 'تایتانیک', en: 'Titanic' }, { fa: 'قطب جنوب', en: 'Antarctica' }, { fa: 'یخچال طبیعی', en: 'Glacier' }, { fa: 'کشتی اسباب‌بازی', en: 'Toy boat' }], answer: 0 },
  { emojis: '🎃👻', options: [{ fa: 'هالووین', en: 'Halloween' }, { fa: 'کدو تنبل', en: 'Pumpkin' }, { fa: 'خانهٔ متروک', en: 'Haunted house' }, { fa: 'جشن تولد', en: 'Birthday' }], answer: 0 },
  { emojis: '🍎👨‍🔬', options: [{ fa: 'نیوتن و گرانش', en: 'Newton & gravity' }, { fa: 'میوه‌فروشی', en: 'Fruit shop' }, { fa: 'معلم سخت‌گیر', en: 'Strict teacher' }, { fa: 'دکتر سیب', en: 'Apple doctor' }], answer: 0 },
  { emojis: '🍯🐻', options: [{ fa: 'وینی د صدا', en: 'Winnie the Pooh' }, { fa: 'خرس قطبی', en: 'Polar bear' }, { fa: 'صبحانه', en: 'Breakfast' }, { fa: 'زنبستان', en: 'Apiary' }], answer: 0 },
  { emojis: '🥶⛄', options: [{ fa: 'برف‌آدم', en: 'Snowman' }, { fa: 'زمستان', en: 'Winter' }, { fa: 'یخ‌زده', en: 'Frozen' }, { fa: 'اسکی', en: 'Skiing' }], answer: 0 },
  { emojis: '🚀🌙', options: [{ fa: 'سفر به ماه', en: 'Trip to the Moon' }, { fa: 'شبگرد', en: 'Night owl' }, { fa: 'ماه‌نورد', en: 'Lunar rover' }, { fa: 'آسمان شب', en: 'Night sky' }], answer: 0 },
  { emojis: '🧜‍♀️🌊', options: [{ fa: 'پری دریایی', en: 'Mermaid' }, { fa: 'شناگر', en: 'Swimmer' }, { fa: 'موج سوار', en: 'Surfer' }, { fa: 'اقیانوس آرام', en: 'Pacific Ocean' }], answer: 0 },
  { emojis: '📚🐛', options: [{ fa: 'کرم کتاب', en: 'Bookworm' }, { fa: 'کتابخونه', en: 'Library' }, { fa: 'حیوانات خانگی', en: 'Pets' }, { fa: 'داستان شب', en: 'Bedtime story' }], answer: 0 },
  { emojis: '🎸🤘', options: [{ fa: 'راک اند رول', en: 'Rock & roll' }, { fa: 'کنسرت', en: 'Concert' }, { fa: 'گیتار الکتریک', en: 'Electric guitar' }, { fa: 'موسیقی کلاسیک', en: 'Classical music' }], answer: 0 },
  { emojis: '🥚🐔', options: [{ fa: 'مرغ و تخم‌مرغ', en: 'Chicken or the egg' }, { fa: 'مرغداری', en: 'Hen house' }, { fa: 'صبحانهٔ سلطنتی', en: 'Royal breakfast' }, { fa: 'جوجه اردک', en: 'Duckling' }], answer: 0 },
  { emojis: '🏴‍☠️💰', options: [{ fa: 'دفینهٔ دزدان دریایی', en: 'Pirate treasure' }, { fa: 'شکار گنج', en: 'Treasure hunt' }, { fa: 'دزد دریایی', en: 'Pirate' }, { fa: 'بانک', en: 'Bank' }], answer: 0 },
  { emojis: '🐟🚲', options: [{ fa: 'ماهی روی دوچرخه', en: 'Fish on a bicycle' }, { fa: 'دوچرخه‌سواری', en: 'Cycling' }, { fa: 'ماهیگیری', en: 'Fishing' }, { fa: 'شهر بازی', en: 'Carnival' }], answer: 0 },
  { emojis: '🐌💨', options: [{ fa: 'حلزون دونده', en: 'Racing snail' }, { fa: 'کندی', en: 'Slowness' }, { fa: 'مسابقه', en: 'Race' }, { fa: 'باد', en: 'Wind' }], answer: 0 },
  { emojis: '🦒', options: [{ fa: 'زرافه', en: 'Giraffe' }, { fa: 'اسب', en: 'Horse' }, { fa: 'شتر', en: 'Camel' }, { fa: 'گورخر', en: 'Zebra' }], answer: 0 },
  { emojis: '🦊🧠', options: [{ fa: 'روباه زیرک', en: 'Clever fox' }, { fa: 'روباه و آتش', en: 'Fox & fire' }, { fa: 'کولاک', en: 'Blizzard' }, { fa: 'شب‌گرد', en: 'Night stroll' }], answer: 0 },
  { emojis: '🐘', options: [{ fa: 'فیل', en: 'Elephant' }, { fa: 'کرگدن', en: 'Rhino' }, { fa: 'اسب آبی', en: 'Hippo' }, { fa: 'گاو', en: 'Cow' }], answer: 0 },
  { emojis: '🍕', options: [{ fa: 'پیتزا', en: 'Pizza' }, { fa: 'پنکیک', en: 'Pancake' }, { fa: 'خمیر', en: 'Dough' }, { fa: 'پای سیب', en: 'Apple pie' }], answer: 0 },
  { emojis: '☕📚', options: [{ fa: 'مطالعه با قهوه', en: 'Coffee & books' }, { fa: 'کافه', en: 'Café' }, { fa: 'صبحانه', en: 'Breakfast' }, { fa: 'کتاب‌فروشی', en: 'Bookstore' }], answer: 0 },
  { emojis: '⚽🏆', options: [{ fa: 'جام جهانی', en: 'World Cup' }, { fa: 'تمرین', en: 'Practice' }, { fa: 'فوتبال خیابانی', en: 'Street football' }, { fa: 'فینال لیگ', en: 'Cup final' }], answer: 0 },
  { emojis: '🐝🎬', options: [{ fa: 'فیلم زنبور', en: 'Bee Movie' }, { fa: 'زنبورداری', en: 'Beekeeping' }, { fa: 'عسل', en: 'Honey' }, { fa: 'کردار خوب', en: 'Good deeds' }], answer: 0 },
  { emojis: '🌈🐟', options: [{ fa: 'ماهی رنگین‌کمانی', en: 'Rainbow fish' }, { fa: 'آکواریوم', en: 'Aquarium' }, { fa: 'غواصی', en: 'Diving' }, { fa: 'رنگ‌آمیزی', en: 'Coloring' }], answer: 0 },
  { emojis: '🌵🐪', options: [{ fa: 'کویر', en: 'Desert' }, { fa: 'مزرعه', en: 'Farm' }, { fa: 'باغ', en: 'Garden' }, { fa: 'جنگل', en: 'Forest' }], answer: 0 },
  { emojis: '⏰😴', options: [{ fa: 'زنگ بیدارباش', en: 'Alarm clock' }, { fa: 'چرت ظهر', en: 'Nap time' }, { fa: 'شب بخیر', en: 'Good night' }, { fa: 'دیر رسیدن', en: 'Being late' }], answer: 0 },
  { emojis: '🧊☕', options: [{ fa: 'قهوهٔ سرد', en: 'Iced coffee' }, { fa: 'چای داغ', en: 'Hot tea' }, { fa: 'آب‌میوه', en: 'Juice' }, { fa: 'شیک', en: 'Milkshake' }], answer: 0 },
  { emojis: '🦉🌙', options: [{ fa: 'جغد شب‌زی', en: 'Night owl' }, { fa: 'خفاش', en: 'Bat' }, { fa: 'خواب', en: 'Sleep' }, { fa: 'شب‌بخیر', en: 'Goodnight' }], answer: 0 },
  { emojis: '🏔️🎿', options: [{ fa: 'اسکی', en: 'Skiing' }, { fa: 'کوهنوردی', en: 'Mountain climbing' }, { fa: 'زمستان', en: 'Winter' }, { fa: 'سرد', en: 'Cold' }], answer: 0 },
  { emojis: '🍪🥛', options: [{ fa: 'کلوچه و شیر', en: 'Cookie & milk' }, { fa: 'صبحانه', en: 'Breakfast' }, { fa: 'دسر', en: 'Dessert' }, { fa: 'کافه', en: 'Café' }], answer: 0 },
  { emojis: '🚗💨🏁', options: [{ fa: 'مسابقهٔ سرعت', en: 'Car race' }, { fa: 'ترافیک', en: 'Traffic' }, { fa: 'رانندگی', en: 'Driving' }, { fa: 'پارکینگ', en: 'Parking' }], answer: 0 },
  { emojis: '🧩🧠', options: [{ fa: 'پازل ذهن', en: 'Brain puzzle' }, { fa: 'بازی فکری', en: 'Board game' }, { fa: 'مطالعه', en: 'Studying' }, { fa: 'سرگرمی', en: 'Hobby' }], answer: 0 },
  { emojis: '🌧️🌈', options: [{ fa: 'بعد از باران', en: 'After the rain' }, { fa: 'طوفان', en: 'Storm' }, { fa: 'بهار', en: 'Spring' }, { fa: 'آب و هوا', en: 'Weather' }], answer: 0 },
  { emojis: '🦕🌴', options: [{ fa: 'دایناسور و نخل', en: 'Dino & palm' }, { fa: 'جنگل استوایی', en: 'Jungle' }, { fa: 'موزه', en: 'Museum' }, { fa: 'حیوانات منقرض', en: 'Extinct animals' }], answer: 0 },
  { emojis: '🎻🎹', options: [{ fa: 'موسیقی کلاسیک', en: 'Classical music' }, { fa: 'راک', en: 'Rock' }, { fa: 'جاز', en: 'Jazz' }, { fa: 'پاپ', en: 'Pop' }], answer: 0 },
  { emojis: '🐙🌊', options: [{ fa: 'هشت‌پا', en: 'Octopus' }, { fa: 'ماهی مرکب', en: 'Squid' }, { fa: 'عروس دریایی', en: 'Jellyfish' }, { fa: 'خرچنگ', en: 'Crab' }], answer: 0 },
  { emojis: '🥕🐰', options: [{ fa: 'خرگوش و هویج', en: 'Bunny & carrot' }, { fa: 'مزرعه', en: 'Farm' }, { fa: 'سبزیجات', en: 'Vegetables' }, { fa: 'حیوان خانگی', en: 'Pet' }], answer: 0 },
];
