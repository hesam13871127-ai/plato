import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Bingo: a live 75-ball card. The caller announces numbers automatically; the
/// player's card highlights matches and they tap BINGO when a line is complete
/// (the server validates the win).
class BingoBoard extends StatefulWidget {
  const BingoBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<BingoBoard> createState() => _BingoBoardState();
}

class _BingoBoardState extends State<BingoBoard> with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;
  Timer? _t;
  int _tick = 0;

  static const int free = -1;
  static const _letters = ['B', 'I', 'N', 'G', 'O'];

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(vsync: this, duration: const Duration(milliseconds: 700))
      ..repeat(reverse: true);
    _t = Timer.periodic(const Duration(milliseconds: 300), (_) {
      if (mounted) setState(() => _tick++);
    });
  }

  @override
  void dispose() {
    _t?.cancel();
    _pulse.dispose();
    super.dispose();
  }

  Map<String, dynamic> get b => widget.session.board;

  List<int> get _card {
    final raw = (b['myCard'] as List?) ?? const [];
    // myCard may be an object {cells:[...]} or a flat list.
    final cells = raw.isNotEmpty && raw.first is Map
        ? ((raw.first['cells'] as List?) ?? const [])
        : raw;
    return cells.map((v) => v == null ? free : (v as num).toInt()).toList();
  }

  Set<int> get _called => ((b['called'] as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toSet();

  bool _isMarked(int value) => value == free || _called.contains(value);

  bool get _hasWin {
    final card = _card;
    if (card.length != 25) return false;
    final marked = List.generate(25, (i) => _isMarked(card[i]));
    // rows & columns
    for (var r = 0; r < 5; r++) {
      if (List.generate(5, (c) => marked[r * 5 + c]).every((e) => e)) return true;
    }
    for (var c = 0; c < 5; c++) {
      if (List.generate(5, (r) => marked[r * 5 + c]).every((e) => e)) return true;
    }
    // diagonals
    if (List.generate(5, (i) => marked[i * 5 + i]).every((e) => e)) return true;
    if (List.generate(5, (i) => marked[i * 5 + (4 - i)]).every((e) => e)) return true;
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final card = _card;
    final current = b['currentCall'];
    final called = _called;
    final markedCounts = ((b['markedCounts'] as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();
    final canClaim = widget.session.isInProgress && _hasWin;

    return Column(
      children: [
        TurnIndicator(
          text: widget.session.isInProgress ? 'Eyes down — daub your card!' : 'Game over',
          highlight: widget.session.isInProgress,
          icon: Icons.campaign,
        ),
        const SizedBox(height: 8),
        // Current call board.
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            ScaleTransition(
              scale: Tween(begin: 0.9, end: 1.1).animate(CurvedAnimation(parent: _pulse, curve: Curves.easeInOut)),
              child: Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: AppColors.brandGradient,
                  boxShadow: [BoxShadow(color: AppColors.softCyan.withOpacity(0.4), blurRadius: 16)],
                ),
                child: Center(
                  child: Text(current == null ? '—' : '$current',
                      style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w900)),
                ),
              ),
            ),
            const SizedBox(width: 16),
            Text('${called.length} called',
                style: const TextStyle(color: AppColors.textSecondary, fontWeight: FontWeight.w600)),
          ],
        ),
        const SizedBox(height: 12),
        TableSurface(
          child: card.length == 25
              ? Column(
                  children: [
                    Row(
                      children: [
                        for (var c = 0; c < 5; c++)
                          Expanded(
                            child: Center(
                              child: Text(_letters[c],
                                  style: const TextStyle(
                                      color: AppColors.softCyan, fontSize: 20, fontWeight: FontWeight.w900)),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    AspectRatio(
                      aspectRatio: 1,
                      child: GridView.builder(
                        physics: const NeverScrollableScrollPhysics(),
                        gridDelegate:
                            const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 5, crossAxisSpacing: 5, mainAxisSpacing: 5),
                        itemCount: 25,
                        itemBuilder: (context, i) {
                          final value = card[i];
                          final isFree = value == free;
                          final marked = _isMarked(value);
                          return AnimatedContainer(
                            duration: const Duration(milliseconds: 200),
                            decoration: BoxDecoration(
                              color: marked
                                  ? AppColors.softCyan.withOpacity(0.85)
                                  : AppColors.surfaceElevated,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: AppColors.glassStroke),
                            ),
                            child: Center(
                              child: Text(
                                isFree ? '★' : '$value',
                                style: TextStyle(
                                  color: marked ? AppColors.deepNavy : AppColors.textPrimary,
                                  fontWeight: FontWeight.w800,
                                  fontSize: isFree ? 20 : 16,
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ],
                )
              : const Center(
                  child: Text('No card dealt.', style: TextStyle(color: AppColors.textMuted))),
        ),
        const SizedBox(height: 10),
        ActionButton(
          label: 'BINGO!',
          icon: Icons.emoji_events,
          color: canClaim ? AppColors.success : AppColors.surfaceElevated,
          onPressed: canClaim
              ? () {
                  GameFeedback.win();
                  widget.onAction('claim', {});
                }
              : null,
        ),
        const SizedBox(height: 6),
        Wrap(
          spacing: 8,
          alignment: WrapAlignment.center,
          children: [
            for (var i = 0; i < widget.session.seats.length; i++)
              Text(
                '${i == widget.mySeat ? 'You' : widget.session.seats[i].displayName}: ${i < markedCounts.length ? markedCounts[i] : 0}',
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 11),
              ),
          ],
        ),
        const SizedBox(height: 4),
        Opacity(opacity: 0, child: Text('$_tick')),
      ],
    );
  }
}
