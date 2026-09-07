import '../../../core/i18n/app_localizations.dart';

/// One step of a "how to play" tutorial sheet.
class TutorialStep {
  const TutorialStep({required this.emoji, required this.titleEn, required this.titleFa, required this.bodyEn, required this.bodyFa});

  final String emoji;
  final String titleEn;
  final String titleFa;
  final String bodyEn;
  final String bodyFa;

  String title(AppLanguage lang) => lang == AppLanguage.persian ? titleFa : titleEn;
  String body(AppLanguage lang) => lang == AppLanguage.persian ? bodyFa : bodyEn;
}

/// Short, friendly in-app tutorials for every catalogue game, in both
/// languages. Fallback generic steps are used for unknown slugs.
class GameTutorials {
  GameTutorials._();

  static List<TutorialStep> steps(String slug) => _data[slug] ?? _generic;

  static const List<TutorialStep> _generic = [
    TutorialStep(
      emoji: '🎯',
      titleEn: 'Goal',
      titleFa: 'هدف',
      bodyEn: 'Beat your opponents by completing the game objective first.',
      bodyFa: 'با رسیدن زودتر از حریفان به هدف بازی، برنده شو.',
    ),
    TutorialStep(
      emoji: '🤖',
      titleEn: 'Opponents',
      titleFa: 'حریفان',
      bodyEn: 'Play with friends; when the table is quiet, invisible players fill seats instantly.',
      bodyFa: 'با دوستانت بازی کن؛ اگر میز خلوت باشد، بازیکنان نامرئی بلافاصله صندلی‌ها را پر می‌کنند.',
    ),
    TutorialStep(
      emoji: '🏆',
      titleEn: 'Rewards',
      titleFa: 'جوایز',
      bodyEn: 'Win to earn coins, XP and ranked pips for the season leaderboard.',
      bodyFa: 'با برد، سکه، امتیاز تجربه و پیپ رتبه‌بندی فصل می‌گیری.',
    ),
  ];

