import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../skins/skinned_pieces.dart';
import '../skins/table_skins.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Ludo on a real 15×15 cross board. The engine tracks each token as linear
/// progress on a 52-cell loop (-1 base, 0–51 track, 52–56 home column, 57
/// finished); this widget maps that to the classic layout: each seat's start
/// cell sits just after its base corner and its home column climbs to the
/// centre. Roll, then tap a glowing token.
class LudoBoard extends StatelessWidget {
  const LudoBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  Map<String, dynamic> get b => session.board;

  /// The 52 track cells in order, starting at seat 0's start (bottom-left
  /// corner arm, moving up). Coordinates are (col, row) on a 15×15 grid.
  static final List<Offset> _track = _buildTrack();

  static List<Offset> _buildTrack() {
    final cells = <Offset>[];
    // Start: left arm bottom row going right? The classic loop (clockwise from
    // seat 0 = red at bottom-left): (6,13) up to (6,9), (5,8)…(0,8), (0,7),
    // (0,6)…(5,6), (6,5)…(6,0), (7,0), (8,0)…(8,5), (9,6)…(14,6), (14,7),
    // (14,8)…(9,8), (8,9)…(8,14), (7,14), (6,14).
    for (var r = 13; r >= 9; r--) {
      cells.add(Offset(6, r.toDouble()));
    }
    for (var c = 5; c >= 0; c--) {
      cells.add(Offset(c.toDouble(), 8));
    }
    cells.add(const Offset(0, 7));
    for (var c = 0; c <= 5; c++) {
      cells.add(Offset(c.toDouble(), 6));
    }
    for (var r = 5; r >= 0; r--) {
      cells.add(Offset(6, r.toDouble()));
    }
    cells.add(const Offset(7, 0));
    for (var r = 0; r <= 5; r++) {
      cells.add(Offset(8, r.toDouble()));
    }
    for (var c = 9; c <= 14; c++) {
      cells.add(Offset(c.toDouble(), 6));
    }
    cells.add(const Offset(14, 7));
    for (var c = 14; c >= 9; c--) {
      cells.add(Offset(c.toDouble(), 8));
    }
    for (var r = 9; r <= 14; r++) {
      cells.add(Offset(8, r.toDouble()));
    }
    cells.add(const Offset(7, 14));
    cells.add(const Offset(6, 14));
    return cells; // 52 cells
  }

  /// Home column cells (5) for each seat, ending next to the centre.
  static const List<List<Offset>> _homeColumns = [
    [Offset(7, 13), Offset(7, 12), Offset(7, 11), Offset(7, 10), Offset(7, 9)], // seat 0 (bottom)
    [Offset(1, 7), Offset(2, 7), Offset(3, 7), Offset(4, 7), Offset(5, 7)], // seat 1 (left)
    [Offset(7, 1), Offset(7, 2), Offset(7, 3), Offset(7, 4), Offset(7, 5)], // seat 2 (top)
    [Offset(13, 7), Offset(12, 7), Offset(11, 7), Offset(10, 7), Offset(9, 7)], // seat 3 (right)
  ];

  /// Base (yard) rectangles per seat: top-left corner in grid units.
  static const List<Offset> _bases = [Offset(0, 9), Offset(0, 0), Offset(9, 0), Offset(9, 9)];

  /// Track index where each seat's start cell is (13 apart, clockwise).
  static const List<int> _starts = [0, 13, 26, 39];

