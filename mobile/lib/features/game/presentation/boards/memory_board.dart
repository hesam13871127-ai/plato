import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Parsed memory view — the server hides faces nobody has seen.
class _MemoryView {
  _MemoryView(Map<String, dynamic> b)
      : cards = _cards(b['cards']),
        revealed = _nums(b['revealed']),
        matchCount = (b['matchCount'] as num?)?.toInt() ?? 0,
        lastFlip = _flip(b['lastFlip']);

  final List<_Card> cards;
  final List<int> revealed;
  final int matchCount;
  final _Flip? lastFlip;

  static List<_Card> _cards(Object? raw) => ((raw as List?) ?? const [])
      .whereType<Map>()
      .map((m) => _Card(
            (m['symbol'] as String?) ?? '?',
            m['matched'] == true,
          ))
      .toList();

  static List<int> _nums(Object? raw) =>
      ((raw as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();

  static _Flip? _flip(Object? raw) {
    final m = raw as Map?;
    if (m == null) return null;
    return _Flip(
      (m['seat'] as num?)?.toInt() ?? 0,
      (m['a'] as num?)?.toInt() ?? -1,
      (m['b'] as num?)?.toInt() ?? -1,
      m['matched'] == true,
    );
  }
}

class _Card {
  const _Card(this.symbol, this.matched);
  final String symbol;
  final bool matched;
}

class _Flip {
  const _Flip(this.seat, this.a, this.b, this.matched);
  final int seat;
  final int a;
  final int b;
  final bool matched;
}

/// Memory, wave-4 3D board.
///
/// A four-by-four grid of face-down cards. Tap two to flip them — matches
/// glow and vanish into your tray, misses flash and flip back. Cards the
/// table has already seen carry a faint ring, but remembering where is
/// still on you.
class MemoryBoard extends StatefulWidget {
  const MemoryBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<MemoryBoard> createState() => _MemoryBoardState();
}

class _MemoryBoardState extends State<MemoryBoard> {
  String _skin = 'wood';
  final Set<int> _picked = <int>{};

  _MemoryView get _view => _MemoryView(widget.session.board);

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  void _tapCard(int index) {
    if (!_myTurn) return;
    final card = _view.cards[index];
    if (card.matched) return;
    if (_picked.contains(index)) {
      GameFeedback.tap();
      setState(() => _picked.remove(index));
      return;
    }
    if (_picked.length >= 2) return;

    GameFeedback.tap();
    setState(() => _picked.add(index));
    if (_picked.length == 2) {
      final pair = _picked.toList();
      GameFeedback.move();
      widget.onAction('flip', {'a': pair[0], 'b': pair[1]});
      setState(() => _picked.clear());
    }
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
          icon: Icons.style_rounded,
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
              _scoreRow(view),
              const SizedBox(height: 12),
              AspectRatio(
                aspectRatio: 1,
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(18),
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        Color.lerp(skin.edge, Colors.white, 0.12)!,
                        skin.edge,
                        Color.lerp(skin.edge, Colors.black, 0.5)!,
                      ],
                    ),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.14)),
                    boxShadow: [
                      BoxShadow(color: Colors.black.withValues(alpha: 0.5), blurRadius: 16, offset: const Offset(0, 8)),
                    ],
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(13),
                    child: GridView.count(
                      crossAxisCount: 4,
                      mainAxisSpacing: 6,
                      crossAxisSpacing: 6,
                      padding: const EdgeInsets.all(6),
                      children: [
                        for (var i = 0; i < view.cards.length; i++) _cardTile(view, i),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                '${view.matchCount} / 8 pairs claimed',
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w700),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _cardTile(_MemoryView view, int i) {
    final card = view.cards[i];
    final seen = view.revealed.contains(i);
    final picked = _picked.contains(i);
    final isLastFlip = view.lastFlip != null && (view.lastFlip!.a == i || view.lastFlip!.b == i) && !card.matched;

    // Face-up states: matched, currently picked, or part of the last flip flash.
    final faceUp = card.matched || picked || isLastFlip;

    return GestureDetector(
      onTap: () => _tapCard(i),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 260),
        curve: Curves.easeOutBack,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          gradient: faceUp
              ? const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0xFF5B3FA8), Color(0xFF31215E)],
                )
              : LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    Color.lerp(AppColors.electricPurple, Colors.white, 0.22)!,
                    AppColors.electricPurple,
                    Color.lerp(AppColors.electricPurple, Colors.black, 0.45)!,
                  ],
                ),
          border: Border.all(
            color: card.matched
                ? const Color(0xFF4ADE80).withValues(alpha: 0.65)
                : isLastFlip && view.lastFlip!.matched
                    ? const Color(0xFF4ADE80)
                    : picked
                        ? AppColors.softCyan
                        : Colors.white.withValues(alpha: 0.12),
            width: card.matched || picked ? 1.8 : 1,
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: card.matched ? 0.1 : 0.35),
              blurRadius: 4,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Center(
          child: card.matched
              ? Icon(Icons.check_rounded, color: const Color(0xFF4ADE80).withValues(alpha: 0.8), size: 20)
              : faceUp
                  ? Text(
                      card.symbol,
                      style: const TextStyle(fontSize: 26),
                    )
                  : seen
                      ? Icon(Icons.visibility_rounded, size: 13, color: Colors.white.withValues(alpha: 0.3))
                      : const SizedBox.shrink(),
        ),
      ),
    );
  }

  Widget _scoreRow(_MemoryView view) {
    return Wrap(
      spacing: 8,
      runSpacing: 6,
      alignment: WrapAlignment.center,
      children: [
        for (var seat = 0; seat < widget.session.seats.length; seat++)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: widget.session.currentSeat == seat && widget.session.isInProgress
                  ? AppColors.electricPurple.withValues(alpha: 0.3)
                  : Colors.white.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: widget.session.currentSeat == seat && widget.session.isInProgress
                    ? AppColors.softCyan
                    : Colors.white.withValues(alpha: 0.12),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  _seatLabel(seat),
                  style: TextStyle(
                    color: seat == widget.mySeat ? AppColors.softCyan : AppColors.textSecondary,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  '${widget.session.scores.length > seat ? widget.session.scores[seat] : 0} 🃏',
                  style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w900),
                ),
              ],
            ),
          ),
      ],
    );
  }

  String _statusText(_MemoryView view) {
    if (!widget.session.isInProgress) {
      if (widget.session.winnerSeat == null) return 'Deck cleared — a tie';
      return widget.session.winnerSeat == widget.mySeat ? 'Your memory rules!' : 'They remembered better…';
    }
    if (!_myTurn) return 'Watching their flips — remember everything…';
    final last = view.lastFlip;
    if (last != null && last.seat == widget.mySeat && last.matched) return 'Match! Flip again';
    if (_picked.length == 1) return 'Now tap the second card';
    return 'Flip two cards';
  }

  String _seatLabel(int seat) {
    if (seat >= widget.session.seats.length) return 'Seat ${seat + 1}';
    return seat == widget.mySeat ? 'You' : widget.session.seats[seat].displayName;
  }
}
