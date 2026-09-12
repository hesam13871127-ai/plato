import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Parsed go-fish view. Your own hand arrives as real card codes ('KD');
/// rivals' cards are masked '??' by the server redaction.
class _FishView {
  _FishView(Map<String, dynamic> b)
      : deck = (b['deck'] is num) ? (b['deck'] as num).toInt() : 0,
        hands = _hands(b['hands']),
        books = _books(b['books']),
        lastEvent = _event(b['lastEvent']);

  final int deck; // pond size
  final List<List<String>> hands;
  final List<List<String>> books; // per seat: completed ranks
  final _FishEvent? lastEvent;

  static List<List<String>> _hands(Object? raw) => ((raw as List?) ?? const [])
      .map((h) => ((h as List?) ?? const []).whereType<String>().toList())
      .toList();

  static List<List<String>> _books(Object? raw) => ((raw as List?) ?? const [])
      .map((b) => ((b as List?) ?? const []).whereType<String>().toList())
      .toList();

  static _FishEvent? _event(Object? raw) {
    if (raw == null) return null;
    final m = raw as Map;
    return _FishEvent(
      (m['seat'] as num?)?.toInt() ?? 0,
      (m['kind'] as String?) ?? '',
      (m['rank'] as String?) ?? '',
      (m['target'] as num?)?.toInt(),
      (m['received'] as num?)?.toInt(),
    );
  }

  /// Distinct ranks I currently hold, most copies first.
  List<String> myRanks(int seat) {
    final counts = <String, int>{};
    for (final c in seat < hands.length ? hands[seat] : const <String>[]) {
      final r = c.length >= 2 ? c.substring(0, c.length - 1) : c;
      counts[r] = (counts[r] ?? 0) + 1;
    }
    final entries = counts.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    return entries.map((e) => e.key).toList();
  }
}

class _FishEvent {
  const _FishEvent(this.seat, this.kind, this.rank, this.target, this.received);
  final int seat;
  final String kind;
  final String rank;
  final int? target;
  final int? received;
}

/// Go Fish — ask, draw and collect four of a kind.
///
/// The pond glows at the top, rivals sit around it with their book counts,
/// and your hand fans along the bottom. Asking is two taps: pick a rank from
/// your hand, pick a rival.
class GoFishBoard extends StatefulWidget {
  const GoFishBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<GoFishBoard> createState() => _GoFishBoardState();
}

class _GoFishBoardState extends State<GoFishBoard> {
  String? _pickedRank;
  int? _pickedTarget;