  /// The board corner a seat occupies. The server publishes each seat's
  /// absolute start cell (`startOffset`: 0/13/26/39); we map it to the corner
  /// whose start cell matches so captures line up visually. Falls back to a
  /// sensible layout for older servers.
  int _seatCorner(int seat, int seatCount) {
    final offsets = ((b['startOffset'] as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();
    if (seat < offsets.length) {
      final corner = _starts.indexOf(offsets[seat]);
      if (corner >= 0) return corner;
    }
    if (seatCount == 2) return seat == 0 ? 0 : 2;
    return seat % 4;
  }

  List<List<int>> get _tokens {
    final raw = (b['tokens'] as List?) ?? const [];
    return raw.map<List<int>>((seat) {
      final list = (seat as List?) ?? const [];
      return list.map<int>((t) => ((t is Map ? t['progress'] : null) as num?)?.toInt() ?? -1).toList();
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final tokens = _tokens;
    final seatCount = session.seats.length;
    final die = (b['die'] as num?)?.toInt();
    final hasRolled = (b['hasRolled'] as bool?) ?? false;
    final myTurn = session.isInProgress && session.currentSeat == mySeat;
    final captures = ((b['captures'] as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();
    final playground = TableSkins.playgroundFor(session, mySeat);
    final rollerSeat = session.currentSeat >= 0 ? session.currentSeat : 0;

    return Column(
      children: [
        TurnIndicator(
          text: session.isInProgress
              ? (!myTurn
                  ? '${_name(session.currentSeat)} is playing…'
                  : hasRolled
                      ? 'Tap a glowing token to move'
                      : 'Roll the die!')
              : 'Game over',
          highlight: myTurn,
          icon: Icons.casino_rounded,
        ),
        const SizedBox(height: 6),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              for (var i = 0; i < seatCount; i++)
                _SeatBadge(
                  session: session,
                  seat: i,
                  isMe: i == mySeat,
                  active: session.isInProgress && session.currentSeat == i,
                  home: tokens.length > i ? tokens[i].where((p) => p >= 57).length : 0,
                  captures: i < captures.length ? captures[i] : 0,
                  accent: playground.accent,
                ),
            ],
          ),
        ),
        const SizedBox(height: 4),
        Playground(
          skin: playground,
          padding: const EdgeInsets.all(6),
          child: AspectRatio(
            aspectRatio: 1,
            child: LayoutBuilder(
              builder: (context, constraints) {
                final cell = constraints.maxWidth / 15;
                return Stack(
                  children: [
                    // Static board painting: yards, track, home columns, centre.
                    Positioned.fill(
                      child: CustomPaint(
                        painter: _LudoBoardPainter(
                          playground: playground,
                          seatPalettes: [for (var s = 0; s < 4; s++) _paletteForCorner(s, seatCount)],
                          track: _track,
                        ),
                      ),
                    ),
                    // Tokens.
                    for (var seat = 0; seat < tokens.length; seat++)
                      for (var ti = 0; ti < tokens[seat].length; ti++)
                        _positionedToken(seat, ti, tokens[seat][ti], tokens[seat], cell, seatCount, myTurn && hasRolled, die),
                    // Die in the centre.
                    Positioned(
                      left: cell * 7.5 - 20,
                      top: cell * 7.5 - 20,
                      child: IgnorePointer(
                        child: die != null
                            ? SkinnedDie(skin: TableSkins.diceFor(session, rollerSeat), value: die, size: 40)
                            : SkinnedDie(skin: TableSkins.diceFor(session, rollerSeat), value: 6, size: 40, dim: true),
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: Row(
            children: [
              ActionButton(
                label: 'Roll',
                icon: Icons.casino_rounded,
                onPressed: myTurn && !hasRolled
                    ? () {
                        GameFeedback.roll();
                        onAction('roll', {});
                      }
                    : null,
              ),
              const SizedBox(width: 10),
              ActionButton(
                label: 'Pass',
                icon: Icons.skip_next_rounded,
                color: AppColors.surfaceElevated,
                onPressed: myTurn && hasRolled
                    ? () {
                        GameFeedback.tap();
                        onAction('pass', {});
                      }
                    : null,
              ),
            ],
          ),
        ),
      ],
    );
  }

  String _name(int seat) => seat >= 0 && seat < session.seats.length ? session.seats[seat].displayName : 'Someone';

  /// Palette used to tint a board corner. Corners belonging to a seated player
  /// take that player's piece set colours; empty corners stay neutral.
  _CornerPaint _paletteForCorner(int corner, int seatCount) {
    for (var seat = 0; seat < seatCount; seat++) {
      if (_seatCorner(seat, seatCount) == corner) {
        final p = TableSkins.paletteFor(session, seat);
        return _CornerPaint(p.base, p.light, true);
      }
    }
    return const _CornerPaint(Color(0xFF2A2D55), Color(0xFF3A3E70), false);
  }

  Widget _positionedToken(int seat, int token, int progress, List<int> all, double cell, int seatCount, bool canMove, int? die) {
    final corner = _seatCorner(seat, seatCount);
    Offset gridPos;
    if (progress < 0) {
      // Yard: 2×2 cluster inside the base.
      final base = _bases[corner];
      final dx = token % 2 == 0 ? 1.5 : 3.5;
      final dy = token < 2 ? 1.5 : 3.5;
      gridPos = Offset(base.dx + dx, base.dy + dy);
    } else if (progress >= 57) {
      // Finished: sit in the centre triangle facing the corner.
      const centre = Offset(7.5, 7.5);
      const dirs = [Offset(0, 0.9), Offset(-0.9, 0), Offset(0, -0.9), Offset(0.9, 0)];
      final spread = (token - 1.5) * 0.3;
      final d = dirs[corner];
      gridPos = centre + d + Offset(d.dy.abs() * spread, d.dx.abs() * spread) + const Offset(-0.5, -0.5);
    } else if (progress >= 52) {
      final col = _homeColumns[corner][progress - 52];
      gridPos = col;
    } else {
      final idx = (_starts[corner] + progress) % 52;
      gridPos = _track[idx];
    }
    // Stack offset when several own tokens share a cell.
    final sharing = all.where((p) => p == progress && progress >= 0 && progress < 57).length;
    final order = all.take(token).where((p) => p == progress && progress >= 0 && progress < 57).length;
    final jitter = sharing > 1 ? Offset((order - (sharing - 1) / 2) * 0.22, -(order) * 0.12) : Offset.zero;

    final size = cell * (progress < 0 ? 1.15 : 0.92);
    final canTap = canMove && seat == mySeat && _isMovable(progress, die);
    return AnimatedPositioned(
      duration: const Duration(milliseconds: 320),
      curve: Curves.easeOutBack,
      left: (gridPos.dx + jitter.dx) * cell + (cell - size) / 2,
      top: (gridPos.dy + jitter.dy) * cell + (cell - size) / 2,
      child: GestureDetector(
        onTap: canTap
            ? () {
                GameFeedback.move();
                onAction('move', {'token': token});
              }
            : null,
        child: SkinnedPiece(
          skin: TableSkins.pieceSkin(session.cosmeticsOf(seat).piece),
          seat: seat,
          size: size,
          highlight: canTap,
          crown: progress >= 57,
        ),
      ),
    );
  }

  bool _isMovable(int progress, int? die) {
    if (die == null) return false;
    if (progress < 0) return die == 6;
    if (progress >= 57) return false;
    return progress + die <= 57;
  }
}

class _CornerPaint {
  const _CornerPaint(this.base, this.light, this.occupied);
  final Color base;
  final Color light;
  final bool occupied;
}

class _LudoBoardPainter extends CustomPainter {
  _LudoBoardPainter({required this.playground, required this.seatPalettes, required this.track});
  final PlaygroundSkin playground;
  final List<_CornerPaint> seatPalettes;
  final List<Offset> track;

  static const _safeCells = [0, 8, 13, 21, 26, 34, 39, 47];

  @override
  void paint(Canvas canvas, Size size) {
    final cell = size.width / 15;
    Rect cellRect(double c, double r) => Rect.fromLTWH(c * cell, r * cell, cell, cell);

    // Board plate.
    final plate = RRect.fromRectAndRadius(Offset.zero & size, Radius.circular(cell * 0.6));
    canvas.drawRRect(plate, Paint()..color = playground.darkSquare.withValues(alpha: 0.7));

    // Yards.
    const bases = LudoBoard._bases;
    for (var corner = 0; corner < 4; corner++) {
      final p = seatPalettes[corner];
      final base = bases[corner];
      final rect = Rect.fromLTWH(base.dx * cell, base.dy * cell, cell * 6, cell * 6);
      final rr = RRect.fromRectAndRadius(rect.deflate(cell * 0.15), Radius.circular(cell * 0.5));
      canvas.drawRRect(
        rr,
        Paint()
          ..shader = LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [p.light.withValues(alpha: p.occupied ? 0.85 : 0.5), p.base.withValues(alpha: p.occupied ? 0.95 : 0.6)],
          ).createShader(rect),
      );
      if (p.occupied) {
        canvas.drawRRect(
          rr,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2
            ..color = p.light.withValues(alpha: 0.6)
            ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4),
        );
      }
      // Inner pad with four token sockets.
      final inner = RRect.fromRectAndRadius(rect.deflate(cell * 0.9), Radius.circular(cell * 0.45));
      canvas.drawRRect(inner, Paint()..color = Colors.black.withValues(alpha: 0.28));
      for (final dx in [1.5, 3.5]) {
        for (final dy in [1.5, 3.5]) {
          canvas.drawCircle(
            Offset((base.dx + dx + 0.5) * cell, (base.dy + dy + 0.5) * cell),
            cell * 0.55,
            Paint()..color = Colors.white.withValues(alpha: 0.10),
          );
        }
      }
    }

    // Track cells.
    final cellPaint = Paint()..color = Colors.white.withValues(alpha: 0.10);
    final border = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.8
      ..color = playground.line.withValues(alpha: 0.5);
    for (var i = 0; i < track.length; i++) {
      final t = track[i];
      final rect = cellRect(t.dx, t.dy).deflate(0.6);
      final rr = RRect.fromRectAndRadius(rect, Radius.circular(cell * 0.18));
      // Start cells take their corner colour.
      final startCorner = LudoBoard._starts.indexOf(i);
      if (startCorner >= 0) {
        canvas.drawRRect(rr, Paint()..color = seatPalettes[startCorner].base.withValues(alpha: 0.75));
      } else {
        canvas.drawRRect(rr, cellPaint);
      }
      canvas.drawRRect(rr, border);
      if (_safeCells.contains(i)) {
        // Star marker on safe cells.
        final c = rect.center;
        final star = Paint()..color = playground.accent.withValues(alpha: 0.85);
        _drawStar(canvas, c, cell * 0.28, star);
      }
    }

    // Home columns.
    for (var corner = 0; corner < 4; corner++) {
      final p = seatPalettes[corner];
      for (final col in LudoBoard._homeColumns[corner]) {
        final rr = RRect.fromRectAndRadius(cellRect(col.dx, col.dy).deflate(0.6), Radius.circular(cell * 0.18));
        canvas.drawRRect(rr, Paint()..color = p.base.withValues(alpha: p.occupied ? 0.7 : 0.35));
        canvas.drawRRect(rr, border);
      }
    }

    // Centre: four triangles.
    final centre = Rect.fromLTWH(6 * cell, 6 * cell, 3 * cell, 3 * cell);
    final mid = centre.center;
    final corners = [
      [centre.bottomLeft, centre.bottomRight], // seat 0 (bottom)
      [centre.topLeft, centre.bottomLeft], // seat 1 (left)
      [centre.topLeft, centre.topRight], // seat 2 (top)
      [centre.topRight, centre.bottomRight], // seat 3 (right)
    ];
    for (var i = 0; i < 4; i++) {
      final path = Path()
        ..moveTo(mid.dx, mid.dy)
        ..lineTo(corners[i][0].dx, corners[i][0].dy)
        ..lineTo(corners[i][1].dx, corners[i][1].dy)
        ..close();
      canvas.drawPath(path, Paint()..color = seatPalettes[i].base.withValues(alpha: seatPalettes[i].occupied ? 0.9 : 0.45));
      canvas.drawPath(path, border);
    }
    canvas.drawCircle(
      mid,
      cell * 0.9,
      Paint()
        ..color = playground.glow.withValues(alpha: 0.35)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 10),
    );
  }

  void _drawStar(Canvas canvas, Offset c, double r, Paint paint) {
    final path = Path();
    for (var i = 0; i < 10; i++) {
      final radius = i.isEven ? r : r * 0.45;
      final a = -math.pi / 2 + i * math.pi / 5;
      final p = Offset(c.dx + radius * math.cos(a), c.dy + radius * math.sin(a));
      if (i == 0) {
        path.moveTo(p.dx, p.dy);
      } else {
        path.lineTo(p.dx, p.dy);
      }
    }
    path.close();
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant _LudoBoardPainter old) {
    if (old.playground != playground || old.seatPalettes.length != seatPalettes.length) return true;
    for (var i = 0; i < seatPalettes.length; i++) {
      if (old.seatPalettes[i].base != seatPalettes[i].base || old.seatPalettes[i].occupied != seatPalettes[i].occupied) {
        return true;
      }
    }
    return false;
  }
}

class _SeatBadge extends StatelessWidget {
  const _SeatBadge({
    required this.session,
    required this.seat,
    required this.isMe,
    required this.active,
    required this.home,
    required this.captures,
    required this.accent,
  });
  final GameSessionView session;
  final int seat;
  final bool isMe;
  final bool active;
  final int home;
  final int captures;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: active ? accent.withValues(alpha: 0.16) : Colors.transparent,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: active ? accent : Colors.transparent),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          SkinnedPiece(skin: TableSkins.pieceSkin(session.cosmeticsOf(seat).piece), seat: seat, size: 16),
          const SizedBox(width: 5),
          Text(
            isMe ? 'You' : session.seats[seat].displayName.split(' ').first,
            style: const TextStyle(color: AppColors.textPrimary, fontSize: 11, fontWeight: FontWeight.w700),
          ),
          const SizedBox(width: 5),
          Text('$home/4', style: TextStyle(color: accent, fontSize: 12, fontWeight: FontWeight.w900)),
          if (captures > 0) Text('  ⚔$captures', style: const TextStyle(color: AppColors.warning, fontSize: 10)),
        ],
      ),
    );
  }
}
