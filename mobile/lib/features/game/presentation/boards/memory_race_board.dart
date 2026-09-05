import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Memory Race: a shared 16-card grid (8 pairs). Tap cards to flip and match
/// pairs before the other players; most pairs when the board clears wins.
class MemoryRaceBoard extends StatefulWidget {
  const MemoryRaceBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<MemoryRaceBoard> createState() => _MemoryRaceBoardState();
}

class _MemoryRaceBoardState extends State<MemoryRaceBoard> {
  Timer? _tick;
  int _now = DateTime.now().millisecondsSinceEpoch;
  bool _busy = false;

  Map<String, dynamic> get b => widget.session.board;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(milliseconds: 250), (_) {
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
    // Server only reveals emojis for face-up/matched cards; down cards are null.
    final emojis = ((b['emojis'] as List?) ?? const [])
        .map((e) => e == null ? '' : e.toString())
        .toList();
    final states = ((b['states'] as List?) ?? const []).map((e) => e.toString()).toList();
    final matchedBy = ((b['matchedBy'] as List?) ?? const []).map((e) => (e as num?)?.toInt() ?? -1).toList();
    final scores = ((b['scores'] as List?) ?? const []).map((e) => (e as num?)?.toInt() ?? 0).toList();
    final endsAt = DateTime.tryParse((b['roundEndsAt'] as String?) ?? '')?.millisecondsSinceEpoch ?? _now;
    final remain = ((endsAt - _now) / 1000).clamp(0, 120).toStringAsFixed(0);
    final flippedCount = ((b['flipped'] as List?) ?? const []).length;

    final pairsLeft = (emojis.length ~/ 2) -
        ((matchedBy.where((s) => s >= 0).length) ~/ 2);

    return Column(
      children: [
        TurnIndicator(
          text: widget.session.isInProgress ? 'Flip and match! $pairsLeft pairs left' : 'Game over',
          highlight: widget.session.isInProgress,
          icon: Icons.style,
        ),
        const SizedBox(height: 6),
        Text('⏳ $remain s', style: const TextStyle(color: AppColors.warning, fontWeight: FontWeight.w700)),
        const SizedBox(height: 10),
        TableSurface(
          child: Column(
            children: [
              GridView.count(
                crossAxisCount: 4,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 8,
                crossAxisSpacing: 8,
                children: List.generate(emojis.length, (i) {
                  final state = i < states.length ? states[i] : 'down';
                  final revealed = state == 'up' || state == 'matched';
                  final matched = state == 'matched';
                  final owner = i < matchedBy.length ? matchedBy[i] : -1;
                  final ownerColor = owner >= 0 && owner < widget.session.seats.length
                      ? _ownerColor(owner)
                      : AppColors.glassStroke;
                  return GestureDetector(
                    onTap: (matched || !widget.session.isInProgress || flippedCount >= 2 || _busy)
                        ? null
                        : () => _flip(i),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      decoration: BoxDecoration(
                        gradient: revealed
                            ? null
                            : const LinearGradient(
                                colors: [AppColors.electricPurple, AppColors.surfaceElevated],
                                begin: Alignment.topLeft,
                                end: Alignment.bottomRight,
                              ),
                        color: revealed ? AppColors.surfaceDark : null,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: matched ? ownerColor : AppColors.glassStroke,
                          width: matched ? 2 : 1,
                        ),
                      ),
                      child: Center(
                        child: revealed
                            ? Text(emojis[i], style: TextStyle(fontSize: matched ? 28 : 26))
                            : const Icon(Icons.help_outline, color: Colors.white70, size: 26),
                      ),
                    ),
                  );
                }),
              ),
              const SizedBox(height: 16),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                alignment: WrapAlignment.center,
                children: List.generate(scores.length, (i) {
                  return Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: i == widget.mySeat ? AppColors.electricPurple.withOpacity(0.3) : AppColors.glassFill,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: AppColors.glassStroke),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.style, size: 14, color: _ownerColor(i)),
                        const SizedBox(width: 6),
                        Text(i == widget.mySeat ? 'You' : widget.session.seats[i].displayName,
                            style: const TextStyle(color: AppColors.textPrimary, fontSize: 12, fontWeight: FontWeight.w600)),
                        const SizedBox(width: 8),
                        Text('${scores[i]}', style: const TextStyle(color: AppColors.softCyan, fontWeight: FontWeight.bold)),
                      ],
                    ),
                  );
                }),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Color _ownerColor(int seat) {
    const colors = [
      AppColors.softCyan,
      AppColors.warning,
      AppColors.success,
      AppColors.danger,
      AppColors.electricPurple,
      AppColors.textSecondary,
    ];
    return colors[seat % colors.length];
  }

  Future<void> _flip(int index) async {
    setState(() => _busy = true);
    GameFeedback.tap();
    await widget.onAction('flip', {'index': index});
    if (mounted) setState(() => _busy = false);
  }
}