  _FishView get _view => _FishView(widget.session.board);

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  Future<void> _ask() async {
    if (_pickedRank == null || _pickedTarget == null) return;
    GameFeedback.tap();
    await widget.onAction('ask', {'target': _pickedTarget, 'rank': _pickedRank});
    setState(() {
      _pickedRank = null;
      _pickedTarget = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final view = _view;
    final myBooks = widget.mySeat < view.books.length ? view.books[widget.mySeat].length : 0;
    final totalBooks = view.books.fold<int>(0, (a, b) => a + b.length);

    return Column(
      children: [
        TurnIndicator(
          text: _statusText(view),
          highlight: _myTurn,
          icon: Icons.set_meal_outlined,
        ),
        const SizedBox(height: 8),
        TableSurface(
          child: Column(
            children: [
              // The pond.
              Container(
                height: 64,
                width: double.infinity,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  gradient: const LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Color(0xFF0E3A52), Color(0xFF0A2939), Color(0xFF071D29)],
                  ),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(totalBooks >= 13 ? '🏁' : '🐟', style: const TextStyle(fontSize: 20)),
                    const SizedBox(width: 8),
                    Text(
                      totalBooks >= 13
                          ? 'Pond empty — $totalBooks/13 books'
                          : 'Pond · ${view.deck} cards',
                      style: const TextStyle(
                        color: Color(0xFF9BD8EC),
                        fontSize: 12.5,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.3,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              // Rivals + me.
              for (var s = 0; s < widget.session.seats.length; s++)
                _playerRow(view, s),
              const SizedBox(height: 10),
              // Ask controls.
              if (_myTurn && (_pickedRank != null || _view.myRanks(widget.mySeat).isNotEmpty))
                _askBar(view),
              const SizedBox(height: 10),
              // My hand.
              SizedBox(
                height: 78,
                child: _myHand(view),
              ),
              if (view.lastEvent != null)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    _eventText(view.lastEvent!),
                    style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, fontStyle: FontStyle.italic),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _playerRow(_FishView view, int seat) {
    final mine = seat == widget.mySeat;
    final active = widget.session.currentSeat == seat && widget.session.isInProgress;
    final books = seat < view.books.length ? view.books[seat].length : 0;
    final cardCount = seat < view.hands.length ? view.hands[seat].length : 0;
    final name = seat < widget.session.seats.length ? widget.session.seats[seat].displayName : 'P$seat';
    final picked = _pickedTarget == seat;

    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: GestureDetector(
        onTap: (_myTurn && !mine && _pickedRank != null && cardCount > 0)
            ? () {
                GameFeedback.tap();
                setState(() => _pickedTarget = seat);
              }
            : null,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: picked
                ? AppColors.softCyan.withValues(alpha: 0.18)
                : active
                    ? AppColors.electricPurple.withValues(alpha: 0.28)
                    : Colors.white.withValues(alpha: 0.05),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: picked
                  ? AppColors.softCyan
                  : active
                      ? AppColors.electricPurple
                      : Colors.white.withValues(alpha: 0.1),
              width: picked ? 1.6 : 1,
            ),
          ),
          child: Row(
            children: [
              Text(mine ? '🙋' : '🎭', style: const TextStyle(fontSize: 14)),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  mine ? 'You' : name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppColors.textPrimary,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              Text(
                '$cardCount cards',
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 10.5),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: books > 0 ? const Color(0xFF7C5CFF).withValues(alpha: 0.35) : Colors.white.withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  '📚 $books',
                  style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _askBar(_FishView view) {
    final ranks = _view.myRanks(widget.mySeat);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
      ),
      child: Row(
        children: [
          const Text('Ask for', style: TextStyle(color: AppColors.textSecondary, fontSize: 11)),
          const SizedBox(width: 8),
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final r in ranks)
                    Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: ChoiceChip(
                        label: Text(r),
                        selected: _pickedRank == r,
                        onSelected: (_) {
                          GameFeedback.tap();
                          setState(() => _pickedRank = r);
                        },
                        labelStyle: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          color: _pickedRank == r ? Colors.black : AppColors.textSecondary,
                        ),
                        selectedColor: AppColors.softCyan,
                        backgroundColor: Colors.white.withValues(alpha: 0.07),
                        side: BorderSide(color: Colors.white.withValues(alpha: 0.14)),
                        visualDensity: VisualDensity.compact,
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: (_pickedRank != null && _pickedTarget != null) ? _ask : null,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
              decoration: BoxDecoration(
                gradient: (_pickedRank != null && _pickedTarget != null)
                    ? const LinearGradient(colors: [AppColors.electricPurple, AppColors.softCyan])
                    : null,
                color: (_pickedRank != null && _pickedTarget != null)
                    ? null
                    : Colors.white.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(9),
              ),
              child: Text(
                _pickedTarget == null ? 'Pick a rival' : 'Ask!',
                style: TextStyle(
                  color: (_pickedRank != null && _pickedTarget != null) ? Colors.white : AppColors.textMuted,
                  fontSize: 11.5,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _myHand(_FishView view) {
    final hand = widget.mySeat < view.hands.length ? view.hands[widget.mySeat] : const <String>[];
    if (hand.isEmpty) {
      return Center(
        child: Text(
          _myTurn ? 'Out of cards — the pond refills you' : 'No cards in hand',
          style: const TextStyle(color: AppColors.textMuted, fontSize: 11.5),
        ),
      );
    }
    return ListView.separated(
      scrollDirection: Axis.horizontal,
      itemCount: hand.length,
      separatorBuilder: (_, __) => const SizedBox(width: 5),
      itemBuilder: (context, i) => _cardFace(hand[i], picked: false),
    );
  }

  Widget _cardFace(String code, {required bool picked}) {
    final rank = code.length >= 2 ? code.substring(0, code.length - 1) : code;
    final suit = code.isNotEmpty ? code.substring(code.length - 1) : '';
    final red = suit == 'H' || suit == 'D';
    final suitChar = switch (suit) {
      'S' => '♠',
      'H' => '♥',
      'D' => '♦',
      'C' => '♣',
      _ => '·',
    };
    return Container(
      width: 44,
      height: 62,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(7),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Colors.white, Color(0xFFE9EAF2), Color(0xFFCDD0DE)],
        ),
        border: Border.all(
          color: picked ? AppColors.softCyan : Colors.black26,
          width: picked ? 2 : 1,
        ),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.45), blurRadius: 5, offset: const Offset(0, 3)),
        ],
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            rank,
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w900,
              color: red ? const Color(0xFFC0392B) : const Color(0xFF1A1A24),
            ),
          ),
          Text(
            suitChar,
            style: TextStyle(
              fontSize: 13,
              color: red ? const Color(0xFFC0392B) : const Color(0xFF1A1A24),
            ),
          ),
        ],
      ),
    );
  }

  String _eventText(_FishEvent e) {
    final name = e.seat < widget.session.seats.length ? widget.session.seats[e.seat].displayName : 'P${e.seat}';
    final who = e.seat == widget.mySeat ? 'You' : name;
    switch (e.kind) {
      case 'ask_hit':
        return '$who took ${e.received} ${e.rank}${e.received == 1 ? '' : 's'} — asking again!';
      case 'go_fish':
        return '$who guessed wrong — go fish!';
      case 'lucky_draw':
        return '$who fished exactly a ${e.rank} — go again!';
      case 'book':
        return '$who laid down a book of ${e.rank}s!';
      case 'empty_hand':
        return '$who ran dry';
      default:
        return '';
    }
  }

  String _statusText(_FishView view) {
    if (!widget.session.isInProgress) {
      if (widget.session.winnerSeat == widget.mySeat) return 'Most books on the table — you win!';
      return widget.session.winnerSeat != null ? 'They hooked more books…' : 'Game over';
    }
    if (!_myTurn) return 'Waiting for their question…';
    if (_pickedRank != null && _pickedTarget != null) return 'Ready — fire the ask!';
    if (_pickedRank != null) return 'Now tap a rival to ask';
    return 'Pick a rank from your hand';
  }
}
