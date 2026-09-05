import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Word Chain: on your turn type a word starting with the required letter (or
/// any word to start). A wrong word or pass costs a life; last one alive wins.
class WordChainBoard extends StatefulWidget {
  const WordChainBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<WordChainBoard> createState() => _WordChainBoardState();
}

class _WordChainBoardState extends State<WordChainBoard> {
  final TextEditingController _controller = TextEditingController();
  bool _busy = false;

  Map<String, dynamic> get b => widget.session.board;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final players = ((b['players'] as List?) ?? const []);
    final chain = ((b['chain'] as List?) ?? const []).map((e) => e.toString()).toList();
    final requiredLetter = b['requiredFirstLetter']?.toString();
    final lastWord = b['lastWord']?.toString() ?? '';
    final myTurn = widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

    return Column(
      children: [
        TurnIndicator(
          text: widget.session.isInProgress
              ? myTurn
                  ? (requiredLetter != null
                      ? 'Your turn — word must start with "$requiredLetter"'
                      : 'Your turn — say any word to start!')
                  : 'Waiting for ${_currentName()}…'
              : 'Game over',
          highlight: myTurn,
          icon: Icons.text_fields,
        ),
        const SizedBox(height: 10),
        TableSurface(
          child: Column(
            children: [
              if (lastWord.isNotEmpty)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
                  decoration: BoxDecoration(
                    color: AppColors.electricPurple.withOpacity(0.25),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Text(
                    lastWord,
                    style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w900, color: Colors.white),
                  ),
                )
              else
                const Text('No word yet — start the chain!',
                    style: TextStyle(color: AppColors.textSecondary)),
              if (requiredLetter != null) ...[
                const SizedBox(height: 10),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Text('Next word starts with', style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                    const SizedBox(width: 8),
                    CircleAvatar(
                      radius: 18,
                      backgroundColor: AppColors.softCyan,
                      child: Text(requiredLetter.toUpperCase(),
                          style: const TextStyle(color: AppColors.deepNavy, fontWeight: FontWeight.w900, fontSize: 18)),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 16),
              if (myTurn)
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _controller,
                        enabled: !_busy,
                        autofocus: true,
                        textCapitalization: TextCapitalization.none,
                        style: const TextStyle(color: AppColors.textPrimary),
                        decoration: InputDecoration(
                          hintText: requiredLetter != null ? 'Word starting with $requiredLetter…' : 'Type a word…',
                          filled: true,
                          fillColor: AppColors.surfaceElevated,
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                        ),
                        onSubmitted: (_) => _submit(),
                      ),
                    ),
                    const SizedBox(width: 10),
                    FilledButton(
                      style: FilledButton.styleFrom(backgroundColor: AppColors.electricPurple),
                      onPressed: _busy ? null : _submit,
                      child: const Text('Play'),
                    ),
                  ],
                )
              else if (widget.session.isInProgress)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Text('Wait for your turn…', style: TextStyle(color: AppColors.textMuted)),
                ),
              if (myTurn)
                TextButton(
                  onPressed: _busy ? null : _pass,
                  child: const Text('Pass (lose a life)', style: TextStyle(color: AppColors.danger)),
                ),
              const SizedBox(height: 8),
              const Divider(color: AppColors.glassStroke),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                alignment: WrapAlignment.center,
                children: List.generate(players.length, (i) {
                  final p = Map<String, dynamic>.from(players[i] as Map);
                  final alive = p['alive'] == true;
                  final lives = (p['lives'] as num?)?.toInt() ?? 0;
                  return Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: i == widget.mySeat ? AppColors.electricPurple.withOpacity(0.3) : AppColors.glassFill,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                          color: widget.session.currentSeat == i && alive
                              ? AppColors.softCyan
                              : AppColors.glassStroke),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(i == widget.mySeat ? 'You' : widget.session.seats[i].displayName,
                            style: TextStyle(
                                color: alive ? AppColors.textPrimary : AppColors.textMuted,
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                decoration: alive ? null : TextDecoration.lineThrough)),
                        const SizedBox(width: 8),
                        Text('❤️' * lives, style: const TextStyle(fontSize: 12)),
                      ],
                    ),
                  );
                }),
              ),
              if (chain.isNotEmpty) ...[
                const SizedBox(height: 12),
                SizedBox(
                  height: 34,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    reverse: true,
                    children: chain.reversed
                        .take(10)
                        .map((w) => Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 4),
                              child: Chip(
                                label: Text(w, style: const TextStyle(fontSize: 12, color: AppColors.textPrimary)),
                                backgroundColor: AppColors.surfaceElevated,
                              ),
                            ))
                        .toList(),
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  String _currentName() {
    final seat = widget.session.currentSeat;
    if (seat < 0 || seat >= widget.session.seats.length) return '…';
    return seat == widget.mySeat ? 'you' : widget.session.seats[seat].displayName;
  }

  Future<void> _submit() async {
    final word = _controller.text.trim().toLowerCase();
    if (word.isEmpty) return;
    setState(() => _busy = true);
    GameFeedback.move();
    await widget.onAction('word', {'word': word});
    _controller.clear();
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _pass() async {
    setState(() => _busy = true);
    await widget.onAction('pass', {});
    if (mounted) setState(() => _busy = false);
  }
}
