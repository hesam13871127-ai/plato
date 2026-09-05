import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Trivia Battle: answer the multiple-choice question before the timer ends;
/// faster correct answers score more.
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
  int? _myChoice;

  Map<String, dynamic> get b => widget.session.board;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(milliseconds: 200), (_) {
      if (mounted) setState(() => _now = DateTime.now().millisecondsSinceEpoch);
    });
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
    final options = ((b['options'] as List?) ?? const []).map((e) => e.toString()).toList();
    final players = ((b['players'] as List?) ?? const []);
    final correctIndex = (b['correctIndex'] as num?)?.toInt();
    final endsAt = DateTime.tryParse((b['answerEndsAt'] as String?) ?? '')?.millisecondsSinceEpoch ?? _now;
    final remain = ((endsAt - _now) / 1000).clamp(0, 60).toStringAsFixed(1);

    final me = widget.mySeat >= 0 && widget.mySeat < players.length
        ? Map<String, dynamic>.from(players[widget.mySeat] as Map)
        : null;
    final answered = me?['answered'] == true;
    _myChoice = (me?['chosen'] as num?)?.toInt();

    return Column(
      children: [
        TurnIndicator(
          text: widget.session.isInProgress
              ? reveal
                  ? 'Correct answer revealed!'
                  : answered
                      ? 'Answer locked — wait for others…'
                      : 'Round $round of $target — pick your answer!'
              : 'Game over',
          highlight: !reveal && !answered && widget.session.isInProgress,
          icon: Icons.quiz,
        ),
        const SizedBox(height: 6),
        if (!reveal)
          Text('⏳ $remain s', style: const TextStyle(color: AppColors.warning, fontWeight: FontWeight.w700)),
        const SizedBox(height: 10),
        TableSurface(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.electricPurple.withOpacity(0.25),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text((b['category'] ?? '').toString(),
                    style: const TextStyle(color: AppColors.softCyan, fontSize: 12, fontWeight: FontWeight.w700)),
              ),
              const SizedBox(height: 10),
              Text((b['prompt'] ?? '').toString(),
                  style: const TextStyle(color: AppColors.textPrimary, fontSize: 18, fontWeight: FontWeight.w800)),
              const SizedBox(height: 16),
              ...List.generate(options.length, (i) {
                final isCorrect = reveal && correctIndex == i;
                final isMine = _myChoice == i;
                Color? bg;
                if (isCorrect) bg = AppColors.success.withOpacity(0.35);
                else if (reveal && isMine) bg = AppColors.danger.withOpacity(0.3);
                else if (isMine) bg = AppColors.electricPurple.withOpacity(0.3);
                return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Material(
                    color: Colors.transparent,
                    child: InkWell(
                      borderRadius: BorderRadius.circular(14),
                      onTap: (reveal || answered) ? null : () => _answer(i),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                        decoration: BoxDecoration(
                          color: bg ?? AppColors.glassFill,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(
                            color: isCorrect
                                ? AppColors.success
                                : isMine
                                    ? AppColors.electricPurple
                                    : AppColors.glassStroke,
                          ),
                        ),
                        child: Row(
                          children: [
                            CircleAvatar(
                              radius: 13,
                              backgroundColor: AppColors.deepNavy,
                              child: Text(String.fromCharCode(65 + i),
                                  style: const TextStyle(color: AppColors.softCyan, fontWeight: FontWeight.bold, fontSize: 13)),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(options[i],
                                  style: const TextStyle(color: AppColors.textPrimary, fontSize: 15)),
                            ),
                            if (isCorrect) const Icon(Icons.check_circle, color: AppColors.success, size: 20),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              }),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                alignment: WrapAlignment.center,
                children: List.generate(players.length, (i) {
                  final p = Map<String, dynamic>.from(players[i] as Map);
                  return _ScoreChip(
                    name: i == widget.mySeat ? 'You' : widget.session.seats[i].displayName,
                    score: (p['score'] as num?)?.toInt() ?? 0,
                    done: p['answered'] == true,
                    active: i == widget.mySeat,
                  );
                }),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _answer(int index) async {
    GameFeedback.move();
    await widget.onAction('answer', {'index': index});
  }
}

class _ScoreChip extends StatelessWidget {
  const _ScoreChip({required this.name, required this.score, required this.done, required this.active});
  final String name;
  final int score;
  final bool done;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: active ? AppColors.electricPurple.withOpacity(0.3) : AppColors.glassFill,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: done ? AppColors.success : AppColors.glassStroke),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(done ? Icons.check_circle : Icons.hourglass_bottom,
              size: 15, color: done ? AppColors.success : AppColors.textMuted),
          const SizedBox(width: 6),
          Text(name, style: const TextStyle(color: AppColors.textPrimary, fontSize: 12, fontWeight: FontWeight.w600)),
          const SizedBox(width: 8),
          Text('$score', style: const TextStyle(color: AppColors.softCyan, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}
