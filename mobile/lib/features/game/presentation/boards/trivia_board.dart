import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/piece_3d.dart';
import '../../domain/entities/game_entities.dart';
import '../skins/skinned_pieces.dart';
import '../skins/table_skins.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Trivia Battle — a quiz-show table. A category ribbon, the question on a
/// glowing card with a shrinking timer ring, four big answer tiles (A–D) that
/// show who picked what, then a reveal that lights the right answer green,
/// the wrong ones red and pops the points earned onto the leaderboard.
class TriviaBoard extends StatefulWidget {
  const TriviaBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<TriviaBoard> createState() => _TriviaBoardState();
}

class _TriviaBoardState extends State<TriviaBoard> {
  Timer? _tick;
  int _now = DateTime.now().millisecondsSinceEpoch;
  bool _busy = false;
  int _lastRound = -1;
  int _answerStartMs = 0;
  bool _revealSeen = false;

  Map<String, dynamic> get b => widget.session.board;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(milliseconds: 100), (_) {
      if (mounted) setState(() => _now = DateTime.now().millisecondsSinceEpoch);
    });
  }

  @override
  void didUpdateWidget(covariant TriviaBoard old) {
    super.didUpdateWidget(old);
    final round = (b['round'] as num?)?.toInt() ?? 1;
    final reveal = b['reveal'] == true;
    if (round != _lastRound) {
      _lastRound = round;
      _answerStartMs = DateTime.now().millisecondsSinceEpoch;
      _revealSeen = false;
    }
    if (reveal && !_revealSeen) {
      _revealSeen = true;
      final players = (b['players'] as List?) ?? const [];
      final me = widget.mySeat >= 0 && widget.mySeat < players.length ? Map<String, dynamic>.from(players[widget.mySeat] as Map) : null;
      if (me?['correct'] == true) {
        GameFeedback.hit();
      } else {
        GameFeedback.tap();
      }
    }
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final round = (b['round'] as num?)?.toInt() ?? 1;
    final target = (b['target'] as num?)?.toInt() ?? 7;
    final reveal = b['reveal'] == true;
    final category = (b['category'] as String?) ?? 'Trivia';
    final prompt = (b['prompt'] as String?) ?? '';
    final options = ((b['options'] as List?) ?? const []).map((e) => e.toString()).toList();
    final players = ((b['players'] as List?) ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    final correctIndex = (b['correctIndex'] as num?)?.toInt();
    final endsAt = DateTime.tryParse((b['answerEndsAt'] as String?) ?? '')?.millisecondsSinceEpoch ?? _now;
    final totalMs = (endsAt - _answerStartMs).clamp(1000, 60000);
    final remainMs = (endsAt - _now).clamp(0, 60000);
    final fraction = (remainMs / totalMs).clamp(0.0, 1.0);
    final playground = TableSkins.playgroundFor(widget.session, widget.mySeat);

    final me = widget.mySeat >= 0 && widget.mySeat < players.length ? players[widget.mySeat] : null;
    final answered = me?['answered'] == true;
    final myChoice = (me?['chosen'] as num?)?.toInt();
    final canAnswer = widget.session.isInProgress && !reveal && !answered && !_busy && widget.mySeat >= 0;

    String status;
    if (!widget.session.isInProgress) {
      status = 'Game over';
    } else if (reveal) {
      status = me?['correct'] == true ? 'Correct! +${me?['gained'] ?? 0}' : (myChoice == null ? 'Time\'s up!' : 'Not this time…');
    } else if (answered) {
      status = 'Locked in — waiting for the others';
    } else {
      status = 'Question $round of $target — faster is worth more';
    }

    return Column(
      children: [
        TurnIndicator(text: status, highlight: canAnswer, icon: Icons.quiz_rounded),
        const SizedBox(height: 8),
        Playground(
          skin: playground,
          padding: const EdgeInsets.all(12),
          child: Column(
            children: [
              // Category ribbon + progress dots.
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: playground.accent.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: playground.accent.withValues(alpha: 0.7)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(_categoryEmoji(category), style: const TextStyle(fontSize: 13)),
                        const SizedBox(width: 6),
                        Text(category.toUpperCase(), style: TextStyle(color: playground.accent, fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 1)),
                      ],
                    ),
                  ),
                  const Spacer(),
                  for (var i = 1; i <= target; i++)
                    Container(
                      width: i == round ? 10 : 6,
                      height: 6,
                      margin: const EdgeInsets.only(left: 3),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(3),
                        color: i < round ? playground.accent : (i == round ? Colors.white : Colors.white.withValues(alpha: 0.25)),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              // Question card with timer ring.
              Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(18),
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Colors.white.withValues(alpha: 0.12), Colors.white.withValues(alpha: 0.04)],
                  ),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.35), blurRadius: 14, offset: const Offset(0, 6))],
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        prompt,
                        style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w800, height: 1.25),
                      ),
                    ),
                    const SizedBox(width: 12),
                    _TimerRing(fraction: reveal ? 0 : fraction, seconds: reveal ? 0 : (remainMs / 1000).ceil(), color: fraction < 0.3 ? AppColors.coral : playground.accent),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              // Answers.
              for (var i = 0; i < options.length; i++)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _AnswerTile(
                    letter: String.fromCharCode(65 + i),
                    text: options[i],
                    enabled: canAnswer,
                    selected: myChoice == i,
                    reveal: reveal,
                    correct: reveal && correctIndex == i,
                    pickers: [
                      for (var s = 0; s < players.length && s < widget.session.seats.length; s++)
                        if ((players[s]['chosen'] as num?)?.toInt() == i) s,
                    ],
                    session: widget.session,
                    mySeat: widget.mySeat,
                    accent: playground.accent,
                    onTap: () => _answer(i),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        _Leaderboard(session: widget.session, players: players, mySeat: widget.mySeat, reveal: reveal),
      ],
    );
  }

  Future<void> _answer(int index) async {
    setState(() => _busy = true);
    GameFeedback.move();
    await widget.onAction('answer', {'index': index});
    if (mounted) setState(() => _busy = false);
  }

  String _categoryEmoji(String category) {
    switch (category.toLowerCase()) {
      case 'science':
        return '🔬';
      case 'geography':
        return '🌍';
      case 'math':
        return '➗';
      case 'animals':
        return '🦁';
      case 'history':
        return '🏛️';
      case 'sports':
        return '⚽';
      case 'music':
        return '🎵';
      case 'movies':
      case 'film':
        return '🎬';
      case 'food':
        return '🍕';
      case 'space':
        return '🚀';
      case 'art':
        return '🎨';
      case 'language':
        return '🔤';
      case 'technology':
      case 'tech':
        return '💻';
      case 'literature':
        return '📚';
      default:
        return '💡';
    }
  }
}

