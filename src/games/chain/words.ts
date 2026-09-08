/**
 * Word-chain lexicons. Curated so that every letter that can appear as the
 * LAST letter of a word also has several words STARTING with it — otherwise
 * a chain could dead-end instantly. `engine.test.ts` enforces this invariant
 * (plus uniqueness and minimum length).
 */

export const faWords: readonly string[] = [
  // ا
  'آبشار', 'آش', 'آشپزخانه', 'آفتاب', 'آهو', 'ابر', 'ابرو', 'اتاق', 'اتو', 'اردک', 'اشک', 'امضا', 'انار', 'انسان', 'انگشتر', 'انگور', 'اسکله', 'افسانه', 'اینترنت',
  // ب
  'باقلوا', 'بالش', 'بانو', 'باران', 'برادر', 'برف', 'بشقاب', 'ببر', 'بوسه', 'بید', 'برق', 'بادام', 'بادکنک', 'باغ', 'بلبل', 'برگ', 'بساط',
  // پ
  'پالتو', 'پارچه', 'پادشاه', 'پارس', 'پرتقال', 'پرنده', 'پنجره', 'پنیر', 'پیتزا', 'پلاستیک', 'پلیس', 'پوست', 'پشم', 'پیچ', 'پسته', 'پلنگ',
  // ت
  'تابلو', 'تابستان', 'تاکسی', 'تخته', 'تلویزیون', 'توت', 'تاریک', 'تراز', 'تراس',
  // ث
  'ثانیه', 'ثروت',
  // ج
  'جادو', 'جایزه', 'جعبه', 'جغد', 'جام', 'جنگل', 'جوراب', 'جوجه', 'جو',
  // چ
  'چای', 'چاقو', 'چتر', 'چراغ', 'چکمه', 'چمدان', 'چنار', 'چوب', 'چوپان', 'چرخ', 'چشم',
  // ح
  'حباب', 'حلزون', 'حلوا', 'حلقه', 'حمام', 'حیاط', 'حوض',
  // خ
  'خانه', 'خودرو', 'خرگوش', 'خرس', 'خورشید', 'خواب', 'خشت', 'خیار', 'خمیر', 'خلق', 'خرچنگ',
  // د
  'دارچین', 'دوچرخه', 'دفتر', 'در', 'درخت', 'دریا', 'دلفین', 'دیوار',
  // ذ
  'ذرت', 'ذره',
  // ر
  'رادیو', 'روباه', 'رودخانه', 'روبان', 'رخ', 'رقص',
  // ز
  'زبان', 'زرافه', 'زمین', 'زیتون', 'زغال', 'زوج', 'زنبور',
  // ژ
  'ژاله', 'ژرفا',
  // س
  'ساعت', 'سبد', 'سبیل', 'سنگ', 'سمنو', 'سیب', 'سیر', 'سیم', 'سگ', 'سوسک', 'سقف', 'ساندویچ',
  // ش
  'شانه', 'شاپرک', 'شتر', 'شطرنج', 'شهر', 'شمع', 'شیر', 'شکلات', 'شهد', 'شاهین', 'سلام',
  // ص
  'صبح', 'صدا', 'صحرا', 'صندلی',
  // ض
  'ضربه', 'ضماد',
  // ط
  'طلا', 'طناب', 'طوطی', 'طوفان',
  // ظ
  'ظرف', 'ظهر',
  // ع
  'علم', 'عسل', 'عروس', 'عطر', 'عکس', 'عمو',
  // غ
  'غاز', 'غبار', 'غذا', 'غنچه', 'غواص', 'غلیظ',
  // ف
  'فانوس', 'فتح', 'فندق', 'فیل', 'فرش', 'فلامینگو',
  // ق
  'قارچ', 'قاشق', 'قالی', 'قایق', 'قصه', 'قطره', 'قلم', 'قند', 'قهوه', 'قیچی', 'قوم',
  // ک
  'کاغذ', 'کباب', 'کبوتر', 'کلاه', 'کفش', 'کلید', 'کتاب', 'کرم', 'کوه', 'کارتن', 'کوشش', 'کاپوچینو',
  // گ
  'گاو', 'گربه', 'گل', 'گلدان', 'گنجشک', 'گردو', 'گوسفند', 'گاز',
  // ل
  'لباس', 'لطف', 'لنگر', 'لوله', 'لیمو', 'لاکپشت',
  // م
  'مادر', 'ماسک', 'ماه', 'ماهی', 'مداد', 'مرغ', 'مروارید', 'مشکل', 'میمون', 'موز', 'موش', 'مار', 'میخک',
  // ن
  'ناقوس', 'نان', 'نخل', 'نرگس', 'نمد', 'نارنج', 'نوک', 'نیل',
  // و
  'والیبال', 'وزیر', 'ویلن',
  // ه
  'هتل', 'هدیه', 'هوا', 'هندوانه', 'هلو', 'هویج', 'هوس',
  // ی
  'یاس', 'یخ', 'یوزپلنگ',
];

