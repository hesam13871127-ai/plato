import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Parsed dice party view — dice, holds, rolls and every seat's scorecard.
class _DiceView {
  _DiceView(Map<String, dynamic> b)
      : dice = _nums(b['dice']),
        held = ((b['held'] as List?) ?? const []).map((h) => h == true).toList(),
        rollsUsed = (b['rollsUsed'] as num?)?.toInt() ?? 0,
        scores = _scorecard(b['scores']),
        lastScore = _lastScore(b['lastScore']);

  final List<int> dice;
  final List<bool> held;
  final int rollsUsed;
  final List<List<int>> scores; // per seat × 15 (-1 unused)
  final _LastScore? lastScore;

  static List<int> _nums(Object? raw) =>
      ((raw as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();

  static List<List<int>> _scorecard(Object? raw) => ((raw as List?) ?? const [])
      .whereType<List>()
      .map((row) => row.whereType<num>().map((n) => n.toInt()).toList())
      .toList();

  static _LastScore? _lastScore(Object? raw) {
    final m = raw as Map?;
    if (m == null) return null;
    return _LastScore(
      (m['seat'] as num?)?.toInt() ?? 0,
      (m['category'] as String?) ?? '',
      (m['points'] as num?)?.toInt() ?? 0,
    );
  }

  int totalFor(int seat) {
    if (seat >= scores.length) return 0;
    final row = scores[seat];
    final upper = row.take(6).fold(0, (a, b) => a + (b > 0 ? b : 0));
    final bonus = upper >= 63 ? 50 : 0;
    return row.fold(0, (a, b) => a + (b > 0 ? b : 0)) + bonus;
  }

  int upperFor(int seat) {
    if (seat >= scores.length) return 0;
    return scores[seat].take(6).fold(0, (a, b) => a + (b > 0 ? b : 0));
  }
}

class _LastScore {
  const _LastScore(this.seat, this.category, this.points);
  final int seat;
  final String category;
  final int points;
}

const _cats = [
  ('ones', 'Ones', '۱ها'),
  ('twos', 'Twos', '۲ها'),
  ('threes', 'Threes', '۳ها'),
  ('fours', 'Fours', '۴ها'),
  ('fives', 'Fives', '۵ها'),
  ('sixes', 'Sixes', '۶ها'),
  ('pair', 'One Pair', 'یک جفت'),
  ('two_pairs', 'Two Pairs', 'دو جفت'),
  ('three_kind', 'Three of a Kind', 'سه‌تایی'),
  ('four_kind', 'Four of a Kind', 'چهارتایی'),
  ('small_straight', 'Small Straight', 'رام کوچک'),
  ('large_straight', 'Large Straight', 'رام بزرگ'),
  ('full_house', 'Full House', 'فول‌هاوس'),
  ('chance', 'Chance', 'شانس'),
  ('yatzy', 'YATZY', 'یاتزی'),
];

/// Dice Party (Yatzy), wave-3 3D board.
///
/// Five glossy dice you tap to hold (a cyan lift + lock ring), a ROLL button
/// with the remaining rolls, and the fifteen-category scorecard: unused tiles
/// preview live points from the current dice, used ones show your banked
/// score. Seat totals (with the +63 upper bonus) sit in the header trays.
class DiceBoard extends StatefulWidget {
  const DiceBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<DiceBoard> createState() => _DiceBoardState();
}

class _DiceBoardState extends State<DiceBoard> {
  String _skin = 'wood';

  _DiceView get _view => _DiceView(widget.session.board);

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  static const _pipLayouts = <int, List<List<int>>>{
    1: [
      [0, 0],
    ],
    2: [
      [-1, -1],
      [1, 1],
    ],
    3: [
      [-1, -1],
      [0, 0],
      [1, 1],
    ],
    4: [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ],
    5: [
      [-1, -1],
      [1, -1],
      [0, 0],
      [-1, 1],
      [1, 1],
    ],
    6: [
      [-1, -1],
      [1, -1],
      [-1, 0],
      [1, 0],
      [-1, 1],
      [1, 1],
    ],
  };

  Future<void> _roll() async {
    if (!_myTurn || _view.rollsUsed >= 3) return;
    GameFeedback.tap();
    await widget.onAction('roll', {});
  }

  void _toggleHold(int i) {
    if (!_myTurn || _view.rollsUsed == 0 || _view.rollsUsed >= 3) return;
    final held = List<bool>.from(_view.held);
    while (held.length < 5) {
      held.add(false);
    }
    held[i] = !held[i];
    GameFeedback.tap();
    widget.onAction('hold', {
      'dice': [for (var j = 0; j < 5; j++) if (held[j]) j],
    });
  }

  Future<void> _score(int catIndex) async {
    if (!_myTurn) return;
    final myScores = _view.scores.length > widget.mySeat ? _view.scores[widget.mySeat] : const <int>[];
    if (catIndex >= myScores.length || myScores[catIndex] != -1) {
      GameFeedback.error();
      return;
    }
    GameFeedback.move();
    await widget.onAction('score', {'category': _cats[catIndex].$1});
  }

  @override
  Widget build(BuildContext context) {
    final view = _view;
    final skin = BoardSkin.byId(_skin);

    return Column(
      children: [
        TurnIndicator(
          text: _statusText(view),
          highlight: _myTurn,
          icon: Icons.casino_rounded,
        ),
        const SizedBox(height: 8),
        BoardSkinRow(
          selected: _skin,
          onPick: (id) {
            GameFeedback.tap();
            setState(() => _skin = id);
          },
        ),
        const SizedBox(height: 10),
        TableSurface(
          skin: skin,
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  for (var seat = 0; seat < view.scores.length; seat++)
                    _Tray(
                      label: _seatLabel(seat),
                      total: view.totalFor(seat),
                      mine: seat == widget.mySeat,
                    ),
                ],
              ),
              const SizedBox(height: 10),
              _diceRow(view),
              const SizedBox(height: 12),
              _scorecard(view),
            ],
          ),
        ),
      ],
    );
  }

  Widget _diceRow(_DiceView view) {
    final canRoll = _myTurn && view.rollsUsed < 3;
    return Row(
      children: [
        for (var i = 0; i < 5; i++)
          Expanded(
            child: GestureDetector(
              onTap: () => _toggleHold(i),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 3),
                child: _DieFace(
                  value: i < view.dice.length ? view.dice[i] : 1,
                  held: i < view.held.length && view.held[i],
                  pips: _pipLayouts,
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _scorecard(_DiceView view) {
    final myScores = view.scores.length > widget.mySeat ? view.scores[widget.mySeat] : const <int>[];
    final canRoll = _myTurn && view.rollsUsed < 3;
    return Column(
      children: [
        Row(
          children: [
            const SizedBox(width: 4),
            Text(
              'SCORECARD · upper ${view.upperFor(widget.mySeat)}/63',
              style: const TextStyle(
                color: AppColors.textSecondary,
                fontSize: 10,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.7,
              ),
            ),
            const Spacer(),
            if (view.lastScore != null)
              Text(
                'last: ${view.lastScore!.category} +${view.lastScore!.points}',
                style: const TextStyle(color: AppColors.softCyan, fontSize: 10, fontWeight: FontWeight.w700),
              ),
            const SizedBox(width: 4),
          ],
        ),
        const SizedBox(height: 6),
        for (var row = 0; row < 5; row++)
          Row(
            children: [
              for (var col = 0; col < 3; col++)
                Expanded(child: _catTile(view, myScores, row * 3 + col)),
            ],
          ),
        const SizedBox(height: 12),
        ElevatedButton(
          onPressed: canRoll ? _roll : null,
          style: ElevatedButton.styleFrom(
            backgroundColor: canRoll ? AppColors.electricPurple : Colors.white.withValues(alpha: 0.08),
            foregroundColor: Colors.white,
            disabledForegroundColor: Colors.white38,
            padding: const EdgeInsets.symmetric(vertical: 13),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            elevation: canRoll ? 6 : 0,
          ),
          child: Text(
            canRoll ? 'ROLL (${3 - view.rollsUsed} left)' : 'BANK A CATEGORY ABOVE',
            style: const TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1.1, fontSize: 13.5),
          ),
        ),
      ],
    );
  }

  Widget _catTile(_DiceView view, List<int> myScores, int idx) {
    final cat = _cats[idx];
    final used = idx < myScores.length && myScores[idx] != -1;
    final banked = idx < myScores.length ? myScores[idx] : -1;
    final preview = used ? 0 : _scoreCat(view.dice, cat.$1);
    final canTap = _myTurn && !used;

    return GestureDetector(
      onTap: () => _score(idx),
      child: Container(
        margin: const EdgeInsets.all(2.2),
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
        decoration: BoxDecoration(
          color: used
              ? AppColors.electricPurple.withValues(alpha: 0.28)
              : canTap && preview > 0
                  ? AppColors.softCyan.withValues(alpha: 0.14)
                  : Colors.white.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(9),
          border: Border.all(
            color: used
                ? Colors.white.withValues(alpha: 0.10)
                : canTap && preview > 0
                    ? AppColors.softCyan.withValues(alpha: 0.55)
                    : Colors.white.withValues(alpha: 0.08),
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Flexible(
              child: Text(
                cat.$2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: used ? Colors.white38 : Colors.white.withValues(alpha: 0.85),
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            const SizedBox(width: 4),
            Text(
              used ? '$banked' : (preview > 0 ? '+$preview' : '·'),
              style: TextStyle(
                color: used
                    ? Colors.white54
                    : preview > 0
                        ? AppColors.softCyan
                        : Colors.white24,
                fontSize: 12.5,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Client-side Yatzy mirror of the engine scoring.
  int _scoreCat(List<int> dice, String cat) {
    final counts = List<int>.filled(7, 0);
    var sum = 0;
    for (final d in dice) {
      if (d < 1 || d > 6) continue;
      counts[d] += 1;
      sum += d;
    }
    final upper = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'].indexOf(cat);
    if (upper != -1) return counts[upper + 1] * (upper + 1);
    switch (cat) {
      case 'pair':
        for (var v = 6; v >= 1; v--) {
          if (counts[v] >= 2) return v * 2;
        }
        return 0;
      case 'two_pairs':
        final pairs = <int>[];
        for (var v = 6; v >= 1 && pairs.length < 2; v--) {
          if (counts[v] >= 2) pairs.add(v);
        }
        return pairs.length == 2 ? pairs[0] * 2 + pairs[1] * 2 : 0;
      case 'three_kind':
        for (var v = 6; v >= 1; v--) {
          if (counts[v] >= 3) return v * 3;
        }
        return 0;
      case 'four_kind':
        for (var v = 6; v >= 1; v--) {
          if (counts[v] >= 4) return v * 4;
        }
        return 0;
      case 'small_straight':
        return [1, 2, 3, 4, 5].every((v) => counts[v] > 0) ? 15 : 0;
      case 'large_straight':
        return [2, 3, 4, 5, 6].every((v) => counts[v] > 0) ? 20 : 0;
      case 'full_house':
        var tri = 0;
        var pair = 0;
        for (var v = 1; v <= 6; v++) {
          if (counts[v] == 3) tri = v;
          if (counts[v] == 2) pair = v;
        }
        return tri > 0 && pair > 0 ? tri * 3 + pair * 2 : 0;
      case 'chance':
        return sum;
      case 'yatzy':
        for (var v = 1; v <= 6; v++) {
          if (counts[v] == 5) return 50;
        }
        return 0;
    }
    return 0;
  }

  String _statusText(_DiceView view) {
    if (!widget.session.isInProgress) {
      return 'Final scores — ${view.scores.asMap().entries.map((e) => '${e.key + 1}: ${view.totalFor(e.key)}').join(' · ')}';
    }
    if (!_myTurn) return 'Waiting for the table…';
    if (view.rollsUsed == 0) return 'Your turn — roll the dice!';
    if (view.rollsUsed >= 3) return 'Bank a category from the scorecard';
    return view.held.any((h) => h)
        ? 'Hold more dice or roll again'
        : 'Tap dice to hold, roll again, or bank a category';
  }

  String _seatLabel(int seat) {
    if (seat >= widget.session.seats.length) return 'Seat ${seat + 1}';
    return seat == widget.mySeat ? 'You' : widget.session.seats[seat].displayName;
  }
}

// ── widgets ─────────────────────────────────────────────────────────────────

class _Tray extends StatelessWidget {
  const _Tray({required this.label, required this.total, required this.mine});

  final String label;
  final int total;
  final bool mine;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: TextStyle(
            color: mine ? AppColors.softCyan : AppColors.textSecondary,
            fontSize: 11,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(width: 4),
        Text(
          '$total',
          style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w900),
        ),
      ],
    );
  }
}

/// A glossy 3D die with carved pips; held dice lift and glow cyan.
class _DieFace extends StatelessWidget {
  const _DieFace({required this.value, required this.held, required this.pips});

  final int value;
  final bool held;
  final Map<int, List<List<int>>> pips;

  @override
  Widget build(BuildContext context) {
    final layout = pips[value] ?? const <List<int>>[];
    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      height: 58,
      transform: Matrix4.translationValues(0, held ? -5 : 0, 0),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: held
              ? const [Color(0xFFDDF6FF), Color(0xFF9FF4FF), Color(0xFF57C8E8)]
              : const [Color(0xFFFDFBF4), Color(0xFFEFEBE0), Color(0xFFCFC9BA)],
        ),
        border: Border.all(
          color: held ? AppColors.softCyan : Colors.white.withValues(alpha: 0.55),
          width: held ? 2 : 1,
        ),
        boxShadow: [
          BoxShadow(
            color: held ? AppColors.softCyan.withValues(alpha: 0.55) : Colors.black.withValues(alpha: 0.4),
            blurRadius: held ? 14 : 6,
            offset: Offset(0, held ? 6 : 3),
          ),
        ],
      ),
      child: Stack(
        children: [
          for (final pos in layout)
            Align(
              alignment: Alignment(pos[0] * 0.62, pos[1] * 0.62),
              child: Container(
                width: 9,
                height: 9,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    center: const Alignment(-0.3, -0.3),
                    colors: [const Color(0xFF4A5568), const Color(0xFF161C28)],
                  ),
                  boxShadow: const [
                    BoxShadow(color: Colors.white24, blurRadius: 1, offset: Offset(0.5, 0.5)),
                  ],
                ),
              ),
            ),
          if (held)
            const Positioned(
              top: 3,
              right: 3,
              child: Icon(Icons.lock_rounded, size: 11, color: Color(0xFF0B5E78)),
            ),
        ],
      ),
    );
  }
}
