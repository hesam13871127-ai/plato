import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Ocho (UNO-style shedding game). Shows the discard pile, deck, active colour
/// and the player's hand. Tap a card to play it (wilds ask for a colour); tap
/// the deck to draw.
class OchoBoard extends StatefulWidget {
  const OchoBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<OchoBoard> createState() => _OchoBoardState();
}

class _OchoBoardState extends State<OchoBoard> {
  static const Map<String, Color> _colors = {
    'R': Color(0xFFFF5C5C),
    'G': Color(0xFF2EE6A8),
    'B': Color(0xFF4C8DFF),
    'Y': Color(0xFFFFC857),
    'W': AppColors.deepNavy,
  };

  Map<String, dynamic> get b => widget.session.board;
  List<Map<String, dynamic>> get _hand =>
      ((b['hand'] as List?) ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();

  bool get _myTurn => widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  Future<void> _play(Map<String, dynamic> card) async {
    if (!_myTurn) return;
    String? chosen;
    if (card['color'] == 'W') {
      chosen = await _pickColor();
      if (chosen == null) return;
    }
    GameFeedback.move();
    await widget.onAction('play', {'cardId': card['id'], if (chosen != null) 'color': chosen});
  }

  Future<String?> _pickColor() {
    return showModalBottomSheet<String>(
      context: context,
      backgroundColor: AppColors.surfaceDark,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Choose a colour',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.textPrimary, fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: ['R', 'G', 'B', 'Y'].map((c) {
                return GestureDetector(
                  onTap: () => Navigator.of(ctx).pop(c),
                  child: Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(color: _colors[c], shape: BoxShape.circle,
                        border: Border.all(color: Colors.white24, width: 2)),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final top = (b['discardTop'] as Map?) ?? const {};
    final activeColor = (b['activeColor'] as String?) ?? 'R';
    final drawCount = (b['drawCount'] as num?)?.toInt() ?? 0;
    final pending = (b['drawPending'] as num?)?.toInt() ?? 0;
    final direction = (b['direction'] as num?)?.toInt() ?? 1;
    final hand = _hand;

    return Column(
      children: [
        TurnIndicator(
          text: widget.session.isInProgress
              ? (_myTurn ? 'Your turn!' : 'Waiting for opponents…')
              : 'Game over',
          highlight: _myTurn,
          icon: direction == 1 ? Icons.arrow_forward : Icons.arrow_back,
        ),
        const SizedBox(height: 8),
        TableSurface(
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(direction == 1 ? Icons.arrow_forward : Icons.arrow_back,
                      color: AppColors.textSecondary, size: 18),
                  const SizedBox(width: 14),
                  _CardView(card: Map<String, dynamic>.from(top), faceUp: true, size: 92),
                  const SizedBox(width: 24),
                  GestureDetector(
                    onTap: _myTurn
                        ? () {
                            GameFeedback.hit();
                            widget.onAction('draw', {});
                          }
                        : null,
                    child: _Deck(size: 92, count: drawCount),
                  ),
                  const SizedBox(width: 14),
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      color: _colors[activeColor],
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 2),
                    ),
                  ),
                ],
              ),
              if (pending > 0)
                Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: Text('+${pending} pending — stack or draw!',
                      style: const TextStyle(color: AppColors.warning, fontWeight: FontWeight.w700)),
                ),
            ],
          ),
        ),
        const SizedBox(height: 6),
        SizedBox(
          height: 132,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            itemCount: hand.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (context, i) {
              final card = hand[i];
              return GestureDetector(
                onTap: () => _play(card),
                child: Opacity(
                  opacity: _myTurn ? 1 : 0.75,
                  child: _CardView(card: card, faceUp: true, size: 84),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _Deck extends StatelessWidget {
  const _Deck({required this.size, required this.count});
  final double size;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: size * 0.66,
          height: size,
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [AppColors.deepNavy, AppColors.electricPurple],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppColors.softCyan, width: 2),
          ),
          child: const Center(
            child: Text('OCHO',
                style: TextStyle(color: AppColors.softCyan, fontWeight: FontWeight.w900, fontSize: 16)),
          ),
        ),
        const SizedBox(height: 4),
        Text('$count left', style: const TextStyle(color: AppColors.textSecondary, fontSize: 11)),
      ],
    );
  }
}

class _CardView extends StatelessWidget {
  const _CardView({required this.card, required this.faceUp, required this.size});
  final Map<String, dynamic> card;
  final bool faceUp;
  final double size;

  static const Map<String, Color> _colors = {
    'R': Color(0xFFFF5C5C),
    'G': Color(0xFF2EE6A8),
    'B': Color(0xFF4C8DFF),
    'Y': Color(0xFFFFC857),
    'W': AppColors.surfaceElevated,
  };

  @override
  Widget build(BuildContext context) {
    final color = _colors[card['color'] as String? ?? 'W'] ?? AppColors.surfaceElevated;
    final rank = (card['rank'] as String?) ?? '?';
    final label = rank == 'S'
        ? '⊘'
        : rank == 'R'
            ? '⇄'
            : rank == 'P'
                ? '+2'
                : rank == 'X'
                    ? '+4'
                    : rank == 'W'
                        ? '★'
                        : rank;
    return Container(
      width: size * 0.66,
      height: size,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.white24, width: 2),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.3), blurRadius: 6, offset: const Offset(0, 3))],
      ),
      child: Center(
        child: Container(
          width: size * 0.42,
          height: size * 0.62,
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.85),
            borderRadius: BorderRadius.circular(50),
          ),
          child: Center(
            child: Text(label,
                style: TextStyle(
                    color: color == AppColors.surfaceElevated ? AppColors.electricPurple : color,
                    fontWeight: FontWeight.w900,
                    fontSize: size * 0.24)),
          ),
        ),
      ),
    );
  }
}
