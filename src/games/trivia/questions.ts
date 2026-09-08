import type { Localized } from '../../core/types';

export interface TriviaQuestion {
  category: Localized;
  q: Localized;
  options: Localized[];
  /** correct option index in data-space */
  answer: number;
}

/** Bilingual general-knowledge bank (4 options each, `answer` = data-space index). */
export const QUESTIONS: readonly TriviaQuestion[] = [
  {
    category: { fa: 'علوم', en: 'Science' },
    q: { fa: 'بزرگ‌ترین سیارهٔ منظومهٔ شمسی کدام است؟', en: 'Which is the largest planet in the solar system?' },
    options: [
      { fa: 'زمین', en: 'Earth' },
      { fa: 'مشتری', en: 'Jupiter' },
      { fa: 'مریخ', en: 'Mars' },
      { fa: 'زحل', en: 'Saturn' },
    ],
    answer: 1,
  },
  {
    category: { fa: 'علوم', en: 'Science' },
    q: { fa: 'آب در سطح دریا در چند درجهٔ سانتی‌گراد می‌جوشد؟', en: 'At what temperature (°C) does water boil at sea level?' },
    options: [
      { fa: '۹۰', en: '90' },
      { fa: '۱۰۰', en: '100' },
      { fa: '۱۱۰', en: '110' },
      { fa: '۱۲۰', en: '120' },
    ],
    answer: 1,
  },
  {
    category: { fa: 'جغرافیا', en: 'Geography' },
    q: { fa: 'بلندترین قلهٔ جهان کدام است؟', en: "What is the world's highest mountain?" },
    options: [
      { fa: 'کلیمانجارو', en: 'Kilimanjaro' },
      { fa: 'اورست', en: 'Everest' },
      { fa: 'دماوند', en: 'Damavand' },
      { fa: 'مون‌بلان', en: 'Mont Blanc' },
    ],
    answer: 1,
  },
  {
    category: { fa: 'جغرافیا', en: 'Geography' },
    q: { fa: 'بزرگ‌ترین اقیانوس جهان کدام است؟', en: "Which is the world's largest ocean?" },
    options: [
      { fa: 'اطلس', en: 'Atlantic' },
      { fa: 'هند', en: 'Indian' },
      { fa: 'آرام', en: 'Pacific' },
      { fa: 'منجمد شمالی', en: 'Arctic' },
    ],
    answer: 2,
  },
  {
    category: { fa: 'تاریخ', en: 'History' },
    q: { fa: 'اهرام بزرگ جیزه در کدام کشور قرار دارند؟', en: 'The Great Pyramids of Giza are in which country?' },
    options: [
      { fa: 'عراق', en: 'Iraq' },
      { fa: 'مصر', en: 'Egypt' },
      { fa: 'مکزیک', en: 'Mexico' },
      { fa: 'سودان', en: 'Sudan' },
    ],
    answer: 1,
  },
  {
    category: { fa: 'تاریخ', en: 'History' },
    q: { fa: 'کدام دریادل در سال ۱۴۹۲ به آمریکای مرکزی رسید؟', en: 'Which navigator reached the Americas in 1492?' },
    options: [
      { fa: 'ماژلان', en: 'Magellan' },
      { fa: 'کلمب', en: 'Columbus' },
      { fa: 'واسکو دا گاما', en: 'Vasco da Gama' },
      { fa: 'آمریگو وسپوچی', en: 'Amerigo Vespucci' },
    ],
    answer: 1,
  },
  {
    category: { fa: 'هنر', en: 'Art' },
    q: { fa: 'نقاشی «شب پرستاره» اثر کیست؟', en: 'Who painted "The Starry Night"?' },
    options: [
      { fa: 'داوینچی', en: 'Da Vinci' },
      { fa: 'ون‌گوگ', en: 'Van Gogh' },
      { fa: 'پیکاسو', en: 'Picasso' },
      { fa: 'سالوادور دالی', en: 'Salvador Dalí' },
    ],
    answer: 1,
  },
  {
    category: { fa: 'علوم', en: 'Science' },
    q: { fa: 'نماد شیمیایی طلا چیست؟', en: "What is the chemical symbol for gold?" },
    options: [
      { fa: 'Ag', en: 'Ag' },
      { fa: 'Au', en: 'Au' },
      { fa: 'Fe', en: 'Fe' },
      { fa: 'Go', en: 'Go' },
    ],
    answer: 1,
  },
  {
    category: { fa: 'علوم', en: 'Science' },
    q: { fa: 'هشت‌پا چند قلب دارد؟', en: 'How many hearts does an octopus have?' },
    options: [
      { fa: 'یک', en: 'One' },
      { fa: 'دو', en: 'Two' },
      { fa: 'سه', en: 'Three' },
      { fa: 'چهار', en: 'Four' },
    ],
    answer: 2,
  },
  {
    category: { fa: 'ورزش', en: 'Sports' },
    q: { fa: 'هر تیم والیبال چند بازیکن در زمین دارد؟', en: 'How many players per volleyball team are on court?' },
    options: [
      { fa: '۵', en: '5' },
      { fa: '۶', en: '6' },
      { fa: '۷', en: '7' },
      { fa: '۸', en: '8' },
    ],
    answer: 1,
  },
  {
    category: { fa: 'ورزش', en: 'Sports' },
    q: { fa: 'جام جهانی فوتبال هر چند سال یک‌بار برگزار می‌شود؟', en: 'How often is the FIFA World Cup held?' },
    options: [
      { fa: 'هر ۲ سال', en: 'Every 2 years' },
      { fa: 'هر ۳ سال', en: 'Every 3 years' },
      { fa: 'هر ۴ سال', en: 'Every 4 years' },
      { fa: 'هر ۵ سال', en: 'Every 5 years' },
    ],
    answer: 2,
  },
  {
    category: { fa: 'عمومی', en: 'General' },
    q: { fa: 'پایتخت ژاپن کدام شهر است؟', en: 'What is the capital of Japan?' },
    options: [
      { fa: 'اوساکا', en: 'Osaka' },
      { fa: 'توکیو', en: 'Tokyo' },
      { fa: 'کیوتو', en: 'Kyoto' },
      { fa: 'ناگویا', en: 'Nagoya' },
    ],
    answer: 1,
  },
  {
    category: { fa: 'عمومی', en: 'General' },
    q: { fa: 'بزرگ‌ترین حیوان خشکی کدام است؟', en: "What is the largest land animal?" },
    options: [
      { fa: 'فیل آفریقایی', en: 'African elephant' },
      { fa: 'کرگدن سفید', en: 'White rhino' },
      { fa: 'زرافه', en: 'Giraffe' },
      { fa: 'اسب آبی', en: 'Hippopotamus' },
    ],
    answer: 0,
  },
  {
    category: { fa: 'علوم', en: 'Science' },
    q: { fa: 'سریع‌ترین حیوان خشکی کدام است؟', en: "What is the fastest land animal?" },
    options: [
      { fa: 'شیر', en: 'Lion' },
      { fa: 'یوزپلنگ', en: 'Cheetah' },
      { fa: 'اسب تاخت', en: 'Racehorse' },
      { fa: 'غزال', en: 'Gazelle' },
    ],
    answer: 1,
  },
  {
    category: { fa: 'جغرافیا', en: 'Geography' },
    q: { fa: 'رود نیل در کدام قاره جریان دارد؟', en: 'The Nile river flows on which continent?' },
    options: [
      { fa: 'آسیا', en: 'Asia' },
      { fa: 'آفریقا', en: 'Africa' },
      { fa: 'اروپا', en: 'Europe' },
      { fa: 'آمریکا', en: 'Americas' },
    ],
    answer: 1,
  },
  {
    category: { fa: 'هنر', en: 'Art' },
    q: { fa: 'سمفونی پنجم («سرنوشت») اثر کدام آهنگساز است؟', en: 'Who composed the Fifth ("Fate") Symphony?' },
    options: [
      { fa: 'باخ', en: 'Bach' },
      { fa: 'بتهوون', en: 'Beethoven' },
      { fa: 'موتسارت', en: 'Mozart' },
      { fa: 'شوپن', en: 'Chopin' },
    ],
    answer: 1,
  },
  {
    category: { fa: 'علوم', en: 'Science' },
    q: { fa: 'نور خورشید تقریباً در چه زمانی به زمین می‌رسد؟', en: 'Roughly how long does sunlight take to reach Earth?' },
    options: [
      { fa: '۸ ثانیه', en: '8 seconds' },
      { fa: '۸ دقیقه', en: '8 minutes' },
      { fa: '۸ ساعت', en: '8 hours' },
      { fa: '۸۰ دقیقه', en: '80 minutes' },
    ],
    answer: 1,
  },
  {
    category: { fa: 'عمومی', en: 'General' },
    q: { fa: 'برج ایفل در کدام کشور است؟', en: 'The Eiffel Tower is in which country?' },
    options: [
      { fa: 'ایتالیا', en: 'Italy' },
      { fa: 'فرانسه', en: 'France' },
      { fa: 'اسپانیا', en: 'Spain' },
      { fa: 'بلژیک', en: 'Belgium' },
    ],
    answer: 1,
  },
  {
    category: { fa: 'علوم', en: 'Science' },
    q: { fa: 'بدن یک انسان بزرگسال چند استخوان دارد؟', en: 'How many bones are in an adult human body?' },
    options: [
      { fa: '۱۸۶', en: '186' },
      { fa: '۲۰۶', en: '206' },
      { fa: '۲۲۶', en: '226' },
      { fa: '۳۰۶', en: '306' },
    ],
    answer: 1,
  },
  {
    category: { fa: 'جغرافیا', en: 'Geography' },
    q: { fa: 'بزرگ‌ترین جزیرهٔ جهان کدام است؟', en: "What is the world's largest island?" },
    options: [
      { fa: 'ماداگاسکار', en: 'Madagascar' },
      { fa: 'گرینلند', en: 'Greenland' },
      { fa: 'بورنئو', en: 'Borneo' },
      { fa: 'استرالیا', en: 'Australia' },
    ],
    answer: 1,
  },
  {
    category: { fa: 'عمومی', en: 'General' },
    q: { fa: 'کدام میوه دانه‌هایش بیرون از گوشت میوه است؟', en: "Which fruit wears its seeds on the outside?" },
    options: [
      { fa: 'سیب', en: 'Apple' },
      { fa: 'توت‌فرنگی', en: 'Strawberry' },
      { fa: 'موز', en: 'Banana' },
      { fa: 'پرتقال', en: 'Orange' },
    ],
    answer: 1,
  },
  {
    category: { fa: 'ورزش', en: 'Sports' },
    q: { fa: 'در شطرنج کدام مهره فقط مورب حرکت می‌کند؟', en: 'Which chess piece only moves diagonally?' },
    options: [
      { fa: 'فیل', en: 'Bishop' },
      { fa: 'اسب', en: 'Knight' },
      { fa: 'رخ', en: 'Rook' },
      { fa: 'شاه', en: 'King' },
    ],
    answer: 0,
  },
  {
    category: { fa: 'تاریخ', en: 'History' },
    q: { fa: 'دیوار بزرگ در کدام کشور ساخته شده است؟', en: 'The Great Wall was built in which country?' },
    options: [
      { fa: 'ژاپن', en: 'Japan' },
      { fa: 'چین', en: 'China' },
      { fa: 'هند', en: 'India' },
      { fa: 'مغولستان', en: 'Mongolia' },
    ],
    answer: 1,
  },
  {
    category: { fa: 'علوم', en: 'Science' },
    q: { fa: 'فراوان‌ترین گاز جو زمین کدام است؟', en: "What is the most abundant gas in Earth's atmosphere?" },
    options: [
      { fa: 'اکسیژن', en: 'Oxygen' },
      { fa: 'نیتروژن', en: 'Nitrogen' },
      { fa: 'کربن‌دی‌اکسید', en: 'Carbon dioxide' },
      { fa: 'هیدروژن', en: 'Hydrogen' },
    ],
    answer: 1,
  },
  {
    category: { fa: 'علوم', en: 'Science' },
    q: { fa: 'سرعت نور در خلأ تقریباً چقدر است؟', en: 'Approximately how fast is light in a vacuum?' },
    options: [
      { fa: '۳۰۰ کیلومتر بر ثانیه', en: '300 km/s' },
      { fa: '۳ هزار کیلومتر بر ثانیه', en: '3,000 km/s' },
      { fa: '۳۰۰ هزار کیلومتر بر ثانیه', en: '300,000 km/s' },
      { fa: '۳ میلیون کیلومتر بر ثانیه', en: '3,000,000 km/s' },
    ],
    answer: 2,
  },
  {
    category: { fa: 'جغرافیا', en: 'Geography' },
    q: { fa: 'بزرگ‌ترین بیابان داغ جهان کدام است؟', en: "What is the world's largest hot desert?" },
    options: [
      { fa: 'گوپی', en: 'Gobi' },
      { fa: 'صحرا', en: 'Sahara' },
      { fa: 'کالاهاری', en: 'Kalahari' },
      { fa: 'آتاکاما', en: 'Atacama' },
    ],
    answer: 1,
  },
  {
    category: { fa: 'هنر', en: 'Art' },
    q: { fa: 'کارگردان فیلم «تایتانیک» کیست؟', en: 'Who directed the movie "Titanic"?' },
    options: [
      { fa: 'اسپیلبرگ', en: 'Spielberg' },
      { fa: 'جیمز کامرون', en: 'James Cameron' },
      { fa: 'کریستوفر نولان', en: 'Christopher Nolan' },
      { fa: 'ریدلی اسکات', en: 'Ridley Scott' },
    ],
    answer: 1,
  },
  {
    category: { fa: 'عمومی', en: 'General' },
    q: { fa: 'کدام پرنده پرواز نمی‌کند؟', en: 'Which of these birds cannot fly?' },
    options: [
      { fa: 'عقاب', en: 'Eagle' },
      { fa: 'گنجشک', en: 'Sparrow' },
      { fa: 'پنگوئن', en: 'Penguin' },
      { fa: 'بلبل', en: 'Nightingale' },
    ],
    answer: 2,
  },
  {
    category: { fa: 'علوم', en: 'Science' },
    q: { fa: 'خون توسط کدام اندام پمپ می‌شود؟', en: 'Which organ pumps blood through the body?' },
    options: [
      { fa: 'قلب', en: 'Heart' },
      { fa: 'کبد', en: 'Liver' },
      { fa: 'شش', en: 'Lung' },
      { fa: 'مغز', en: 'Brain' },
    ],
    answer: 0,
  },
  {
    category: { fa: 'عمومی', en: 'General' },
    q: { fa: 'بیشترین گویشور بومی به کدام زبان دارند؟', en: 'Which language has the most native speakers?' },
    options: [
      { fa: 'انگلیسی', en: 'English' },
      { fa: 'چینی (ماندارین)', en: 'Mandarin Chinese' },
      { fa: 'اسپانیایی', en: 'Spanish' },
      { fa: 'عربی', en: 'Arabic' },
    ],
    answer: 1,
  },
  {
    category: { fa: 'ورزش', en: 'Sports' },
    q: { fa: 'المپیک تابستانی هر چند سال برگزار می‌شود؟', en: 'How often are the Summer Olympics held?' },
    options: [
      { fa: 'هر ۲ سال', en: 'Every 2 years' },
      { fa: 'هر ۳ سال', en: 'Every 3 years' },
      { fa: 'هر ۴ سال', en: 'Every 4 years' },
      { fa: 'هر ۵ سال', en: 'Every 5 years' },
    ],
    answer: 2,
  },
  {
    category: { fa: 'جغرافیا', en: 'Geography' },
    q: { fa: 'کدام کشور بزرگ‌ترین مساحت را دارد؟', en: 'Which country has the largest area?' },
    options: [
      { fa: 'چین', en: 'China' },
      { fa: 'روسیه', en: 'Russia' },
      { fa: 'کانادا', en: 'Canada' },
      { fa: 'آمریکا', en: 'USA' },
    ],
    answer: 1,
  },
  {
    category: { fa: 'علوم', en: 'Science' },
    q: { fa: 'سیب چرا به سمت زمین می‌افتد؟', en: 'Why does an apple fall to the ground?' },
    options: [
      { fa: 'مغناطیس', en: 'Magnetism' },
      { fa: 'گرانش', en: 'Gravity' },
      { fa: 'اصطکاک', en: 'Friction' },
      { fa: 'الکتریسیته', en: 'Electricity' },
    ],
    answer: 1,
  },
  {
    category: { fa: 'عمومی', en: 'General' },
    q: { fa: 'کدام فلز در دمای اتاق مایع است؟', en: 'Which metal is liquid at room temperature?' },
    options: [
      { fa: 'جیوه', en: 'Mercury' },
      { fa: 'آهن', en: 'Iron' },
      { fa: 'سرب', en: 'Lead' },
      { fa: 'قلع', en: 'Tin' },
    ],
    answer: 0,
  },
  {
    category: { fa: 'هنر', en: 'Art' },
    q: { fa: 'نقاشی «مونالیزا» در کدام موزه است؟', en: 'In which museum is the Mona Lisa?' },
    options: [
      { fa: 'لوور', en: 'The Louvre' },
      { fa: 'پرادو', en: 'The Prado' },
      { fa: 'ارمیتاژ', en: 'The Hermitage' },
      { fa: 'متروپولیتن', en: 'The Met' },
    ],
    answer: 0,
  },
  {
    category: { fa: 'ورزش', en: 'Sports' },
    q: { fa: 'مسابقهٔ ماراتن تقریباً چند کیلومتر است؟', en: 'A marathon race is roughly how many km?' },
    options: [
      { fa: '۳۸', en: '38' },
      { fa: '۴۲', en: '42' },
      { fa: '۴۶', en: '46' },
      { fa: '۵۰', en: '50' },
    ],
    answer: 1,
  },
  {
    category: { fa: 'عمومی', en: 'General' },
    q: { fa: 'زادگاه پیتزا کدام کشور است؟', en: 'Pizza originated in which country?' },
    options: [
      { fa: 'ایتالیا', en: 'Italy' },
      { fa: 'آمریکا', en: 'USA' },
      { fa: 'فرانسه', en: 'France' },
      { fa: 'یونان', en: 'Greece' },
    ],
    answer: 0,
  },
  {
    category: { fa: 'جغرافیا', en: 'Geography' },
    q: { fa: 'دریای خزر با چند کشور هم‌مرز است؟', en: 'The Caspian Sea borders how many countries?' },
    options: [
      { fa: '۳', en: '3' },
      { fa: '۴', en: '4' },
      { fa: '۵', en: '5' },
      { fa: '۶', en: '6' },
    ],
    answer: 2,
  },
  {
    category: { fa: 'علوم', en: 'Science' },
    q: { fa: 'ستارهٔ قطبی در کدام صورت فلکی است؟', en: 'Polaris sits in which constellation?' },
    options: [
      { fa: 'دب اکبر', en: 'Ursa Major' },
      { fa: 'دب اصغر', en: 'Ursa Minor' },
      { fa: 'جبار', en: 'Orion' },
      { fa: 'کاسیوپیا', en: 'Cassiopeia' },
    ],
    answer: 1,
  },
  {
    category: { fa: 'علوم', en: 'Science' },
    q: { fa: 'کدام حشره خودش نور تولید می‌کند؟', en: 'Which insect produces its own light?' },
    options: [
      { fa: 'کرم شب‌تاب', en: 'Firefly' },
      { fa: 'پروانه', en: 'Butterfly' },
      { fa: 'زنبور', en: 'Bee' },
      { fa: 'مورچه', en: 'Ant' },
    ],
    answer: 0,
  },
  {
    category: { fa: 'عمومی', en: 'General' },
    q: { fa: 'در رنگین‌کمان چند رنگ اصلی می‌بینیم؟', en: 'How many colors are in a rainbow?' },
    options: [
      { fa: '۵', en: '5' },
      { fa: '۶', en: '6' },
      { fa: '۷', en: '7' },
      { fa: '۸', en: '8' },
    ],
    answer: 2,
  },
  {
    category: { fa: 'عمومی', en: 'General' },
    q: { fa: 'بلندترین حیوان جهان کدام است؟', en: "What is the world's tallest animal?" },
    options: [
      { fa: 'زرافه', en: 'Giraffe' },
      { fa: 'فیل', en: 'Elephant' },
      { fa: 'شتر', en: 'Camel' },
      { fa: 'خرس قطبی', en: 'Polar bear' },
    ],
    answer: 0,
  },
  {
    category: { fa: 'هنر', en: 'Art' },
    q: { fa: 'مجسمهٔ آزادی در کدام شهر ایستاده است؟', en: 'The Statue of Liberty stands in which city?' },
    options: [
      { fa: 'نیویورک', en: 'New York' },
      { fa: 'لس‌آنجلس', en: 'Los Angeles' },
      { fa: 'واشنگتن', en: 'Washington' },
      { fa: 'بوستون', en: 'Boston' },
    ],
    answer: 0,
  },
];
