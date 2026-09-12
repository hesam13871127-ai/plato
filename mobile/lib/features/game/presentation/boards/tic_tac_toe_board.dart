import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Parsed tic-tac-toe view.
class _XoView {
  _XoView(Map<String, dynamic> b)
      : cells = _cells(b['cells']),
        lastMove = _move(b['lastMove']),
        winLine = _nums(b['winLine']),
        log = _log(b['log']);

  final List<int> cells; // 9 cells row-major; 0 empty, 1 = X (seat 0), 2 = O
  final _Move? lastMove;
  final List<int> winLine;
  final List<String> log;

  static List<int> _cells(Object? raw) =>
      ((raw as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();

  static List<int> _nums(Object? raw) =>
      ((raw as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();

  static _Move? _move(Object? raw) {
    if (raw == null) return null;
    final m = raw as Map;
    return _Move(
      (m['seat'] as num?)?.toInt() ?? 0,
      (m['idx'] as num?)?.toInt() ?? -1,
    );
  }

  static List<String> _log(Object? raw) =>
      ((raw as List?) ?? const []).whereType<String>().toList();
}

class _Move {
  const _Move(this.seat, this.idx);
  final int seat;
  final int idx;
}

/// Tic-Tac-Toe, wave-7 board.
///
/// Nine large squares on the felt; X glows soft cyan, O glows electric
/// purple. The last mark lands with a pulse, the winning line floods gold.
class TicTacToeBoard extends StatefulWidget {
  const TicTacToeBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<TicTacToeBoard> createState() => _TicTacToeBoardState();
}

class _TicTacToeBoardState extends State<TicTacToeBoard> {
  String _skin = 'wood';

  _XoView get _view => _XoView(widget.session.board);

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  int get _myDisc => widget.mySeat + 1;

  Future<void> _place(int idx) async {
    if (!_myTurn) return;
    if ((_view.cells.length > idx ? _view.cells[idx] : 0) != 0) return;
    GameFeedback.tap();
    await widget.onAction('place', {'idx': idx});
  }

  @override
  Widget build(BuildContext context) {
    final view = _view;
    final skin = BoardSkin.byId(_skin);
    final cells = view.cells.isEmpty ? List<int>.filled(9, 0) : view.cells;

    return Column(
      children: [
        TurnIndicator(
          text: _statusText(view, cells),
          highlight: _myTurn,
          icon: Icons.threesixthree_rounded,
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
              _scoreRow(cells),
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
                    child: Column(
                      children: [
                        for (var r = 0; r < 3; r++)
                          Expanded(
                            child: Row(
                              children: [
                                for (var c = 0; c < 3; c++) _cell(cells, view, r * 3 + c),
                              ],
                            ),
                          ),
                      ],
                    ),
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

  Widget _cell(List<int> cells, _XoView view, int idx) {
    final disc = cells.length > idx ? cells[idx] : 0;
    final winning = view.winLine.contains(idx);
    final isLast = view.lastMove != null && view.lastMove!.idx == idx;
    final tap = _myTurn && disc == 0 ? () => _place(idx) : null;

    return Expanded(
      child: GestureDetector(
        onTap: tap,
        child: Container(
          margin: const EdgeInsets.all(3),
          decoration: BoxDecoration(
            color: winning
                ? const Color(0xFFF5C542).withValues(alpha: 0.22)
                : Colors.white.withValues(alpha: disc == 0 ? 0.05 : 0.07),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: winning
                  ? const Color(0xFFF5C542)
                  : isLast
                      ? AppColors.softCyan.withValues(alpha: 0.7)
                      : Colors.white.withValues(alpha: 0.10),
              width: winning || isLast ? 1.8 : 1,
            ),
            boxShadow: winning
                ? [BoxShadow(color: const Color(0xFFF5C542).withValues(alpha: 0.35), blurRadius: 10)]
                : null,
          ),
          child: Center(
            child: disc == 0
                ? (tap != null
                    ? Container(
                        width: 10,
                        height: 10,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(color: AppColors.softCyan.withValues(alpha: 0.35), width: 1.4),
                        ),
                      )
                    : null)
                : CustomPaint(
                    painter: _MarkPainter(
                      isX: disc == 1,
                      color: disc == 1 ? AppColors.softCyan : AppColors.electricPurple,
                      glow: isLast || winning,
                    ),
                    size: const Size(44, 44),
                  ),
          ),
        ),
      ),
    );
  }

  Widget _scoreRow(List<int> cells) {
    final xCount = cells.where((c) => c == 1).length;
    final oCount = cells.where((c) => c == 2).length;
    return Row(
      children: [
        Expanded(child: _chip(_seatLabel(0), 'X · $xCount', 0, const Color(0xFF22D3EE))),
        const SizedBox(width: 10),
        Expanded(child: _chip(_seatLabel(1), 'O · $oCount', 1, AppColors.electricPurple)),
      ],
    );
  }

  Widget _chip(String name, String meta, int seat, Color tint) {
    final active = widget.session.currentSeat == seat && widget.session.isInProgress;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: active ? tint.withValues(alpha: 0.16) : Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: active ? tint : Colors.white.withValues(alpha: 0.12)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              name,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w700),
            ),
          ),
          Text(meta, style: TextStyle(color: tint, fontSize: 13, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }

  String _statusText(_XoView view, List<int> cells) {
    if (!widget.session.isInProgress) {
      if (widget.session.winnerSeat == null) return 'Full board — a draw';
      return widget.session.winnerSeat == widget.mySeat ? 'Line of three — you win!' : 'They claimed the line…';
    }
    if (!_myTurn) return 'Hold tight — their mark is coming…';
    return 'Tap a square to drop your ${_myDisc == 1 ? 'X' : 'O'}';
  }

  String _seatLabel(int seat) {
    if (seat >= widget.session.seats.length) return 'Seat ${seat + 1}';
    return seat == widget.mySeat ? 'You' : widget.session.seats[seat].displayName;
  }
}

// ── the X and O marks ───────────────────────────────────────────────────────

class _MarkPainter extends CustomPainter {
  _MarkPainter({required this.isX, required this.color, required this.glow});

  final bool isX;
  final Color color;
  final bool glow;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final paint = Paint()
      ..color = color
      ..strokeWidth = 6.5
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;
    if (glow) {
      canvas.save();
      final glowPaint = Paint()
        ..color = color.withValues(alpha: 0.25)
        ..strokeWidth = 12
        ..strokeCap = StrokeCap.round
        ..style = PaintingStyle.stroke;
      _draw(canvas, w, h, glowPaint);
      canvas.restore();
    }
    _draw(canvas, w, h, paint);
  }

  void _draw(Canvas canvas, double w, double h, Paint paint) {
    final margin = w * 0.18;
    if (isX) {
      canvas.drawLine(Offset(margin, margin), Offset(w - margin, h - margin), paint);
      canvas.drawLine(Offset(w - margin, margin), Offset(margin, h - margin), paint);
    } else {
      canvas.drawCircle(Offset(w / 2, h / 2), (w - margin * 2) / 2, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _MarkPainter old) =>
      old.isX != isX || old.color != color || old.glow != glow;
}
