import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Emoji Charades: a performer's emojis hint at a secret word; guessers type
/// the word in the input field and race to be first.
class EmojiCharadesBoard extends StatefulWidget {
  const EmojiCharadesBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<EmojiCharadesBoard> createState() => _EmojiCharadesBoardState();
}

class _EmojiCharadesBoardState extends State<EmojiCharadesBoard> {
  Timer? _tick;
  int _now = DateTime.now().millisecondsSinceEpoch;
  final TextEditingController _controller = TextEditingController();

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
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final round = (b['round'] as num?)?.toInt() ?? 1;
    final target = (b['target'] as num?)?.toInt() ?? 6;
    final performerSeat = (b['performerSeat'] as num?)?.toInt() ?? 0;
    final emojis = ((b['revealedEmojis'] as List?) ?? const []).map((e) => e.toString()).toList();
    final winnerSeat = (b['winnerSeat'] as num?)?.toInt();
    final winnerWord = b['winnerWord']?.toString();
    final players = ((b['players'] as List?) ?? const []);
    final endsAt = DateTime.tryParse((b['revealEndsAt'] as String?) ?? '')?.millisecondsSinceEpoch ?? _now;
    final remain = ((endsAt - _now) / 1000).clamp(0, 60).toStringAsFixed(1);
    final isPerformer = widget.mySeat == performerSeat;
    final solved = winnerSeat != null;

    return Column(
      children: [
        TurnIndicator(
          text: widget.session.isInProgress
              ? solved
                  ? 'Solved! It was "$winnerWord"'
                  : 'Round $round of $target — guess the word!'
              : 'Game over',
          highlight: !isPerformer && !solved && widget.session.isInProgress,
          icon: Icons.emoji_emotions,
        ),
        const SizedBox(height: 6),
        Text('⏳ $remain s', style: const TextStyle(color: AppColors.warning, fontWeight: FontWeight.w700)),
        const SizedBox(height: 10),
        TableSurface(
          child: Column(
            children: [
              Text((b['category'] ?? '').toString(),
                  style: const TextStyle(color: AppColors.softCyan, fontSize: 13, fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              SizedBox(
                height: 84,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: emojis
                      .map((e) => Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 6),
                            child: Text(e, style: const TextStyle(fontSize: 48)),
                          ))
                      .toList(),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                isPerformer
                    ? 'You are performing — wait for guesses!'
                    : solved
                        ? '${winnerSeat >= 0 ? widget.session.seats[winnerSeat].displayName : 'Someone'} got it!'
                        : 'What word do the emojis describe?',
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
              ),
              const SizedBox(height: 14),
              if (!isPerformer && !solved && widget.session.isInProgress)
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _controller,
                        textInputAction: TextInputAction.send,
                        style: const TextStyle(color: AppColors.textPrimary),
                        decoration: InputDecoration(
                          hintText: 'Type your guess…',
                          filled: true,
                          fillColor: AppColors.surfaceElevated,
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                        ),
                        onSubmitted: (_) => _guess(),
                      ),
                    ),
                    const SizedBox(width: 10),
                    FilledButton(
                      style: FilledButton.styleFrom(backgroundColor: AppColors.electricPurple),
                      onPressed: _guess,
                      child: const Text('Guess'),
                    ),
                  ],
                ),
              const SizedBox(height: 16),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                alignment: WrapAlignment.center,
                children: List.generate(players.length, (i) {
                  final p = Map<String, dynamic>.from(players[i] as Map);
                  final name = i == widget.mySeat ? 'You' : widget.session.seats[i].displayName;
                  return _ScoreChip(
                    name: i == performerSeat ? '🎭 $name' : name,
                    score: (p['score'] as num?)?.toInt() ?? 0,
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

  Future<void> _guess() async {
    final word = _controller.text.trim();
    if (word.isEmpty) return;
    _controller.clear();
    GameFeedback.move();
    await widget.onAction('guess', {'word': word});
  }
}

class _ScoreChip extends StatelessWidget {
  const _ScoreChip({required this.name, required this.score, required this.active});
  final String name;
  final int score;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: active ? AppColors.electricPurple.withOpacity(0.3) : AppColors.glassFill,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.glassStroke),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(name, style: const TextStyle(color: AppColors.textPrimary, fontSize: 12, fontWeight: FontWeight.w600)),
          const SizedBox(width: 8),
          Text('$score', style: const TextStyle(color: AppColors.softCyan, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}
