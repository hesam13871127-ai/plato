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
/// languages. Each rebuilt game ships its own steps (fa/en) as it lands;
/// unknown slugs fall back to the generic steps below.
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
    'dominoes': [
      TutorialStep(
        emoji: '🁢',
        titleEn: 'Match the ends',
        titleFa: 'جفت‌کردن سرها',
        bodyEn: 'Play a tile whose number matches an open end of the chain. Doubles sit crosswise on the table.',
        bodyFa: 'مهره‌ای بگذار که عددش با یکی از دو سر زنجیره بخواند؛ جفت‌ها به‌صورت عمود روی میز می‌نشینند.',
      ),
      TutorialStep(
        emoji: '🚪',
        titleEn: 'Blocked? Draw',
        titleFa: 'بسته؟ از انبار بکش',
        bodyEn: 'If nothing fits, draw from the boneyard until a tile matches. Pass only when the boneyard is empty.',
        bodyFa: 'اگر مهرهٔ مناسب نداری، از انبار بکش تا مهرهٔ قابل‌بازی بیاوری؛ فقط وقتی انبار خالی است رد شو.',
      ),
      TutorialStep(
        emoji: '👑',
        titleEn: 'Highest double leads',
        titleFa: 'بزرگ‌ترین جفت شروع می‌کند',
        bodyEn: 'The holder of the highest double opens the game. Lead any tile you like — set the tone!',
        bodyFa: 'دارندهٔ بزرگ‌ترین جفت بازی را شروع می‌کند. هر مهره‌ای دلت خواست باز کن تا لحن بازی مشخص شود!',
      ),
      TutorialStep(
        emoji: '🏁',
        titleEn: 'Empty hand wins',
        titleFa: 'دست خالی برنده است',
        bodyEn: 'First to empty their hand wins and scores every pip left in the opponents’ hands. Lightest hand wins a blocked table.',
        bodyFa: 'هرکه زودتر دستش خالی شود برنده است و همهٔ نقطه‌های دست حریفان را امتیاز می‌گیرد؛ اگر میز قفل شود، سبک‌ترین دست برنده است.',
      ),
    ],
    'ludo': [
      TutorialStep(
        emoji: '🎲',
        titleEn: 'Roll a six',
        titleFa: 'شش بیار',
        bodyEn: 'A 6 frees a token from your yard — and grants another roll. Beware: a third six in a row burns the turn!',
        bodyFa: 'با آوردن ۶ یک مهره از خانه بیرون می‌آید و یک پرتاب دیگر هم می‌گیری؛ اما سه شش پشت‌سرهم نوبتت را می‌سوزاند!',
      ),
      TutorialStep(
        emoji: '🗺️',
        titleEn: 'Race home',
        titleFa: 'مسابقه تا خانه',
        bodyEn: 'Travel 51 cells around the ring, then climb your 6-cell column. The exact roll lands a token home.',
        bodyFa: '۵۱ خانه دور مسیر برو و بعد ستون ۶ خانه‌ای خودت را بالا برو؛ فقط پرتاب دقیق مهره را به خانه می‌رساند.',
      ),
      TutorialStep(
        emoji: '💥',
        titleEn: 'Capture rivals',
        titleFa: 'زدن مهره حریف',
        bodyEn: 'Land on an opponent to send them back to their yard — start cells and star cells are safe for everyone.',
        bodyFa: 'روی مهرهٔ حریف فرود بیا تا به حیاطش برگردد؛ خانه‌های شروع و ستاره‌دار امن هستند و کسی آنجا زده نمی‌شود.',
      ),
      TutorialStep(
        emoji: '🏆',
        titleEn: 'All four home wins',
        titleFa: 'هر چهار مهره به خانه',
        bodyEn: 'The first seat with all four tokens home takes the crown. Chase those sixes!',
        bodyFa: 'اولین بازیکنی که هر چهار مهره‌اش را به خانه برساند برنده است. دنبال شش‌ها بگرد!',
      ),
    ],
    'ocho': [
      TutorialStep(
        emoji: '🃏',
        titleEn: 'Match the top',
        titleFa: 'مچ‌کردن کارت بالایی',
        bodyEn: 'Play a card that shares the top card’s colour or value. Wilds fit anywhere and let you call the next colour.',
        bodyFa: 'کارتی بگذار که رنگ یا عددش با کارت روی میز یکی باشد؛ کارت‌های وایلد همه‌جا می‌نشینند و رنگ بعدی را هم تو انتخاب می‌کنی.',
      ),
      TutorialStep(
        emoji: '⚡',
        titleEn: 'Action cards',
        titleFa: 'کارت‌های اکشن',
        bodyEn: 'Skip passes a rival by, Reverse flips the flow, +2 and +4 force draws — stack them for chaos!',
        bodyFa: 'اسکیپ حریف را رد می‌کند، ریورس جهت بازی را برمی‌گرداند، +۲ و +۴ مجبور به کشیدن کارت می‌کنند — برای آشوب ازشون استفاده کن!',
      ),
      TutorialStep(
        emoji: '✋',
        titleEn: 'Draw, then decide',
        titleFa: 'بکش، بعد تصمیم بگیر',
        bodyEn: 'No match? Draw one card — you may play exactly that card, or keep it and pass.',
        bodyFa: 'کارت مناسب نداری؟ یک کارت بکش — می‌توانی همان کارت را بازی کنی یا نگهش داری و پاس بدهی.',
      ),
      TutorialStep(
        emoji: '🏁',
        titleEn: 'Shout Ocho!',
        titleFa: 'بگو اُچو!',
        bodyEn: 'One card left? The table sees your Ocho! Empty your hand to win and score every rival’s leftover points.',
        bodyFa: 'یک کارت داری؟ همه اُچوی تو را می‌بینند! دستت را خالی کن تا برنده شوی و امتیاز کارت‌های باقی‌ماندهٔ حریفان را بگیری.',
      ),
    ],
    'connect4': [
      TutorialStep(
        emoji: '🔴',
        titleEn: 'Drop discs',
        titleFa: 'انداختن مهره',
        bodyEn: 'Take turns dropping a disc into one of the 7 columns — it falls to the lowest open slot.',
        bodyFa: 'نوبتی یک مهره در یکی از ۷ ستون بینداز؛ مهره تا پایین‌ترین خانهٔ خالی سقوط می‌کند.',
      ),
      TutorialStep(
        emoji: '🔗',
        titleEn: 'Connect four',
        titleFa: 'چهار در خط',
        bodyEn: 'Line up four of your discs horizontally, vertically or diagonally to win instantly.',
        bodyFa: 'چهار مهرهٔ همرنگت را افقی، عمودی یا مورب پشت سر هم بچین تا همان لحظه برنده شوی.',
      ),
      TutorialStep(
        emoji: '🛡️',
        titleEn: 'Block & build',
        titleFa: 'دفاع و حمله',
        bodyEn: 'The centre columns are power squares — block your rival’s runs while quietly building yours.',
        bodyFa: 'ستون‌های وسط طلایی‌ترین خانه‌ها هستند؛ هم ردیف حریف را ببند، هم بی‌سروصدا ردیف خودت را بساز.',
      ),
    ],
  };
}
