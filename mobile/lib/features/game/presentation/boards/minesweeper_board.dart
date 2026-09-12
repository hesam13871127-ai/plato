import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Parsed minesweepers view (mine map is server-side and never broadcast).
class _MineView {
  _MineView(Map<String, dynamic> b)
      : revealed = _flags(b['revealed']),
        visible = _nums(b['visible']),
        flags = _seatFlags(b['flags']),
        eliminated = _flags(b['eliminated']),
        lastReveal = _last(b['lastReveal']);

  final List<bool> revealed;
  final List<int> visible; // -1 covered, -2 exploded mine, else adjacent count
  final List<int?> flags; // seat number or null
  final List<bool> eliminated;
  final _LastReveal? lastReveal;

  static const size = 12;

  static List<bool> _flags(Object? raw) =>
      ((raw as List?) ?? const []).map((e) => e == true).toList();

  static List<int> _nums(Object? raw) =>
      ((raw as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();

  static List<int?> _seatFlags(Object? raw) =>
      ((raw as List?) ?? const []).map((e) => e == null ? null : (e as num).toInt()).toList();

  static _LastReveal? _last(Object? raw) {
    if (raw == null) return null;
    final m = raw as Map;
    return _LastReveal(
      (m['seat'] as num?)?.toInt() ?? 0,
      (m['index'] as num?)?.toInt() ?? 0,
      m['hitMine'] == true,
      ((m['cleared'] as List?) ?? const []).length,
    );
  }

  bool inRange(int i) => i >= 0 && i < revealed.length;
}

class _LastReveal {
  const _LastReveal(this.seat, this.index, this.hitMine, this.cleared);
  final int seat;
  final int index;
  final bool hitMine;
  final int cleared;
}

/// Minesweepers — one shared field, one dig per turn.
///
/// Safe cells glow green once cleared and show their mine counts; flags are
/// personal markers (long-press). Dig a mine and your seat explodes with its
/// score locked. Highest score on a cleared field — or the last player
/// breathing — takes the round.
class MinesweeperBoard extends StatefulWidget {
  const MinesweeperBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<MinesweeperBoard> createState() => _MinesweeperBoardState();
}

class _MinesweeperBoardState extends State<MinesweeperBoard> {
  Future<void> _reveal(int index) async {
    GameFeedback.tap();
    await widget.onAction('reveal', {'index': index});
  }

  Future<void> _flag(int index) async {
    GameFeedback.tap();
    await widget.onAction('flag', {'index': index});
  }

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  @override
  Widget build(BuildContext context) {
    final view = _MineView(widget.session.board);
    final score = widget.mySeat < widget.session.scores.length
        ? widget.session.scores[widget.mySeat]
        : 0;

    return Column(
      children: [
        TurnIndicator(
          text: _statusText(view),
          highlight: _myTurn,
          icon: Icons.public_off_outlined,
        ),
        const SizedBox(height: 8),
        _scoreStrip(view),
        const SizedBox(height: 10),
        TableSurface(
          child: Column(
            children: [
              Row(
                children: [
                  _pill(Icons.emoji_events_outlined, 'Score', '$score'),
                  const SizedBox(width: 8),
                  _pill(Icons.grid_on_rounded, 'Cleared',
                      '${view.revealed.where((r) => r).length}/${_MineView.size * _MineView.size}'),
                ],
              ),
              const SizedBox(height: 10),
              AspectRatio(
                aspectRatio: 1,
                child: Container(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    gradient: const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [Color(0xFF2E2A18), Color(0xFF1C1A10), Color(0xFF12100A)],
                    ),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.14)),
                    boxShadow: [
                      BoxShadow(color: Colors.black.withValues(alpha: 0.5), blurRadius: 14, offset: const Offset(0, 6)),
                    ],
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: GridView.count(
                      physics: const NeverScrollableScrollPhysics(),
                      padding: const EdgeInsets.all(3),
                      crossAxisCount: _MineView.size,
                      childAspectRatio: 1,
                      children: [
                        for (var i = 0; i < _MineView.size * _MineView.size; i++) _cell(view, i),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Tap a cell to dig · long-press to plant or pull a flag',
                style: TextStyle(color: AppColors.textMuted, fontSize: 10.5),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _cell(_MineView view, int i) {
    if (!view.inRange(i)) return const SizedBox.shrink();
    final revealed = view.revealed[i];
    final visible = i < view.visible.length ? view.visible[i] : -1;
    final flagged = i < view.flags.length ? view.flags[i] : null;
    final exploded = visible == -2;
    final justHit = view.lastReveal != null &&
        view.lastReveal!.hitMine &&
        view.lastReveal!.index == i;
    final justCleared = view.lastReveal != null &&
        !view.lastReveal!.hitMine &&
        (view.lastReveal!.index == i);

    const countColors = [
      Color(0xFF7DD3FC), Color(0xFF86EFAC), Color(0xFFFCD34D), Color(0xFFFCA5A5),
      Color(0xFFF0ABFC), Color(0xFFC4B5FD), Color(0xFF5EEAD4), Color(0xFFFDBA74),
    ];

    return GestureDetector(
      onTap: (_myTurn && !revealed) ? () => _reveal(i) : null,
      onLongPress: (_myTurn && !revealed) ? () => _flag(i) : null,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        margin: const EdgeInsets.all(1),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(2.5),
          gradient: revealed
              ? null
              : const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0xFF4A4430), Color(0xFF2E2A1C)],
                ),
          color: revealed
              ? (exploded
                  ? const Color(0xFF7F1D1D)
                  : const Color(0xFF123524).withValues(alpha: 0.85))
              : null,
          border: Border.all(
            color: justHit
                ? Colors.redAccent
                : exploded
                    ? Colors.redAccent.withValues(alpha: 0.7)
                    : justCleared
                        ? AppColors.softCyan.withValues(alpha: 0.8)
                        : Colors.white.withValues(alpha: 0.05),
            width: (justHit || justCleared) ? 1.6 : 0.8,
          ),
        ),
        child: Center(
          child: exploded
              ? const Text('💥', style: TextStyle(fontSize: 10))
              : revealed && visible >= 0
                  ? Text(
                      '$visible',
                      style: TextStyle(
                        fontSize: 9.5,
                        fontWeight: FontWeight.w900,
                        color: countColors[visible.clamp(0, 7).toInt()],
                      ),
                    )
                  : flagged != null
                      ? Text(
                          '🚩',
                          style: TextStyle(
                            fontSize: 9.5,
                            // Your own flags pop; rivals' flags are muted.
                            color: flagged == widget.mySeat ? Colors.white : Colors.white60,
                          ),
                        )
                      : null,
        ),
      ),
    );
  }

  Widget _scoreStrip(_MineView view) {
    return Row(
      children: [
        for (var s = 0; s < widget.session.seats.length; s++)
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(right: s == widget.session.seats.length - 1 ? 0 : 6),
              child: _playerCard(view, s),
            ),
          ),
      ],
    );
  }

  Widget _playerCard(_MineView view, int seat) {
    final mine = seat == widget.mySeat;
    final active = widget.session.currentSeat == seat && widget.session.isInProgress;
    final out = seat < view.eliminated.length && view.eliminated[seat];
    final score = seat < widget.session.scores.length ? widget.session.scores[seat] : 0;
    final name = seat < widget.session.seats.length ? widget.session.seats[seat].displayName : 'P$seat';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: out
            ? Colors.white.withValues(alpha: 0.03)
            : active
                ? AppColors.electricPurple.withValues(alpha: 0.3)
                : Colors.white.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: out
              ? Colors.white.withValues(alpha: 0.06)
              : active
                  ? AppColors.softCyan
                  : Colors.white.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  mine ? 'You' : name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: out ? AppColors.textMuted : AppColors.textSecondary,
                    fontSize: 10.5,
                    fontWeight: FontWeight.w700,
                    decoration: out ? TextDecoration.lineThrough : null,
                  ),
                ),
              ),
              Text(
                out ? '💥' : '$score',
                style: TextStyle(
                  color: out ? AppColors.textMuted : Colors.white,
                  fontSize: 13,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _pill(IconData icon, String label, String value) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
        ),
        child: Row(
          children: [
            Icon(icon, size: 14, color: AppColors.softCyan),
            const SizedBox(width: 6),
            Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 11)),
            const Spacer(),
            Text(value, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w800)),
          ],
        ),
      ),
    );
  }

  String _statusText(_MineView view) {
    if (!widget.session.isInProgress) {
      if (widget.session.winnerSeat == widget.mySeat) return 'Field cleared — you take the round!';
      return widget.session.winnerSeat != null ? 'They cleared your minefield…' : 'Round over';
    }
    if (!_myTurn) {
      final out = widget.mySeat < view.eliminated.length && view.eliminated[widget.mySeat];
      return out ? 'You blew up — watching the rest dig…' : 'Waiting for their dig…';
    }
    final last = view.lastReveal;
    if (last != null && last.seat == widget.mySeat && !last.hitMine) {
      return '+$last point${last.cleared == 1 ? '' : 's'} — nice pocket!';
    }
    return 'Pick a cell and dig carefully';
  }
}