export const enWords: readonly string[] = [
  'apple', 'ant', 'apron', 'anchor', 'arm', 'avocado',
  'banana', 'bear', 'bee', 'book', 'boat', 'bread', 'breakfast', 'butterfly', 'bridge', 'bulb', 'crab', 'web', 'job', 'ball', 'bell', 'bed', 'bird', 'buzz', 'bus', 'box', 'baby',
  'cat', 'car', 'cake', 'camel', 'carrot', 'candle', 'castle', 'cloud', 'coffee', 'cookie', 'coin', 'card', 'city', 'chess',
  'dog', 'door', 'dolphin', 'duck', 'dragon', 'dream', 'dress', 'desk', 'diamond',
  'egg', 'ear', 'elbow', 'engine', 'envelope', 'evening', 'eagle', 'east',
  'fish', 'fox', 'frog', 'fork', 'farm', 'feather', 'forest', 'finger', 'flower', 'family',
  'goat', 'gift', 'garden', 'grape', 'glass', 'gold', 'guitar', 'gum', 'grass', 'guru',
  'hat', 'hand', 'horse', 'house', 'heart', 'honey', 'hammer', 'holiday',
  'ice', 'iron', 'island', 'igloo', 'ink', 'insect',
  'jacket', 'jam', 'jungle', 'juice', 'jar', 'jazz',
  'key', 'kite', 'kitchen', 'kangaroo', 'kiss', 'kiwi',
  'lion', 'lemon', 'lamp', 'ladder', 'lizard', 'lollipop', 'library', 'leaf',
  'moon', 'monkey', 'mountain', 'mouse', 'mouth', 'mushroom', 'music', 'magic', 'mirror', 'milk', 'menu', 'map',
  'nose', 'night', 'nest', 'nurse', 'nut', 'north',
  'orange', 'owl', 'ocean', 'oil', 'oven', 'onion',
  'pig', 'pen', 'panda', 'pants', 'parrot', 'pencil', 'penguin', 'peach', 'park',
  'queen', 'question', 'quilt', 'quiz',
  'rain', 'river', 'rabbit', 'robot', 'rocket', 'rainbow', 'road', 'roof', 'ring',
  'sun', 'shoe', 'snake', 'spider', 'snow', 'summer', 'sandwich', 'spoon', 'silver', 'star', 'sugar', 'sleep', 'snail', 'storm', 'spring', 'ski', 'safari', 'sofa', 'six',
  'table', 'tiger', 'tree', 'tower', 'town', 'tooth', 'tea', 'turtle', 'thunder', 'train', 'taxi', 'tax', 'team',
  'umbrella', 'unicorn', 'uncle',
  'vase', 'violin', 'vegetable', 'village', 'volcano', 'vanilla',
  'water', 'window', 'winter', 'wind', 'wing', 'watermelon', 'whale', 'wolf', 'week', 'wax', 'world',
  'xylophone', 'xenon',
  'yellow', 'yak', 'yogurt', 'yarn', 'year', 'young',
  'zebra', 'zoo', 'zero', 'zipper',
  'potato', 'tomato', 'video', 'hippo',
];
