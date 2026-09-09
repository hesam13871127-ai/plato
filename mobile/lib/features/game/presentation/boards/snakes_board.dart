import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../../../core/widgets/piece_3d.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Parsed snakes & ladders view.
class _SlView {
  _SlView(Map<String, dynamic> b)
      : positions = _nums(b['positions']),
        dice = (b['dice'] as num?)?.toInt(),
        lastMove = _lastMove(b['lastMove']);

  final List<int> positions;
  final int? dice;
  final _LastMove? lastMove;

  static List<int> _nums(Object? raw) => ((raw as List?) ?? const [])
      .whereType<num>()
      .map((n) => n.toInt())
      .toList();

  static _LastMove? _lastMove(Object? raw) {
    final m = raw as Map?;
    if (m == null) return null;
    int? pair(Object? v) => v is List && v.length == 2 && v[0] is num ? (v[0] as num).toInt() : null;
    return _LastMove(
      (m['seat'] as num?)?.toInt() ?? 0,
      (m['roll'] as num?)?.toInt() ?? 0,
      (m['from'] as num?)?.toInt() ?? 0,
      (m['to'] as num?)?.toInt() ?? 0,
      m['bounced'] == true,
      pair(m['snake']),
      pair(m['ladder']),
      m['won'] == true,
    );
  }
}

class _LastMove {
  const _LastMove(this.seat, this.roll, this.from, this.to, this.bounced, this.snakeHead, this.ladderBottom, this.won);
  final int seat;
  final int roll;
  final int from;
  final int to;
  final bool bounced;
  final int? snakeHead; // head cell of the ridden snake
  final int? ladderBottom; // bottom cell of the climbed ladder
  final bool won;
}

/// Classic board map — mirrored exactly from the engine.
const _ladders = <int, int>{
  1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100,
};
const _snakes = <int, int>{
  16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78,
};

const _palettes = <PiecePalette>[
  PiecePalette.cyan,
  PiecePalette.purple,
  PiecePalette.yellow,
  PiecePalette.green,
];

/// Snakes & Ladders, wave-2 3D board.
///
/// The classic 10×10 boustrophedon track with hand-drawn snakes coiling from
/// head to tail and ladders strung between rungs. Seats roll the big die
/// (a 6 rolls again), ladders splash green, snakes flash red, overshoots
/// bounce off 100 and the first to land exactly wins.
class SnakesBoard extends StatefulWidget {
  const SnakesBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<SnakesBoard> createState() => _SnakesBoardState();
}

class _SnakesBoardState extends State<SnakesBoard> with SingleTickerProviderStateMixin {
  String _skin = 'wood';

  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 700),
  );

  _SlView get _view => _SlView(widget.session.board);

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  @override
  void initState() {
    super.initState();
    _pulse.repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  Future<void> _roll() async {
    if (!_myTurn) return;
    GameFeedback.tap();
    await widget.onAction('roll', {});
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
          icon: Icons.casino_rounded,
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
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  for (var seat = 0; seat < view.positions.length && seat < 4; seat++)
                    _Tray(
                      palette: _palettes[seat % _palettes.length],
                      label: _seatLabel(seat),
                      cell: view.positions[seat],
                      mine: seat == widget.mySeat,
                    ),
                ],
              ),
              const SizedBox(height: 10),
              AspectRatio(
                aspectRatio: 1,
                child: Container(
                  padding: const EdgeInsets.all(5),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
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
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.5),
                        blurRadius: 16,
                        offset: const Offset(0, 8),
                      ),
                    ],
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: CustomPaint(
                      size: Size.infinite,
                      painter: _SlPainter(view: view, pulse: _pulse.value),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              _diceRow(view),
            ],
          ),
        ),
      ],
    );
  }

  Widget _diceRow(_SlView view) {
    return Row(
      children: [
        const SizedBox(width: 4),
        Container(
          width: 52,
          height: 52,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            gradient: const LinearGradient(
              colors: [Color(0xFFFDFBF4), Color(0xFFD8D2C4)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            border: Border.all(color: Colors.white.withValues(alpha: 0.6)),
            boxShadow: [
              BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 8, offset: const Offset(0, 3)),
            ],
          ),
          child: Center(
            child: Text(
              view.dice != null ? '${view.dice}' : '?',
              style: const TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.w900,
                color: Color(0xFF2A2A33),
              ),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: ElevatedButton(
            onPressed: _myTurn ? _roll : null,
            style: ElevatedButton.styleFrom(
              backgroundColor: _myTurn ? AppColors.electricPurple : Colors.white.withValues(alpha: 0.08),
              foregroundColor: Colors.white,
              disabledForegroundColor: Colors.white38,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              elevation: _myTurn ? 6 : 0,
            ),
            child: Text(
              _myTurn ? 'ROLL THE DIE' : 'WAITING…',
              style: const TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1.2, fontSize: 14),
            ),
          ),
        ),
        const SizedBox(width: 4),
      ],
    );
  }

  String _statusText(_SlView view) {
    if (!widget.session.isInProgress) {
      final winner = view.lastMove?.seat;
      return winner != null ? 'Seat ${winner + 1} reached 100 — game over' : 'Game over';
    }
    final last = view.lastMove;
    if (last != null && last.seat == widget.session.currentSeat && last.roll == 6 && !last.won) {
      return 'Rolled a 6 — roll again!';
    }
    if (!_myTurn) return 'Waiting for the table…';
    if (last != null && last.ladderBottom != null) return 'Ladder climb! Keep rolling';
    if (last != null && last.snakeHead != null) return 'Snake bite! Shake it off';
    return 'Your roll — chase the ladders';
  }

  String _seatLabel(int seat) {
    if (seat >= widget.session.seats.length) return 'Seat ${seat + 1}';
    return seat == widget.mySeat ? 'You' : widget.session.seats[seat].displayName;
  }
}