class _TimerRing extends StatelessWidget {
  const _TimerRing({required this.fraction, required this.seconds, required this.color});
  final double fraction;
  final int seconds;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 50,
      height: 50,
      child: Stack(
        alignment: Alignment.center,
        children: [
          CircularProgressIndicator(value: 1, strokeWidth: 5, valueColor: AlwaysStoppedAnimation<Color>(Colors.white.withValues(alpha: 0.10))),
          TweenAnimationBuilder<double>(
            tween: Tween(begin: fraction, end: fraction),
            duration: const Duration(milliseconds: 100),
            builder: (context, v, _) => CircularProgressIndicator(value: v, strokeWidth: 5, strokeCap: StrokeCap.round, valueColor: AlwaysStoppedAnimation<Color>(color)),
          ),
          Text('$seconds', style: TextStyle(color: color, fontWeight: FontWeight.w900, fontSize: 15)),
        ],
      ),
    );
  }
}

class _AnswerTile extends StatelessWidget {
  const _AnswerTile({
    required this.letter,
    required this.text,
    required this.enabled,
    required this.selected,
    required this.reveal,
    required this.correct,
    required this.pickers,
    required this.session,
    required this.mySeat,
    required this.accent,
    required this.onTap,
  });

  final String letter;
  final String text;
  final bool enabled;
  final bool selected;
  final bool reveal;
  final bool correct;
  final List<int> pickers;
  final GameSessionView session;
  final int mySeat;
  final Color accent;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    Color border = Colors.white.withValues(alpha: 0.14);
    Color fill = Colors.black.withValues(alpha: 0.22);
    Color letterBg = Colors.white.withValues(alpha: 0.10);
    Color? glow;
    if (reveal) {
      if (correct) {
        border = AppColors.success;
        fill = AppColors.success.withValues(alpha: 0.22);
        letterBg = AppColors.success;
        glow = AppColors.success;
      } else if (selected) {
        border = AppColors.coral;
        fill = AppColors.coral.withValues(alpha: 0.18);
        letterBg = AppColors.coral;
      }
    } else if (selected) {
      border = accent;
      fill = accent.withValues(alpha: 0.22);
      letterBg = accent;
      glow = accent;
    }
    return AnimatedScale(
      duration: const Duration(milliseconds: 220),
      scale: reveal && correct ? 1.03 : 1,
      child: GestureDetector(
        onTap: enabled ? onTap : null,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          decoration: BoxDecoration(
            color: fill,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: border, width: selected || (reveal && correct) ? 1.8 : 1),
            boxShadow: glow != null ? [BoxShadow(color: glow.withValues(alpha: 0.35), blurRadius: 12)] : null,
          ),
          child: Row(
            children: [
              Container(
                width: 30,
                height: 30,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: letterBg, borderRadius: BorderRadius.circular(9)),
                child: reveal && correct
                    ? const Icon(Icons.check_rounded, color: Colors.white, size: 18)
                    : (reveal && selected
                        ? const Icon(Icons.close_rounded, color: Colors.white, size: 18)
                        : Text(letter, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 13))),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  text,
                  style: TextStyle(color: enabled || selected || (reveal && correct) ? Colors.white : Colors.white.withValues(alpha: 0.75), fontSize: 14, fontWeight: FontWeight.w700),
                ),
              ),
              // Who picked this.
              if (pickers.isNotEmpty)
                SizedBox(
                  height: 22,
                  width: 14.0 + pickers.length * 14.0,
                  child: Stack(
                    children: [
                      for (var i = 0; i < pickers.length; i++)
                        Positioned(
                          left: i * 14.0,
                          child: SkinnedPiece(
                            skin: TableSkins.pieceSkin(session.cosmeticsOf(pickers[i]).piece),
                            seat: pickers[i],
                            size: 22,
                            highlight: pickers[i] == mySeat,
                          ),
                        ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Leaderboard extends StatelessWidget {
  const _Leaderboard({required this.session, required this.players, required this.mySeat, required this.reveal});
  final GameSessionView session;
  final List<Map<String, dynamic>> players;
  final int mySeat;
  final bool reveal;

  @override
  Widget build(BuildContext context) {
    final order = List<int>.generate(players.length.clamp(0, session.seats.length), (i) => i)
      ..sort((a, b) => ((players[b]['score'] as num?) ?? 0).compareTo((players[a]['score'] as num?) ?? 0));
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Wrap(
        spacing: 8,
        runSpacing: 6,
        alignment: WrapAlignment.center,
        children: [
          for (var rank = 0; rank < order.length; rank++)
            _ScoreChip(
              rank: rank + 1,
              name: order[rank] == mySeat ? 'You' : session.seats[order[rank]].displayName,
              score: (players[order[rank]]['score'] as num?)?.toInt() ?? 0,
              gained: reveal ? (players[order[rank]]['gained'] as num?)?.toInt() ?? 0 : 0,
              answered: players[order[rank]]['answered'] == true,
              palette: TableSkins.paletteFor(session, order[rank]),
              winner: session.winnerSeat == order[rank],
              reveal: reveal,
            ),
        ],
      ),
    );
  }
}

class _ScoreChip extends StatelessWidget {
  const _ScoreChip({
    required this.rank,
    required this.name,
    required this.score,
    required this.gained,
    required this.answered,
    required this.palette,
    required this.winner,
    required this.reveal,
  });
  final int rank;
  final String name;
  final int score;
  final int gained;
  final bool answered;
  final PiecePalette palette;
  final bool winner;
  final bool reveal;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 220),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: rank == 1 ? palette.base.withValues(alpha: 0.2) : AppColors.glassFill,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: rank == 1 ? palette.light : AppColors.glassStroke, width: rank == 1 ? 1.5 : 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(winner ? '🏆' : '#$rank', style: TextStyle(color: rank == 1 ? AppColors.gold : AppColors.textMuted, fontSize: 11, fontWeight: FontWeight.w800)),
          const SizedBox(width: 6),
          Container(width: 8, height: 8, decoration: BoxDecoration(shape: BoxShape.circle, color: palette.base)),
          const SizedBox(width: 6),
          Text(name, style: const TextStyle(color: AppColors.textPrimary, fontSize: 12, fontWeight: FontWeight.w600)),
          const SizedBox(width: 8),
          Text('$score', style: TextStyle(color: palette.light, fontWeight: FontWeight.w900, fontSize: 14)),
          if (reveal && gained > 0) ...[
            const SizedBox(width: 4),
            Text('+$gained', style: const TextStyle(color: AppColors.success, fontWeight: FontWeight.w800, fontSize: 11)),
          ] else if (!reveal && answered) ...[
            const SizedBox(width: 4),
            const Icon(Icons.lock_rounded, size: 12, color: AppColors.softCyan),
          ],
        ],
      ),
    );
  }
}
