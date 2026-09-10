import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Parsed reversi view.
class _RevView {
  _RevView(Map<String, dynamic> b)
      : grid = _grid(b['grid']),
        passes = (b['passes'] as num?)?.toInt() ?? 0,
        lastMove = _move(b['lastMove']),
        log = _log(b['log']);

  final List<int> grid; // 64 cells, row-major; 0 empty, 1 black, 2 white
  final int passes;
  final _Move? lastMove;
  final List<String> log;

  static List<int> _grid(Object? raw) =>
      ((raw as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();

  static _Move? _move(Object? raw) {
    if (raw == null) return null;
    final m = raw as Map;
    return _Move(
      (m['seat'] as num?)?.toInt() ?? 0,
      (m['x'] as num?)?.toInt() ?? 0,
      (m['y'] as num?)?.toInt() ?? 0,
      (m['flipped'] as num?)?.toInt() ?? 0,
    );
  }

  static List<String> _log(Object? raw) =>
      ((raw as List?) ?? const []).whereType<String>().toList();

  int at(int x, int y) => (y * 8 + x) < grid.length ? grid[y * 8 + x] : 0;

  /// Cells that would flip if [disc] lands on (x, y) — empty when illegal.
  List<int> flipsFor(int x, int y, int disc) {
    if (at(x, y) != 0) return const [];
    const dirs = [
      [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];
    final out = <int>[];
    for (final d in dirs) {
      final line = <int>[];
      var cx = x + d[0];
      var cy = y + d[1];
      while (cx >= 0 && cx < 8 && cy >= 0 && cy < 8 && at(cx, cy) == 3 - disc) {
        line.add(cy * 8 + cx);
        cx += d[0];
        cy += d[1];
      }
      if (line.isNotEmpty && cx >= 0 && cx < 8 && cy >= 0 && cy < 8 && at(cx, cy) == disc) {
        out.addAll(line);
      }
    }
    return out;
  }

}

class _Move {
  const _Move(this.seat, this.x, this.y, this.flipped);
  final int seat;
  final int x;
  final int y;
  final int flipped;
}

/// Reversi, wave-6 board.
///
/// The classic sandwich: place a disc to catch a line of enemy discs between
/// yours and flip them all. Legal squares glow; corners are gold.
class ReversiBoard extends StatefulWidget {
  const ReversiBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<ReversiBoard> createState() => _ReversiBoardState();
}

class _ReversiBoardState extends State<ReversiBoard> {
  String _skin = 'wood';

  _RevView get _view => _RevView(widget.session.board);

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  int get _myDisc => widget.mySeat + 1;

  Future<void> _place(int x, int y) async {
    GameFeedback.tap();
    await widget.onAction('place', {'x': x, 'y': y});
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
          icon: Icons.circle_rounded,
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
              const SizedBox(height: 10),
              AspectRatio(
                aspectRatio: 1,
                child: Container(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        Color.lerp(skin.edge, Colors.white, 0.1)!,
                        skin.edge,
                        Color.lerp(skin.edge, Colors.black, 0.5)!,
                      ],
                    ),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.14)),
                    boxShadow: [
                      BoxShadow(color: Colors.black.withValues(alpha: 0.5), blurRadius: 14, offset: const Offset(0, 6)),
                    ],
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: _boardGrid(view),
                  ),
                ),
              ),
              if (view.log.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    view.log.last,
                    style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, fontStyle: FontStyle.italic),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _boardGrid(_RevView view) {
    return Column(
      children: [
        for (var y = 0; y < 8; y++)
          Expanded(
            child: Row(
              children: [
                for (var x = 0; x < 8; x++) Expanded(child: _cell(view, x, y)),
              ],
            ),
          ),
      ],
    );
  }

  Widget _cell(_RevView view, int x, int y) {
    final disc = view.at(x, y);
    final legal = _myTurn && disc == 0 && view.flipsFor(x, y, _myDisc).isNotEmpty;
    final isLast = view.lastMove != null && view.lastMove!.x == x && view.lastMove!.y == y;
    final corner = (x == 0 || x == 7) && (y == 0 || y == 7);

    return GestureDetector(
      onTap: legal ? () => _place(x, y) : null,
      child: Container(
        margin: const EdgeInsets.all(1),
        decoration: BoxDecoration(
          color: const Color(0xFF1E6B3C),
          borderRadius: BorderRadius.circular(3),
          border: Border.all(
            color: isLast
                ? AppColors.softCyan
                : legal
                    ? AppColors.softCyan.withValues(alpha: 0.5)
                    : corner
                        ? const Color(0xFFD9A94A).withValues(alpha: 0.35)
                        : Colors.white.withValues(alpha: 0.06),
            width: isLast ? 1.8 : 1,
          ),
        ),
        child: Center(
          child: disc == 0
              ? (legal
                  ? Container(
                      width: 12,
                      height: 12,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(color: AppColors.softCyan.withValues(alpha: 0.8), width: 1.6),
                      ),
                    )
                  : null)
              : _disc(disc),
        ),
      ),
    );
  }

  Widget _disc(int disc) {
    final black = disc == 1;
    return Container(
      width: 26,
      height: 26,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: black
              ? [const Color(0xFF4A4A52), const Color(0xFF101014), const Color(0xFF000000)]
              : [Colors.white, const Color(0xFFE8E8EC), const Color(0xFFB9B9C4)],
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.5),
            blurRadius: 3,
            offset: const Offset(0, 2),
          ),
        ],
      ),
    );
  }

  Widget _scoreRow(_RevView view) {
    final black = view.grid.where((c) => c == 1).length;
    final white = view.grid.where((c) => c == 2).length;
    return Row(
      children: [
        Expanded(child: _scoreChip('⚫ Black', black, 0)),
        const SizedBox(width: 8),
        Expanded(child: _scoreChip('⚪ White', white, 1)),
      ],
    );
  }

  Widget _scoreChip(String label, int count, int seat) {
    final mine = seat == widget.mySeat;
    final active = widget.session.currentSeat == seat && widget.session.isInProgress;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: active ? AppColors.electricPurple.withValues(alpha: 0.3) : Colors.white.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: active ? AppColors.softCyan : Colors.white.withValues(alpha: 0.12)),
      ),
      child: Row(
        children: [
          Text(
            seat == widget.mySeat ? 'You' : (widget.session.seats.length > seat ? widget.session.seats[seat].displayName : label),
            style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w700),
          ),
          const Spacer(),
          Text(
            '$count',
            style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w900),
          ),
        ],
      ),
    );
  }

  String _statusText(_RevView view) {
    if (!widget.session.isInProgress) {
      if (widget.session.winnerSeat == null) return 'Dead even — a drawn board';
      return widget.session.winnerSeat == widget.mySeat ? 'Majority yours — well flipped!' : 'They out-flanked you…';
    }
    if (!_myTurn) return 'Watching their move…';
    final last = view.lastMove;
    if (last != null && last.seat == widget.mySeat) {
      return 'Flipped ${last.flipped} — their move';
    }
    return 'Place a disc to flip a line';
  }
}