  static const Map<String, List<TutorialStep>> _data = {
    'connect4': [
      TutorialStep(
        emoji: '🔴',
        titleEn: 'Drop discs',
        titleFa: 'انداختن مهره',
        bodyEn: 'Take turns dropping a disc into one of the 7 columns. It falls to the lowest open slot.',
        bodyFa: 'نوبتی یک مهره را در یکی از ۷ ستون بینداز؛ مهره تا پایین‌ترین خانه خالی می‌افتد.',
      ),
      TutorialStep(
        emoji: '🔗',
        titleEn: 'Connect four',
        titleFa: 'چهار در خط',
        bodyEn: 'Line up four of your discs horizontally, vertically or diagonally to win.',
        bodyFa: 'چهار مهره‌ی همرنگ را افقی، عمودی یا مورب پشت سر هم بچین تا برنده شوی.',
      ),
      TutorialStep(
        emoji: '🛡️',
        titleEn: 'Block & build',
        titleFa: 'دفاع و حمله',
        bodyEn: 'Watch the centre columns — block your rival’s runs while building yours.',
        bodyFa: 'مراقب ستون‌های وسط باش؛ هم ردیف حریف را ببند، هم ردیف خودت را بساز.',
      ),
    ],
    'dominoes': [
      TutorialStep(
        emoji: '🁢',
        titleEn: 'Match the ends',
        titleFa: 'جفت‌کردن سرها',
        bodyEn: 'Play a tile whose number matches an open end of the chain. Doubles are placed across.',
        bodyFa: 'مهره‌ای بگذار که عددش با یکی از دو سر زنجیر بخواند؛ جفت‌ها عمودی قرار می‌گیرند.',
      ),
      TutorialStep(
        emoji: '🚪',
        titleEn: 'Blocked? draw',
        titleFa: 'بسته؟ قرعه بکش',
        bodyEn: 'If you cannot play, draw from the boneyard until you can. Pass if none remain.',
        bodyFa: 'اگر مهره قابل بازی نداری، از انبار بکش تا جایی که بتوانی بازی کنی.',
      ),
      TutorialStep(
        emoji: '🏁',
        titleEn: 'Empty hand wins',
        titleFa: 'دست خالی برنده است',
        bodyEn: 'First player to empty their hand wins the round; lowest pips win a blocked round.',
        bodyFa: 'هرکه اول دستش را خالی کند برنده‌ی دور است؛ در مسدودشدن، کمترین نقطه می‌برد.',
      ),
    ],
    'ludo': [
      TutorialStep(
        emoji: '🎲',
        titleEn: 'Roll a six',
        titleFa: 'شش بیار',
        bodyEn: 'Roll a 6 to move a token out of home. Sixes grant an extra roll.',
        bodyFa: 'برای خارج‌کردن مهره از خانه باید شش بیاوری؛ شش یک پرتاب اضافه دارد.',
      ),
      TutorialStep(
        emoji: '🗺️',
        titleEn: 'Race home',
        titleFa: 'مسابقه تا مقصد',
        bodyEn: 'Move all four tokens around the board and into your home column.',
        bodyFa: 'هر چهار مهره‌ات را دور صفحه بچرخان و وارد ستون خانه‌ی خودت کن.',
      ),
      TutorialStep(
        emoji: '💥',
        titleEn: 'Capture',
        titleFa: 'زدن مهره',
        bodyEn: 'Land on an opponent’s token to send it back home.',
        bodyFa: 'روی مهره‌ی حریف بنشین تا به خانه‌اش برگردد.',
      ),
    ],
    'chess': [
      TutorialStep(
        emoji: '♟️',
        titleEn: 'Checkmate the king',
        titleFa: 'کیش‌ومات شاه',
        bodyEn: 'Move your pieces to trap the opponent’s king so it cannot escape.',
        bodyFa: 'مهره‌هایت را طوری حرکت بده که شاه حریف راه فراری نداشته باشد.',
      ),
      TutorialStep(
        emoji: '🐎',
        titleEn: 'Learn the moves',
        titleFa: 'حرکت مهره‌ها',
        bodyEn: 'Pawns move forward, bishops diagonally, rooks straight, knights in an L, queens any way.',
        bodyFa: 'سرباز مستقیم، فیل مورب، رخ مستقیم، اسب Lمانند و وزیر همه‌جهت حرکت می‌کند.',
      ),
      TutorialStep(
        emoji: '🧠',
        titleEn: 'Think ahead',
        titleFa: 'آینده‌نگری',
        bodyEn: 'Protect your king, develop pieces early, and never leave a free capture.',
        bodyFa: 'شاهت را حفظ کن، مهره‌ها را زود فعال کن و مهره‌ی رایگان به حریف نده.',
      ),
    ],
    'bingo': [
      TutorialStep(
        emoji: '📇',
        titleEn: 'Your card',
        titleFa: 'کارت تو',
        bodyEn: 'Each player gets a 5×5 card of random numbers.',
        bodyFa: 'هر بازیکن یک کارت ۵×۵ از اعداد تصادفی دارد.',
      ),
      TutorialStep(
        emoji: '🔢',
        titleEn: 'Mark calls',
        titleFa: 'علامت‌زدن اعداد',
        bodyEn: 'Numbers are called one by one — tap them on your card if you have them.',
        bodyFa: 'اعداد یکی‌یکی اعلام می‌شوند؛ اگر روی کارتت بود، لمسش کن.',
      ),
      TutorialStep(
        emoji: '📣',
        titleEn: 'Shout Bingo!',
        titleFa: 'بگو بینگو!',
        bodyEn: 'Complete a full line (horizontal, vertical or diagonal) first to win.',
        bodyFa: 'اول کسی که یک خط کامل افقی، عمودی یا مورب بسازد برنده است.',
      ),
    ],
    'dice_party': [
      TutorialStep(
        emoji: '🎲',
        titleEn: 'Roll together',
        titleFa: 'پرتاب گروهی',
        bodyEn: 'Everyone rolls at the same time when the round starts.',
        bodyFa: 'با شروع دور، همه هم‌زمان تاس می‌ریزند.',
      ),
      TutorialStep(
        emoji: '🎯',
        titleEn: 'Match the target',
        titleFa: 'هدف دور',
        bodyEn: 'Each round asks for a pattern: pairs, triples, high total or a lucky number.',
        bodyFa: 'هر دور یک هدف دارد: جفت، سه‌تا، مجموع بالا یا عدد شانس.',
      ),
      TutorialStep(
        emoji: '⚡',
        titleEn: 'Fastest wins',
        titleFa: 'سریع‌ترین برنده است',
        bodyEn: 'Lock your result quickly — speed and luck both score!',
        bodyFa: 'نتیجه‌ات را سریع ثبت کن؛ هم سرعت و هم شانس امتیاز دارد!',
      ),
    ],
    'ocho': [
      TutorialStep(
        emoji: '🃏',
        titleEn: 'Match colour or number',
        titleFa: 'همرنگ یا هم‌عدد',
        bodyEn: 'Play a card matching the top card’s colour or number. Draw if you can’t.',
        bodyFa: 'کارتی بگذار که با رنگ یا عدد کارت روی زمین بخواند؛ وگرنه کارت بکش.',
      ),
      TutorialStep(
        emoji: '🔄',
        titleEn: 'Action cards',
        titleFa: 'کارت‌های عملیات',
        bodyEn: 'Skips pass a turn, reverses flip direction, +2/+4 force draws.',
        bodyFa: 'کارت رد‌شدن، تغییر جهت، +۲ و +۴ بازی را به نفع تو می‌چرخانند.',
      ),
      TutorialStep(
        emoji: '🔔',
        titleEn: 'One card left?',
        titleFa: 'یک کارت مانده؟',
        bodyEn: 'Announce it when you’re down to your last card, or draw a penalty!',
        bodyFa: 'وقتی یک کارت مانده اعلام کن، وگرنه جریامه می‌شوی!',
      ),
    ],
    'carrom': [
      TutorialStep(
        emoji: '⚪',
        titleEn: 'Flick the striker',
        titleFa: 'ضربه با مهره‌زن',
        bodyEn: 'Drag and release the striker to knock coins into the corner pockets.',
        bodyFa: 'مهره‌زن را بکش و رها کن تا سکه‌ها را به گوشه‌ها بفرستی.',
      ),
      TutorialStep(
        emoji: '⚫⚪',
        titleEn: 'Collect your colour',
        titleFa: 'جمع‌کردن رنگ خودت',
        bodyEn: 'Pocket all your coins (white or black), then the red queen last to win.',
        bodyFa: 'همه‌ی سکه‌های رنگ خودت و در آخر سکه‌ی قرمز (ملکه) را گل کن.',
      ),
      TutorialStep(
        emoji: '🎯',
        titleEn: 'Keep your turn',
        titleFa: 'ادامه نوبت',
        bodyEn: 'A successful pocket keeps your turn — a miss hands it over.',
        bodyFa: 'با هر گل نوبتت ادامه پیدا می‌کند؛ خطا یعنی نوبت حریف.',
      ),
    ],
    'pool_8ball': [
      TutorialStep(
        emoji: '🎱',
        titleEn: 'Sink the 8 last',
        titleFa: 'توپ ۸ آخر',
        bodyEn: 'Clear your group (solids or stripes) first, then pocket the black 8 to win.',
        bodyFa: 'اول گروه خودت (توپر یا راه‌راه) را گل کن، بعد توپ مشکی ۸ را.',
      ),
      TutorialStep(
        emoji: '🎯',
        titleEn: 'Aim & power',
        titleFa: 'هدف و قدرت',
        bodyEn: 'Drag the cue to aim, pull back for power, and release to shoot.',
        bodyFa: 'چوب را برای نشانه‌گیری بکش، عقب‌تر بکش برای قدرت و رها کن.',
      ),
      TutorialStep(
        emoji: '⚠️',
        titleEn: 'Watch fouls',
        titleFa: 'مراقب خطا باش',
        bodyEn: 'Scratching the cue ball or sinking the 8 early loses the game.',
        bodyFa: 'گل‌شدن توپ سفید یا زودتر از موعد توپ ۸ یعنی باخت.',
      ),
    ],
    'emoji_charades': [
      TutorialStep(
        emoji: '😂',
        titleEn: 'Describe with emojis',
        titleFa: 'توضیح با ایموجی',
        bodyEn: 'One player gets a secret word and must express it with emoji tiles only.',
        bodyFa: 'یک بازیکن کلمه‌ی مخفی را فقط با چیدن ایموجی توضیح می‌دهد.',
      ),
      TutorialStep(
        emoji: '💬',
        titleEn: 'Guess fast',
        titleFa: 'سریع حدس بزن',
        bodyEn: 'Others type guesses in chat — the fastest correct guess scores.',
        bodyFa: 'بقیه در چت حدس می‌زنند؛ سریع‌ترین پاسخ درست امتیاز می‌گیرد.',
      ),
      TutorialStep(
        emoji: '⭐',
        titleEn: 'Best of rounds',
        titleFa: 'چند دور',
        bodyEn: 'Take turns describing; most points after the rounds wins.',
        bodyFa: 'نوبتی توضیح بدهید؛ بیشترین امتیاز در پایان برنده است.',
      ),
    ],
    'memory_race': [
      TutorialStep(
        emoji: '🃏',
        titleEn: 'Find the pairs',
        titleFa: 'پیدا کردن جفت‌ها',
        bodyEn: 'Flip two cards per turn — matching pairs stay revealed.',
        bodyFa: 'هر نوبت دو کارت برگردان؛ جفت‌های یکسان رو می‌مانند.',
      ),
      TutorialStep(
        emoji: '⚡',
        titleEn: 'Beat the clock',
        titleFa: 'مسابقه با زمان',
        bodyEn: 'Clear the board as fast as possible; fewer mistakes = higher score.',
        bodyFa: 'صفحه را هرچه سریع‌تر کامل کن؛ اشتباه کمتر یعنی امتیاز بیشتر.',
      ),
    ],
    'impostor_light': [
      TutorialStep(
        emoji: '🕵️',
        titleEn: 'Find the impostor',
        titleFa: 'پیداکردن خائن',
        bodyEn: 'Crewmates get a secret location; the impostor gets nothing and must blend in.',
        bodyFa: 'به هم‌تیمی‌ها یک مکان مخفی داده می‌شود؛ خائن چیزی ندارد و باید خودش را جا بزند.',
      ),
      TutorialStep(
        emoji: '❓',
        titleEn: 'Ask questions',
        titleFa: 'سوال بپرس',
        bodyEn: 'Discuss and question each other to spot who doesn’t know the location.',
        bodyFa: 'با پرسش‌وپاسخ بفهمی چه کسی مکان را نمی‌شناسد.',
      ),
      TutorialStep(
        emoji: '🗳️',
        titleEn: 'Vote together',
        titleFa: 'رای‌گیری',
        bodyEn: 'Vote out the suspect. Find the impostor to win, or the impostor wins!',
        bodyFa: 'به مظنون رای بدهید؛ خائن را پیدا کنید برنده‌اید، وگرنه خائن می‌برد!',
      ),
    ],
  };
}