// ── tray ────────────────────────────────────────────────────────────────────

class _Tray extends StatelessWidget {
  const _Tray({required this.palette, required this.label, required this.cell, required this.mine});

  final PiecePalette palette;
  final String label;
  final int cell;
  final bool mine;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 13,
          height: 13,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: RadialGradient(
              center: const Alignment(-0.3, -0.4),
              colors: [palette.light, palette.base, palette.dark],
            ),
          ),
        ),
        const SizedBox(width: 4),
        Text(
          '$label · $cell',
          style: TextStyle(
            color: mine ? AppColors.softCyan : AppColors.textSecondary,
            fontSize: 11,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    );
  }
}

// ── painter ─────────────────────────────────────────────────────────────────

class _SlPainter extends CustomPainter {
  _SlPainter({required this.view, required this.pulse});

  final _SlView view;
  final double pulse;

  /// Cell 1..100 → grid coordinates (col, rowFromTop) on a 10×10 lattice.
  static int _col(int cell) {
    final i = cell - 1;
    final br = i ~/ 10; // board row from the bottom
    return br % 2 == 0 ? i % 10 : 9 - (i % 10);
  }

  static int _rowTop(int cell) => 9 - ((cell - 1) ~/ 10);

  @override
  void paint(Canvas canvas, Size size) {
    final cell = size.width / 10;
    Offset center(int cellN) => Offset(
          (_col(cellN) + 0.5) * cell,
          (_rowTop(cellN) + 0.5) * cell,
        );

    // Chequer cells.
    for (var r = 0; r < 10; r++) {
      for (var c = 0; c < 10; c++) {
        final light = (r + c) % 2 == 0;
        final paint = Paint()
          ..color = light
              ? const Color(0xFFEFE3C2).withValues(alpha: 0.9)
              : const Color(0xFFD9C69A).withValues(alpha: 0.9);
        canvas.drawRect(Rect.fromLTWH(c * cell, r * cell, cell, cell), paint);
      }
    }

    // Ladders (green rungs).
    final ladderPaint = Paint()
      ..strokeWidth = cell * 0.075
      ..color = const Color(0xFF2E9E5B)
      ..strokeCap = StrokeCap.round;
    final rungPaint = Paint()
      ..strokeWidth = cell * 0.05
      ..color = const Color(0xFF2E9E5B).withValues(alpha: 0.85)
      ..strokeCap = StrokeCap.round;
    for (final entry in _ladders.entries) {
      final a = center(entry.key);
      final b = center(entry.value);
      final dir = (b - a) / ((b - a).distance);
      final perp = Offset(-dir.dy, dir.dx) * cell * 0.18;
      canvas.drawLine(a + perp, b + perp, ladderPaint);
      canvas.drawLine(a - perp, b - perp, ladderPaint);
      final len = (b - a).distance;
      final rungs = (len / (cell * 0.7)).round();
      for (var i = 1; i <= rungs; i++) {
        final p = a + dir * (len * i / (rungs + 1));
        canvas.drawLine(p - perp, p + perp, rungPaint);
      }
    }

    // Snakes (coiled red curves).
    final snakePaint = Paint()
      ..strokeWidth = cell * 0.09
      ..color = const Color(0xFFC0392B)
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    for (final entry in _snakes.entries) {
      final head = center(entry.key);
      final tail = center(entry.value);
      final mid = (head + tail) / 2;
      final dir = (tail - head) / ((tail - head).distance);
      final ctrl = mid + Offset(-dir.dy, dir.dx) * cell * 1.1;
      final path = Path()
        ..moveTo(head.dx, head.dy)
        ..quadraticBezierTo(ctrl.dx, ctrl.dy, tail.dx, tail.dy);
      canvas.drawPath(path, snakePaint);
      // Head blob + tongue.
      final headPaint = Paint()..color = const Color(0xFF8E2418);
      canvas.drawCircle(head, cell * 0.11, headPaint);
      canvas.drawLine(
        head,
        head + Offset(-dir.dx, -dir.dy) * cell * 0.22,
        snakePaint..strokeWidth = cell * 0.045,
      );
    }

    // Cell numbers (small).
    for (var cellN = 1; cellN <= 100; cellN++) {
      final p = center(cellN);
      final tp = TextPainter(
        text: TextSpan(
          text: '$cellN',
          style: TextStyle(
            color: const Color(0xFF6B5B33).withValues(alpha: 0.75),
            fontSize: cell * 0.26,
            fontWeight: FontWeight.w700,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, p - Offset(tp.width / 2, tp.height / 2));
    }

    // Last-move splash.
    final last = view.lastMove;
    if (last != null && last.to > 0) {
      final splash = view.lastMove!.snakeHead != null
          ? const Color(0xFFC0392B)
          : view.lastMove!.ladderBottom != null
              ? const Color(0xFF2E9E5B)
              : AppColors.softCyan;
      final p = center(last.to);
      final splashPaint = Paint()
        ..color = splash.withValues(alpha: 0.15 + 0.15 * pulse);
      canvas.drawCircle(p, cell * (0.42 + 0.08 * pulse), splashPaint);
    }

    // Tokens: seats stacked with a small offset inside their cell.
    for (var seat = 0; seat < view.positions.length && seat < 4; seat++) {
      final pos = view.positions[seat];
      if (pos < 1 || pos > 100) continue;
      final base = center(pos);
      final offset = Offset(
        (seat % 2 == 0 ? -1 : 1) * cell * 0.16,
        (seat < 2 ? -1 : 1) * cell * 0.16,
      );
      final p = base + offset;
      final palette = _palettes[seat % _palettes.length];
      final shadow = Paint()..color = Colors.black.withValues(alpha: 0.35);
      canvas.drawOval(
        Rect.fromCenter(center: p + const Offset(0.5, 1), width: cell * 0.42, height: cell * 0.3),
        shadow,
      );
      final body = Paint()
        ..shader = RadialGradient(
          center: const Alignment(-0.35, -0.45),
          radius: 1.1,
          colors: [palette.light, palette.base, palette.dark],
          stops: const [0.0, 0.55, 1.0],
        ).createShader(Rect.fromCircle(center: p, radius: cell * 0.19));
      canvas.drawCircle(p, cell * 0.19, body);
      final rim = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..color = Colors.white.withValues(alpha: 0.4);
      canvas.drawCircle(p, cell * 0.19, rim);
      if (view.lastMove?.seat == seat) {
        final glow = Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.5
          ..color = Colors.white.withValues(alpha: 0.4 + 0.4 * pulse);
        canvas.drawCircle(p, cell * 0.19 + 2.5, glow);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _SlPainter old) => old.view != view || old.pulse != pulse;
}
