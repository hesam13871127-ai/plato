import '../../../../core/i18n/app_localizations.dart';

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
    'checkers': [
      TutorialStep(
        emoji: '⚫',
        titleEn: 'Move your men',
        titleFa: 'حرکت مهره‌ها',
        bodyEn: 'Men slide one dark square diagonally forward. Plan ahead — every move counts.',
        bodyFa: 'سربازها یک خانهٔ تیره به‌صورت مورب و فقط به جلو حرکت می‌کنند. با برنامه جلو برو.',
      ),
      TutorialStep(
        emoji: '🔥',
        titleEn: 'Jumps are mandatory',
        titleFa: 'پرش اجباری است',
        bodyEn: 'If a rival piece is jumpable you must take it — and chain every follow-up jump too!',
        bodyFa: 'اگر مهرهٔ حریف قابل پریدن باشد باید بپری — و همهٔ پرش‌های بعدی را هم پشت سر هم انجام دهی!',
      ),
      TutorialStep(
        emoji: '👑',
        titleEn: 'Crown your kings',
        titleFa: 'تاج پادشاهی',
        bodyEn: 'Reach the far row to get crowned. Kings command all four diagonal directions.',
        bodyFa: 'به ردیف آخر برسی پادشاه می‌شوی. پادشاه‌ها در هر چهار جهت مورب فرمان می‌رانند.',
      ),
      TutorialStep(
        emoji: '🏆',
        titleEn: 'Win the duel',
        titleFa: 'بردن دوئل',
        bodyEn: 'Capture every rival piece or trap them with no legal move left.',
        bodyFa: 'همهٔ مهره‌های حریف را بگیر یا طوری محاصره‌اش کن که حرکتی برایش نماند.',
      ),
    ],
    'chess': [
      TutorialStep(
        emoji: '♞',
        titleEn: 'Move with purpose',
        titleFa: 'با هدف حرکت کن',
        bodyEn: 'Every piece moves its own way — pawns forward, knights in L-shapes, bishops on diagonals, rooks on lines, the queen everywhere.',
        bodyFa: 'هر مهره راه خودش را دارد — سرباز به جلو، اسب به شکل L، فیل مورب، رخ در خطوط مستقیم و وزیر در همهٔ جهت‌ها.',
      ),
      TutorialStep(
        emoji: '👑',
        titleEn: 'Special moves',
        titleFa: 'حرکت‌های ویژه',
        bodyEn: 'Pawns double-step on their first move, capture en passant, and crown on the last rank. Castle early to tuck your king safe.',
        bodyFa: 'سرباز در اولین حرکت دو خانه می‌رود، آن‌پاسان می‌گیرد و در ردیف آخر تاج می‌گیرد. زود قلعه بزن تا شاه‌ات امن شود.',
      ),
      TutorialStep(
        emoji: '⚔️',
        titleEn: 'Check & checkmate',
        titleFa: 'کیش و مات',
        bodyEn: "Attack the enemy king to give check. When it can't escape, block or capture — that's checkmate and the game is yours.",
        bodyFa: 'به شاه حریف حمله کن تا کیش بزنی. اگر نتواند فرار کند، جلوی حمله را بگیرد یا مهاجم را بزند — کیش‌ومات است و بازی مال توست.',
      ),
      TutorialStep(
        emoji: '🤝',
        titleEn: 'Draws happen',
        titleFa: 'مساوی هم هست',
        bodyEn: 'Stalemate, three repetitions, fifty quiet moves or bare kings all end in a draw — sometimes a handshake is the win.',
        bodyFa: 'پات، تکرار سه‌بارهٔ موقعیت، پنجاه حرکت بی‌صدا یا شاه‌های تنها همه مساوی تمام می‌شوند — گاهی دست‌دادن بهترین برد است.',
      ),
    ],
    'pool': [
      TutorialStep(
        emoji: '🎱',
        titleEn: 'Smash the break',
        titleFa: 'شکستن پیک',
        bodyEn: 'Place the cue ball, drag on the felt to aim, charge the power slider and crack the rack open.',
        bodyFa: 'توپ سفید را بگذار، روی میز بکش تا نشانه بگیری، قدرت را تنظیم کن و پیک را با قدرت بشکن.',
      ),
      TutorialStep(
        emoji: '🎯',
        titleEn: 'Claim your colours',
        titleFa: 'رنگ خودت را بگیر',
        bodyEn: 'The first ball you legally sink assigns your group — solids or stripes. Keep potting yours to stay at the table.',
        bodyFa: 'اولین توپی که قانونی جا می‌زنی گروهت را مشخص می‌کند — تک‌رنگ یا راه‌راه. تا توپ‌های خودت را می‌اندازی، نوبتت ادامه دارد.',
      ),
      TutorialStep(
        emoji: '⚠️',
        titleEn: 'Watch the fouls',
        titleFa: 'مراقب خطاها باش',
        bodyEn: 'Potting the cue, hitting nothing or touching the wrong colour first gives your rival ball-in-hand.',
        bodyFa: 'افتادن توپ سفید، نخوردن هیچ توپی یا زدن رنگ حریف در اولین برخورد، توپ آزاد را به حریف می‌دهد.',
      ),
      TutorialStep(
        emoji: '🖤',
        titleEn: 'Crown the black',
        titleFa: 'تاج سیاه',
        bodyEn: 'Clear your whole group, then sink the 8-ball to win. Drop it early and the game is your rival’s!',
        bodyFa: 'همهٔ گروهت را خالی کن، بعد توپ ۸ را جا بزن تا ببری. اگر زودتر بیفتد، بازی مال حریف می‌شود!',
      ),
    ],
    'carrom': [
      TutorialStep(
        emoji: '🎯',
        titleEn: 'Baseline & flick',
        titleFa: 'خط پایه و شلیک',
        bodyEn: 'Each turn, place your striker anywhere on your baseline band, aim by dragging and flick with power.',
        bodyFa: 'هر نوبت، استرایکر را روی نوار خط پایهٔ خودت بگذار، با کشیدن نشانه بگیر و با قدرت بزن.',
      ),
      TutorialStep(
        emoji: '⚪',
        titleEn: 'Pot your nine',
        titleFa: 'نه‌تای خودت را بینداز',
        bodyEn: 'White versus black — every one of your men you pocket keeps you at the board for another flick.',
        bodyFa: 'سفید در برابر مشکی — تا مهرهٔ خودت را جا می‌زنی، سر میز می‌مانی و دوباره می‌زنی.',
      ),
      TutorialStep(
        emoji: '❤️',
        titleEn: 'Cover the queen',
        titleFa: 'ملکه را پوشش بده',
        bodyEn: 'The red queen is a bonus — pot her, then pot one of your men on the same or next stroke to keep her.',
        bodyFa: 'ملکهٔ قرمز امتیاز ویژه است — او را بینداز و در همان ضربه یا ضربهٔ بعدی یکی از مهره‌هایت را بینداز تا مال تو شود.',
      ),
      TutorialStep(
        emoji: '⚠️',
        titleEn: 'Striker sins',
        titleFa: 'خطای استرایکر',
        bodyEn: 'Pocketing the striker is a foul: one of your sunk men returns to the centre and the turn passes.',
        bodyFa: 'افتادن استرایکر در جیب خطاست: یکی از مهره‌های انداخته‌شدهٔ تو به مرکز برمی‌گردد و نوبت می‌گذرد.',
      ),
    ],
    'dots_and_boxes': [
      TutorialStep(
        emoji: '✏️',
        titleEn: 'Draw one line',
        titleFa: 'یک خط بکش',
        bodyEn: 'Take turns tapping the gap between two dots to draw one edge of a square.',
        bodyFa: 'نوبتی روی فاصلهٔ بین دو نقطه بزن تا یک ضلع از مربع کشیده شود.',
      ),
      TutorialStep(
        emoji: '🔹',
        titleEn: 'Close a square',
        titleFa: 'مربع را ببند',
        bodyEn: 'Draw the fourth side of a square to claim it — and immediately draw another line.',
        bodyFa: 'ضلع چهارم مربع را بکش تا آن مربع مال تو شود — و بلافاصله یک خط دیگر بکش.',
      ),
      TutorialStep(
        emoji: '⛓️',
        titleEn: 'Chain reactions',
        titleFa: 'واکنش زنجیره‌ای',
        bodyEn: 'Claimed squares chain: keep closing while you can, but watch what you hand over.',
        bodyFa: 'مربع‌ها زنجیره می‌شوند: تا می‌توانی ببند، اما مراقب باش چه چیزی به حریف می‌دهی.',
      ),
      TutorialStep(
        emoji: '🏆',
        titleEn: 'Most squares wins',
        titleFa: 'بیشترین مربع برنده',
        bodyEn: 'When the grid is full, the player with more of the 25 squares takes the win.',
        bodyFa: 'وقتی جدول پر شد، هرکس مربع‌های بیشتری از ۲۵ مربع دارد برنده است.',
      ),
    ],
    'bingo': [
      TutorialStep(
        emoji: '🎱',
        titleEn: 'Draw the balls',
        titleFa: 'توپ‌ها را بکش',
        bodyEn: 'Take turns drawing balls from the 75-ball cage — every card at the table dabs the number automatically.',
        bodyFa: 'نوبتی از قفس ۷۵ توپی بکش — کارت همهٔ بازیکنان آن شماره را خودکار می‌زنند.',
      ),
      TutorialStep(
        emoji: '📋',
        titleEn: 'Your private card',
        titleFa: 'کارت اختصاصی تو',
        bodyEn: 'Your 5×5 card hides a FREE star in the middle. Rival cards stay secret — only yours matters to you.',
        bodyFa: 'کارت ۵×۵ تو در وسط ستارهٔ آزاد دارد. کارت حریفان مخفی می‌ماند — فقط کارت خودت برایت مهم است.',
      ),
      TutorialStep(
        emoji: '✨',
        titleEn: 'Watch your lines',
        titleFa: 'خطوطت را زیر نظر بگیر',
        bodyEn: 'Rows, columns and diagonals all count. Get four dabbed in a line and hold your breath on the next ball.',
        bodyFa: 'ردیف، ستون و قطر همه حساب می‌شوند. چهار خانهٔ یک خط را زدی؟ نفس‌ات را برای توپ بعدی حبس کن.',
      ),
      TutorialStep(
        emoji: '🏆',
        titleEn: 'Shout BINGO!',
        titleFa: 'بگو بینگو!',
        bodyEn: 'Complete any line of five and the table shouts BINGO for you — first line wins the whole game.',
        bodyFa: 'هر خط پنج‌خانه‌ای را کامل کن تا میز برایت بینگو می‌گوید — اولین خط کل بازی را می‌برد.',
      ),
    ],
    'dice_party': [
      TutorialStep(
        emoji: '🎲',
        titleEn: 'Three rolls a turn',
        titleFa: 'سه پرتاب در هر نوبت',
        bodyEn: 'Roll all five dice, then re-roll up to twice more. Tap dice between rolls to hold them.',
        bodyFa: 'هر پنج تاس را بریز، بعد تا دو بار دیگر دوباره بینداز. بین پرتاب‌ها روی تاس‌ها بزن تا نگهشان داری.',
      ),
      TutorialStep(
        emoji: '🔒',
        titleEn: 'Hold your luck',
        titleFa: 'شانست را قفل کن',
        bodyEn: 'Held dice glow and stay put. Chase triples, straights or that legendary five-of-a-kind.',
        bodyFa: 'تاس‌های نگه‌داشته‌شده می‌درخشند و سر جایشان می‌مانند. دنبال سه‌تایی، رام یا همان افسانه‌ای پنج‌تایی برو.',
      ),
      TutorialStep(
        emoji: '📊',
        titleEn: 'Bank a category',
        titleFa: 'دسته‌ای را بانک کن',
        bodyEn: 'Every turn ends by banking your roll into one of fifteen categories — each can be used exactly once.',
        bodyFa: 'هر نوبت با بانک‌کردن پرتابت در یکی از پانزده دسته تمام می‌شود — هر دسته فقط یک بار قابل استفاده است.',
      ),
      TutorialStep(
        emoji: '🏆',
        titleEn: 'Bonus & Yatzy',
        titleFa: 'بونوس و یاتزی',
        bodyEn: 'Score 63+ across ones to sixes for a +50 bonus, and five matching dice bank a mighty Yatzy: 50 points!',
        bodyFa: 'در جمع ۱ها تا ۶ها به ۶۳+ برسی ۵۰ امتیاز بونوس می‌گیری و پنج تاس یکسان یعنی یاتزی: ۵۰ امتیاز!',
      ),
    ],
    'backgammon': [
      TutorialStep(
        emoji: '🎲',
        titleEn: 'Race the dice',
        titleFa: 'مسابقه با تاس',
        bodyEn: 'White runs clockwise, black runs back. Roll two dice and move checkers exactly by those pips.',
        bodyFa: 'سفید در جهت عقربه‌ها می‌رود و سیاه برعکس. دو تاس بریز و مهره‌ها را دقیقاً به اندازهٔ آن خانه‌ها جابه‌جا کن.',
      ),
      TutorialStep(
        emoji: '🎯',
        titleEn: 'Block and hit',
        titleFa: 'مسدود کن و بزن',
        bodyEn: 'Land on a lone enemy to send it to the bar. Two or more checkers on a point make it a wall.',
        bodyFa: 'روی مهرهٔ تنهأ حریف فرود بیا تا به بار پرتاب شود. دو مهره یا بیشتر روی یک خانه، دیوار می‌سازند.',
      ),
      TutorialStep(
        emoji: '🚪',
        titleEn: 'Enter from the bar',
        titleFa: 'ورود از بار',
        bodyEn: 'Checkers on the bar must re-enter in the enemy home board before anything else may move.',
        bodyFa: 'مهره‌های روی بار باید اول در خانهٔ حریف وارد زمین شوند، بعد بقیهٔ مهره‌ها حق حرکت دارند.',
      ),
      TutorialStep(
        emoji: '🏁',
        titleEn: 'Bear off to win',
        titleFa: 'تخلیه کن و ببر',
        bodyEn: 'Gather all fifteen checkers in your home board, then bear them off. First to clear everything wins — gammons score double!',
        bodyFa: 'هر پانزده مهره را در خانهٔ خودت جمع کن و بعد تخلیه‌شان کن. اولین تخلیه‌کننده برنده است — گامون دو برابر امتیاز دارد!',
      ),
    ],
    'mancala': [
      TutorialStep(
        emoji: '🫘',
        titleEn: 'Sow your seeds',
        titleFa: 'دانه‌ها را بکار',
        bodyEn: 'Tap one of your six pits to sow its seeds counter-clockwise, one per cup.',
        bodyFa: 'روی یکی از شش گودی خودت بزن تا دانه‌هایش پادساعتگرد کاشته شوند، در هر حفره یکی.',
      ),
      TutorialStep(
        emoji: '⭐',
        titleEn: 'Free turns',
        titleFa: 'نوبت اضافه',
        bodyEn: 'If the last seed lands in your store you immediately sow again.',
        bodyFa: 'اگر آخرین دانه در انبار خودت بیفتد، بلافاصله یک‌بار دیگر می‌کاری.',
      ),
      TutorialStep(
        emoji: '🎯',
        titleEn: 'Captures',
        titleFa: 'غنیمت',
        bodyEn: 'End with the last seed in your own empty pit to capture it plus everything in the pit opposite.',
        bodyFa: 'آخرین دانه را در گودی خالی خودت فرود بیاور تا آن دانه و همهٔ دانه‌های روبه‌رو را غنیمت بگیری.',
      ),
      TutorialStep(
        emoji: '🏆',
        titleEn: 'Hoard to win',
        titleFa: 'انبار کن و ببر',
        bodyEn: 'When either side runs empty, both sweep their leftovers. The bigger store takes the game!',
        bodyFa: 'وقتی یک سمت خالی شود، هر دو باقی‌ماندهٔ خود را جمع می‌کنند. انبار بزرگ‌تر برنده است!',
      ),
    ],
    'bowling': [
      TutorialStep(
        emoji: '🎳',
        titleEn: 'Line it up',
        titleFa: 'کج را بگیر',
        bodyEn: 'Drag across the lane to aim your approach, then set the power slider and roll.',
        bodyFa: 'روی لِین بکش تا نشانه‌گیری کنی، بعد قدرت را تنظیم کن و توپ را رها کن.',
      ),
      TutorialStep(
        emoji: '🎯',
        titleEn: 'Find the pocket',
        titleFa: 'جا را پیدا کن',
        bodyEn: 'The pocket just beside the head pin scatters the rack — dead centre often leaves corners.',
        bodyFa: 'جای کنارِ پین اول رَک را پراکنده می‌کند — مرکزِ دقیق معمولاً گوشه‌ها را جا می‌گذارد.',
      ),
      TutorialStep(
        emoji: '♻️',
        titleEn: 'Two balls a frame',
        titleFa: 'دو توپ در هر فریم',
        bodyEn: 'Knocked pins stay down for your second ball. Clear all ten on the first for a strike!',
        bodyFa: 'پین‌های افتاده برای توپ دوم هم افتاده می‌مانند. اگر با توپ اول هر ده را بیندازی، استرایک است!',
      ),
      TutorialStep(
        emoji: '🏆',
        titleEn: 'Score like the pros',
        titleFa: 'حرفه‌ای امتیاز بگیر',
        bodyEn: 'Strikes earn the next two balls as bonus, spares the next one — twelve strikes make a perfect 300.',
        bodyFa: 'استرایک دو توپ بعدی را بونوس می‌گیرد و اسپیر یکی را — دوازده استرایک یعنی امتیاز کامل ۳۰۰!',
      ),
    ],
    'sketch': [
      TutorialStep(
        emoji: '✏️',
        titleEn: 'Your word, your brush',
        titleFa: 'کلمهٔ تو، قلم‌مو تو',
        bodyEn: 'Each round one player becomes the artist and gets a secret word to paint on the shared canvas.',
        bodyFa: 'در هر دور یکی از بازیکن‌ها نقاش می‌شود و یک کلمهٔ مخفی می‌گیرد که روی بوم مشترک نقاشی‌اش کند.',
      ),
      TutorialStep(
        emoji: '🎨',
        titleEn: 'Four colours, no letters',
        titleFa: 'چهار رنگ، بدون حرف',
        bodyEn: 'Paint with four colours — but no writing letters or numbers. Let the picture do the talking.',
        bodyFa: 'با چهار رنگ نقاشی کن — ولی نوشتن حروف و اعداد ممنوع. بگذار تصویر حرف بزند.',
      ),
      TutorialStep(
        emoji: '💬',
        titleEn: 'Guessers strike',
        titleFa: 'حدس‌زن‌ها می‌کوبند',
        bodyEn: 'Once the brush goes down the table guesses in turns — two misses and you are out for the round.',
        bodyFa: 'به محض پایان نقاشی، میز نوبتی حدس می‌زند — دو خطا و تا پایان دور کنار می‌روی.',
      ),
      TutorialStep(
        emoji: '🏆',
        titleEn: 'Points for both sides',
        titleFa: 'امتیاز برای هر دو طرف',
        bodyEn: 'A correct guess banks ten for the guesser and five for the artist. Everyone takes the brush before the gallery closes.',
        bodyFa: 'حدس درست ده امتیاز برای حدس‌زننده و پنج امتیاز برای نقاش دارد. همه قبل از بسته‌شدن گالری قلم‌مو به دست می‌گیرند.',
      ),
    ],
    'werewolf': [
      TutorialStep(
        emoji: '🐺',
        titleEn: 'Secret roles',
        titleFa: 'نقش‌های مخفی',
        bodyEn: 'Five to eight players, hidden cards: werewolves hunt, one seer sees the truth, the rest are villagers.',
        bodyFa: 'پنج تا هشت بازیکن با کارت‌های مخفی: گرگ‌ها شکار می‌کنند، یک فالگیر حقیقت را می‌بیند و بقیه روستایی‌اند.',
      ),
      TutorialStep(
        emoji: '🌙',
        titleEn: 'Night falls',
        titleFa: 'شب می‌شود',
        bodyEn: 'Each night the wolves quietly choose a victim and the seer peers into one soul. Nobody else wakes.',
        bodyFa: 'هر شب گرگ‌ها بی‌صدا قربانی را انتخاب می‌کنند و فالگیر به یک روح نگاه می‌کند. هیچ‌کس دیگر بیدار نمی‌شود.',
      ),
      TutorialStep(
        emoji: '☀️',
        titleEn: 'Day and the vote',
        titleFa: 'روز و رأی‌گیری',
        bodyEn: 'At dawn the village mourns, argues and votes one suspect out. Ties spare everyone.',
        bodyFa: 'هنگام سحر روستا عزاداری می‌کند، بحث می‌کند و یک مظنون را رأی به اخراج می‌دهد. تساوی یعنی هیچ‌کس اخراج نمی‌شود.',
      ),
      TutorialStep(
        emoji: '🏆',
        titleEn: 'Two ways to win',
        titleFa: 'دو راه بردن',
        bodyEn: 'The village wins by banishing every wolf; the wolves win the moment they match the survivors.',
        bodyFa: 'روستا با اخراج همهٔ گرگ‌ها می‌برد؛ گرگ‌ها به محض رسیدن به تعداد بازماندگان برنده می‌شوند.',
      ),
    ],
    'darts': [
      TutorialStep(
        emoji: '🎯',
        titleEn: 'The clock board',
        titleFa: 'صفحهٔ ساعت',
        bodyEn: 'Twenty numbered segments, doubles on the outer ring, trebles in the middle band, red bull for fifty.',
        bodyFa: 'بیست خانهٔ شماره‌دار، دابل روی حلقهٔ بیرونی، تریبل در نوار میانی و گاوهٔ قرمز پنجاه امتیاز.',
      ),
      TutorialStep(
        emoji: '👆',
        titleEn: 'Aim and throw',
        titleFa: 'نشانه بگیر و پرتاب کن',
        bodyEn: 'Tap the board to aim, choose your power, and throw. Soft arms drop the dart low.',
        bodyFa: 'روی صفحه بزن تا نشانه بگیری، قدرت را انتخاب کن و پرتاب کن. بازوی ضعیف دارت را پایین می‌اندازد.',
      ),
      TutorialStep(
        emoji: '🪶',
        titleEn: 'Three a visit',
        titleFa: 'سه‌تا در هر نوبت',
        bodyEn: 'You throw three darts per visit, five visits each. Watch your darts stick where they land.',
        bodyFa: 'در هر نوبت سه دارت پرتاب می‌کنی، پنج نوبت برای هر نفر. دارت‌هایت همان‌جا می‌چسبند که فرود بیایند.',
      ),
      TutorialStep(
        emoji: '🏆',
        titleEn: 'Game shot',
        titleFa: 'شاتِ پایانی',
        bodyEn: 'After fifteen darts the highest total wins — hunt the treble twenty and the bullseye.',
        bodyFa: 'بعد از پانزده دارت، بیشترین امتیاز برنده است — تریبلِ بیست و گاوه را شکار کن.',
      ),
    ],
    'minigolf': [
      TutorialStep(
        emoji: '⛳',
        titleEn: 'Nine tiny holes',
        titleFa: 'نه حفرهٔ کوچک',
        bodyEn: 'Each hole is a compact green with walls, blocks and one flag. Fewest strokes over nine holes wins.',
        bodyFa: 'هر حفره یک چمن کوچک با دیواره، مانع و یک پرچم است. کمترین ضربه در نه حفره برنده است.',
      ),
      TutorialStep(
        emoji: '👆',
        titleEn: 'Aim and roll',
        titleFa: 'نشانه بگیر و بغلتان',
        bodyEn: 'Tap ahead of the ball to set your line, choose the power, and stroke. Watch the roll replay.',
        bodyFa: 'جلوی توپ بزن تا خط ضربه را بچینی، قدرت را انتخاب کن و بزن. مسیر غلتیدن را تماشا کن.',
      ),
      TutorialStep(
        emoji: '🧱',
        titleEn: 'Use the banks',
        titleFa: 'از دیوارها استفاده کن',
        bodyEn: 'Walls and blocks bounce the ball — bank around obstacles when the direct line is blocked.',
        bodyFa: 'دیوارها و مانع‌ها توپ را برمی‌گردانند — وقتی مسیر مستقیم بسته است از کنارشان بگذر.',
      ),
      TutorialStep(
        emoji: '⏳',
        titleEn: 'Six and out',
        titleFa: 'شش ضربه و تمام',
        bodyEn: 'Six strokes cap a hole — the seventh is charged automatically, so play the safe line first.',
        bodyFa: 'شش ضربه سقف هر حفره است — هفتمی خودکار حساب می‌شود، پس اول خط مطمئن را بازی کن.',
      ),
    ],
    'bankroll': [
      TutorialStep(
        emoji: '🏙️',
        titleEn: 'Buy the board',
        titleFa: 'خرید شهر',
        bodyEn: 'Roll the dice and lap the board collecting your salary. Land on an unowned district and buy it before anyone else does.',
        bodyFa: 'تاس بریز، دور شهر بچرخ و حقوق بگیر. روی منطقه‌ای فرود آمدی که مال کسی نیست، زودتر از بقیه بخرش.',
      ),
      TutorialStep(
        emoji: '💰',
        titleEn: 'Charge rent',
        titleFa: 'اجاره بگیر',
        bodyEn: 'Rivals who land on your districts pay you rent — double when you own a whole colour group. Taxes and Chance tiles keep it spicy.',
        bodyFa: 'حریف‌ها که روی منطقه‌های تو فرود بیایند اجاره می‌دهند — اگر یک گروه رنگی کامل داشته باشی اجاره دوبرابر است.',
      ),
      TutorialStep(
        emoji: '🏆',
        titleEn: 'Hit the goal',
        titleFa: 'به هدف برس',
        bodyEn: 'Net worth = cash + districts. First player to reach 3000 wins — or be the last one standing when the rest go bankrupt.',
        bodyFa: 'دارایی خالص = پول نقد + منطقه‌ها. اولین نفری که به ۳۰۰۰ برسد برنده است — یا آخرین نفر سالم بمان.',
      ),
    ],
    'battleship': [
      TutorialStep(
        emoji: '🚢',
        titleEn: 'Deploy your fleet',
        titleFa: 'ناوگانت را مستقر کن',
        bodyEn: 'Hide your five ships — carrier, battleship, cruiser, submarine and destroyer — on your ten-by-ten grid.',
        bodyFa: 'پنج کشتی — هواپیمابر، رزم‌ناو، رزمناو، زیردریایی و ناوشکن — را در گرید ده‌در دهٔ خودت پنهان کن.',
      ),
      TutorialStep(
        emoji: '🎯',
        titleEn: 'Trade salvos',
        titleFa: 'آتشبار رد و بدل کن',
        bodyEn: 'Call a cell each turn: hit or miss, the turn passes. You learn a ship has drowned only when she goes down.',
        bodyFa: 'هر نوبت یک خانه را نشانه برو: hit یا miss، نوبت رد می‌شود. نام کشتی فقط وقت غرق شدن لو می‌رود.',
      ),
      TutorialStep(
        emoji: '🧠',
        titleEn: 'Hunt in patterns',
        titleFa: 'الگویی شکار کن',
        bodyEn: 'Search in checkerboard lanes — every ship crosses them — then finish off a wounded hull along its line.',
        bodyFa: 'به صورت شطرنجی جست‌وجو کن — هر کشتی از آن می‌گذرد — بعد بدنهٔ زخمی را در امتداد خطش تمام کن.',
      ),
      TutorialStep(
        emoji: '⚓',
        titleEn: 'Rule the waves',
        titleFa: 'فرمانروای دریا شو',
        bodyEn: 'First admiral to sink all seventeen enemy cells wins the duel. Your fleet stays hidden from the enemy view.',
        bodyFa: 'اولین دریاسالاری که هر هفده‌خانهٔ دشمن را غرق کند برنده است. ناوگان خودت از دید حریف مخفی می‌ماند.',
      ),
    ],
    'reversi': [
      TutorialStep(
        emoji: '⚫',
        titleEn: 'The sandwich rule',
        titleFa: 'قانون ساندویچ',
        bodyEn: 'Place a disc so a straight line of enemy discs is caught between your new disc and one of yours — the whole line flips.',
        bodyFa: 'مهره‌ای بگذار که یک خط مستقیم از مهره‌های حریف بین مهرهٔ جدید تو و یکی از مهره‌هایت گیر کند — کل خط برمی‌گردد.',
      ),
      TutorialStep(
        emoji: '✨',
        titleEn: 'Every move must flip',
        titleFa: 'هر حرکت باید برگرداند',
        bodyEn: 'A placement that flips nothing is illegal. If you have no flipping square at all, your turn passes automatically.',
        bodyFa: 'گذراشتن مهره‌ای که چیزی برنمی‌گرداند غیرمجاز است. اگر اصلاً خانهٔ برگردانی نداشته باشی، نوبتت خودکار رد می‌شود.',
      ),
      TutorialStep(
        emoji: '🏆',
        titleEn: 'Corners are gold',
        titleFa: 'گوشه‌ها طلا هستند',
        bodyEn: 'Corners can never be flipped and edges are hard to attack — grab them, and avoid handing your opponent one.',
        bodyFa: 'گوشه‌ها هرگز برنمی‌گردند و حمله به لبه‌ها سخت است — آن‌ها را بگیر و مواظب باش گوشه‌ای به حریف ندهی.',
      ),
      TutorialStep(
        emoji: '📊',
        titleEn: 'Majority rules',
        titleFa: 'اکثریت حکم می‌راند',
        bodyEn: 'When neither side can move (or the board fills), the colour with more discs wins. Big flips early can mean big losses late.',
        bodyFa: 'وقتی هیچ‌کس نتواند حرکت کند (یا صفحه پر شود)، رنگِ دارای مهرهٔ بیشتر برنده است. برگرداندن‌های بزرگ اوایل بازی ممکن است یعنی باخت‌های بزرگ آخرش.',
      ),
    ],
    'minesweepers': [
      TutorialStep(
        emoji: '💣',
        titleEn: 'One shared field',
        titleFa: 'یک میدان مشترک',
        bodyEn: 'Everyone digs into the same minefield, one reveal per turn. Numbers show how many mines touch that cell.',
        bodyFa: 'همه در یک میدان مین‌گذاری‌شده می‌کَنند، هر نوبت یک خانه. عدد هر خانه یعنی چند مین به آن چسبیده.',
      ),
      TutorialStep(
        emoji: '🪙',
        titleEn: 'Points per cell',
        titleFa: 'امتیاز برای هر خانه',
        bodyEn: 'Every safe cell you clear scores a point — opening a 0 cell floods a whole pocket open at once.',
        bodyFa: 'هر خانه‌ی امن یک امتیاز — باز کردن خانه‌ی صفر یک ناحیه‌ی کامل را یک‌جا باز می‌کند.',
      ),
      TutorialStep(
        emoji: '💥',
        titleEn: 'Do not blow up',
        titleFa: 'منفجر نشو',
        bodyEn: 'Dig a mine and you are out of the round with your score locked. Last player standing — or the top score on a cleared field — wins.',
        bodyFa: 'روی مین بروی از دور خارج می‌شوی. آخرین نفر سالم یا بالاترین امتیاز برنده است.',
      ),
    ],

    'gofish': [
      TutorialStep(
        emoji: '🎣',
        titleEn: 'Ask around',
        titleFa: 'سؤال بپرس',
        bodyEn: 'Ask one player for a rank you already hold. If they have any, they hand over every card of it — and you ask again.',
        bodyFa: 'از یک بازیکن آن رقمی را بخواه که خودت داری. اگر داشته باشد همه‌ی آن کارت‌ها را می‌دهد و دوباره می‌پرسی.',
      ),
      TutorialStep(
        emoji: '🌊',
        titleEn: 'Go fish',
        titleFa: 'برو ماهیگیری',
        bodyEn: 'Told to go fish? Draw from the pond. Pull the exact rank you asked for and the turn stays yours.',
        bodyFa: 'گفتند برو ماهیگیری؟ از برکه کارت بکش. همان رقمی که خواستی بیاید، نوبت دستت می‌ماند.',
      ),
      TutorialStep(
        emoji: '📚',
        titleEn: 'Collect books',
        titleFa: 'کتاب جمع کن',
        bodyEn: 'Four of a kind makes a book and scores a point. Most books when the last one lands wins the table.',
        bodyFa: 'چهار کارت هم‌ارزش یک کتاب و یک امتیاز است. بیشترین کتاب در پایان برنده است.',
      ),
    ],

    'poker': [
      TutorialStep(
        emoji: '🃏',
        titleEn: 'The hand',
        titleFa: 'دست بازی',
        bodyEn: 'Two hole cards for you, five community cards for everyone. The best five-card hand takes the pot — fold what you cannot defend.',
        bodyFa: 'دو کارت برای تو، پنج کارت مشترک برای همه. بهترین پنج‌کارت برنده‌ی دیگ است — دست ضعیف را بریز.',
      ),
      TutorialStep(
        emoji: '🎯',
        titleEn: 'Bet smart',
        titleFa: 'هوشمندانه شرط ببند',
        bodyEn: 'Check, call, raise or shove — no limit. Watch the pot odds and keep every bet believable.',
        bodyFa: 'پاس، کال، رایز یا آل-این — بدون محدودیت. به نسبت پات نگاه کن و شرط‌های باورپذیر بده.',
      ),
      TutorialStep(
        emoji: '💎',
        titleEn: 'Take every chip',
        titleFa: 'همه‌ی سکه‌ها مال تو',
        bodyEn: 'Win hands, bust your opponents and hold every chip on the table to take the match.',
        bodyFa: 'دست‌ها را ببر، حریف‌ها را حذف کن و همه‌ی سکه‌های میز را جمع کن تا برنده‌ی بازی شوی.',
      ),
    ],
  };
}
