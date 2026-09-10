import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Parsed gomoku view.
class _GomokuView {
  _GomokuView(Map<String, dynamic> b)
      : grid = _grid(b['grid']),
        lastMove = _move(b['lastMove']),
        winningLine = _line(b['winningLine']),
        log = _log(b['log']);

  final List<int> grid; // 225 cells, row-major; 0 empty, 1 black, 2 white
  final _Move? lastMove;
  final List<int> winningLine;
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
    );
  }

  static List<int> _line(Object? raw) =>
      ((raw as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();

  static List<String> _log(Object? raw) =>
      ((raw as List?) ?? const []).whereType<String>().toList();

  int at(int x, int y) => (y * 15 + x) < grid.length ? grid[y * 15 + x] : 0;
}

class _Move {
  const _Move(this.seat, this.x, this.y);
  final int seat;
  final int x;
  final int y;
}

/// Gomoku, wave-6 board.
///
/// Five in a row on a go-style grid: tap an intersection to drop your stone
/// and try to connect five before your opponent does.
class GomokuBoard extends StatefulWidget {
  const GomokuBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<GomokuBoard> createState() => _GomokuBoardState();
}

class _GomokuBoardState extends State<GomokuBoard> {
  String _skin = 'wood';

  _GomokuView get _view => _GomokuView(widget.session.board);

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

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
          icon: Icons.grid_on_rounded,
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
              _turnRow(),
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
                    child: LayoutBuilder(
                      builder: (context, constraints) {
                        final size = constraints.biggest;
                        return GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTapUp: (d) {
                            if (!_myTurn) return;
                            final pad = size.width * 0.03;
                            final step = (size.width - pad * 2) / 14;
                            final gx = ((d.localPosition.dx - pad) / step).round();
                            final gy = ((d.localPosition.dy - pad) / step).round();
                            if (gx < 0 || gx > 14 || gy < 0 || gy > 14) return;
                            if (view.at(gx, gy) != 0) return;
                            _place(gx, gy);
                          },
                          child: CustomPaint(
                            painter: _GomokuPainter(view: view),
                            size: Size.infinite,
                          ),
                        );
                      },
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

  Widget _turnRow() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        _stoneDot(1),
        const SizedBox(width: 6),
        Text(
          widget.mySeat == 0 ? 'You (black)' : (widget.session.seats.isNotEmpty ? widget.session.seats[0].displayName : 'Black'),
          style: TextStyle(
            color: widget.session.currentSeat == 0 && widget.session.isInProgress ? AppColors.softCyan : AppColors.textSecondary,
            fontSize: 11,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(width: 12),
        Text('vs', style: const TextStyle(color: AppColors.textSecondary, fontSize: 10)),
        const SizedBox(width: 12),
        _stoneDot(2),
        const SizedBox(width: 6),
        Text(
          widget.mySeat == 1 ? 'You (white)' : (widget.session.seats.length > 1 ? widget.session.seats[1].displayName : 'White'),
          style: TextStyle(
            color: widget.session.currentSeat == 1 && widget.session.isInProgress ? AppColors.softCyan : AppColors.textSecondary,
            fontSize: 11,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    );
  }

  Widget _stoneDot(int disc) {
    final black = disc == 1;
    return Container(
      width: 14,
      height: 14,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: black
            ? const LinearGradient(colors: [Color(0xFF4A4A52), Color(0xFF0B0B0F)])
            : const LinearGradient(colors: [Colors.white, Color(0xFFC6C6D0)]),
      ),
    );
  }

  String _statusText(_GomokuView view) {
    if (!widget.session.isInProgress) {
      if (widget.session.winnerSeat == null) return 'A full board — drawn';
      return widget.session.winnerSeat == widget.mySeat ? 'Five in a row — you win!' : 'They connected five first…';
    }
    if (!_myTurn) return 'Waiting for their stone…';
    final last = view.lastMove;
    if (last != null && last.seat != widget.mySeat) return 'Answer their threat — place your stone';
    return 'Place a stone — build toward five';
  }
}

// ── painter ─────────────────────────────────────────────────────────────────

class _GomokuPainter extends CustomPainter {
  _GomokuPainter({required this.view});

  final _GomokuView view;

  static const _n = 15;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final pad = w * 0.03;
    final step = (w - pad * 2) / (_n - 1);

    Offset pointAt(int x, int y) => Offset(pad + x * step, pad + y * step);

    // Wood board.
    canvas.drawRect(Offset.zero & size, Paint()..color = const Color(0xFFD9B380));
    final grain = Paint()..color = Colors.white.withValues(alpha: 0.05);
    for (var i = 0; i < 20; i++) {
      final y0 = (i / 20) * h;
      canvas.drawRect(Rect.fromLTWH(0, y0, w, h / 40), grain);
    }

    // Grid lines.
    final line = Paint()
      ..color = const Color(0xFF5A4226)
      ..strokeWidth = 1;
    for (var i = 0; i < _n; i++) {
      canvas.drawLine(pointAt(0, i), pointAt(_n - 1, i), line);
      canvas.drawLine(pointAt(i, 0), pointAt(i, _n - 1), line);
    }
    // Star points.
    final star = Paint()..color = const Color(0xFF5A4226);
    for (final (sx, sy) in [(3, 3), (11, 3), (7, 7), (3, 11), (11, 11)]) {
      final p = pointAt(sx, sy);
      canvas.drawCircle(p, step * 0.09, star);
    }

    // Winning line ribbon.
    if (view.winningLine.isNotEmpty) {
      final paint = Paint()
        ..color = AppColors.softCyan.withValues(alpha: 0.5)
        ..strokeWidth = step * 0.28
        ..strokeCap = StrokeCap.round;
      final cells = view.winningLine;
      final first = pointAt(cells.first % _n, cells.first ~/ _n);
      final last = pointAt(cells.last % _n, cells.last ~/ _n);
      canvas.drawLine(first, last, paint);
    }

    // Stones.
    for (var y = 0; y < _n; y++) {
      for (var x = 0; x < _n; x++) {
        final disc = view.at(x, y);
        if (disc == 0) continue;
        final p = pointAt(x, y);
        final r = step * 0.42;
        canvas.drawCircle(p + Offset(0, r * 0.15), r, Paint()..color = Colors.black.withValues(alpha: 0.35));
        canvas.drawCircle(
          p,
          r,
          Paint()
            ..shader = RadialGradient(
              center: const Alignment(-0.3, -0.3),
              colors: disc == 1
                  ? [const Color(0xFF5A5A64), const Color(0xFF111116), const Color(0xFF000000)]
                  : [Colors.white, const Color(0xFFEDEDF2), const Color(0xFFB8B8C4)],
            ).createShader(Rect.fromCircle(center: p, radius: r)),
        );
        // Last-move marker.
        final lm = view.lastMove;
        if (lm != null && lm.x == x && lm.y == y) {
          canvas.drawCircle(
            p,
            r * 0.85,
            Paint()
              ..style = PaintingStyle.stroke
              ..strokeWidth = 1.6
              ..color = disc == 1 ? Colors.white : const Color(0xFF22222A),
          );
        }
      }
    }
  }

  @override
  bool shouldRepaint(covariant _GomokuPainter old) =>
      old.view.lastMove != view.lastMove ||
      old.view.winningLine.length != view.winningLine.length;
}
