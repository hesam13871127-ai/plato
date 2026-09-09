import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../../../core/widgets/piece_3d.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Parsed ludo view (the engine exposes the full board — no hidden info).
class _LudoView {
  _LudoView(Map<String, dynamic> b)
      : tokens = _matrix(b['tokens']),
        subPhase = (b['subPhase'] as String?) ?? 'roll',
        dice = (b['dice'] as num?)?.toInt(),
        sixStreak = (b['sixStreak'] as num?)?.toInt() ?? 0,
        startOffsets = _list(b['startOffsets']),
        safeCells = _list(b['safeCells']).toSet(),
        lastRollSeat = ((b['lastRoll'] as Map?)?['seat'] as num?)?.toInt(),
        lastRollValue = ((b['lastRoll'] as Map?)?['value'] as num?)?.toInt();

  final List<List<int>> tokens;
  final String subPhase;
  final int? dice;
  final int sixStreak;
  final List<int> startOffsets;
  final Set<int> safeCells;
  final int? lastRollSeat;
  final int? lastRollValue;

  static List<int> _list(Object? raw) =>
      ((raw as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();

  static List<List<int>> _matrix(Object? raw) => ((raw as List?) ?? const [])
      .whereType<List>()
      .map((row) => row.whereType<num>().map((n) => n.toInt()).toList())
      .toList();

  /// Absolute ring cell for a seat's token progress (1..51), else -1.
  int absCell(int seat, int progress) {
    if (progress < 1 || progress > 51) return -1;
    final offset = seat < startOffsets.length ? startOffsets[seat] : seat * 13;
    return (offset + progress - 1) % 52;
  }

  bool canMove(int progress, int diceValue) {
    if (progress == 0) return diceValue == 6;
    return progress + diceValue <= 58;
  }
}

/// Ludo — wave-1 3D board.
///
/// A modern circular track: 52 glossy cells on a ring (starts and star cells
/// lit), four radial home columns flowing into a glowing hub, and one yard
/// panel per seat. Tokens are lit spheres; movable ones pulse. Roll with the
/// 3D dice, then tap a token. Fully generic for 2–4 players.
class LudoBoard extends StatefulWidget {
  const LudoBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<LudoBoard> createState() => _LudoBoardState();
}

class _LudoBoardState extends State<LudoBoard> with SingleTickerProviderStateMixin {
  String _skin = 'midnight';
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..repeat(reverse: true);

  static const _palettes = <PiecePalette>[
    PiecePalette.purple,
    PiecePalette.cyan,
    PiecePalette.red,
    PiecePalette.yellow,
  ];

  _LudoView get _view => _LudoView(widget.session.board);

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  List<int> get _movable {
    final view = _view;
    if (!_myTurn || view.subPhase != 'move' || view.dice == null) return const [];
    if (widget.mySeat < 0 || widget.mySeat >= view.tokens.length) return const [];
    final out = <int>[];
    for (var t = 0; t < view.tokens[widget.mySeat].length; t++) {
      if (view.canMove(view.tokens[widget.mySeat][t], view.dice!)) out.add(t);
    }
    return out;
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  // ── Geometry (shared by the painter and tap hit-testing) ─────────────────

  /// Token screen positions `[seat][tokenIndex]` for the current view.
  List<List<Offset>> tokenPositions(Size size, _LudoView view) {
    final c = Offset(size.width / 2, size.height / 2);
    final s = size.width;
    final r = s * 0.315;
    final cell = s * 0.052;
    final positions = List.generate(
      view.tokens.length,
      (seat) => List<Offset>.filled(view.tokens[seat].length, Offset.zero),
    );

    // Ring co-location jitter: group all tokens by absolute cell.
    final byCell = <int, List<Offset>>{};
    for (var seat = 0; seat < view.tokens.length; seat++) {
      for (var t = 0; t < view.tokens[seat].length; t++) {
        final cellIndex = view.absCell(seat, view.tokens[seat][t]);
        if (cellIndex >= 0) {
          byCell.putIfAbsent(cellIndex, () => []).add(Offset(seat.toDouble(), t.toDouble()));
        }
      }
    }

    for (var seat = 0; seat < view.tokens.length; seat++) {
      final axis = -math.pi / 2 + seat * math.pi / 2 - 2 * math.pi / 52;
      final yardAxis = -math.pi / 2 + seat * math.pi / 2;
      final yardCenter = c +
          Offset(math.cos(yardAxis), math.sin(yardAxis)) * (r + s * 0.089);
      for (var t = 0; t < view.tokens[seat].length; t++) {
        final progress = view.tokens[seat][t];
        if (progress == 0) {
          // 2×2 slots inside the yard panel.
          final dx = (t % 2 == 0 ? -1 : 1) * s * 0.036;
          final dy = (t < 2 ? -1 : 1) * s * 0.036;
          positions[seat][t] = yardCenter + Offset(dx, dy);
        } else if (progress <= 51) {
          final cellIndex = view.absCell(seat, progress);
          final angle = -math.pi / 2 + cellIndex * 2 * math.pi / 52;
          final base = c + Offset(math.cos(angle), math.sin(angle)) * r;
          final group = byCell[cellIndex] ?? const <Offset>[];
          final index = group.indexWhere((g) => g.dx == seat && g.dy == t);
          final n = group.length;
          final spread = n > 1 ? (index - (n - 1) / 2) * cell * 0.42 : 0.0;
          positions[seat][t] = base + Offset(spread, 0);
        } else if (progress <= 57) {
          final i = progress - 52;
          final radius = r - cell * 1.55 - i * cell * 1.12;
          positions[seat][t] = c + Offset(math.cos(axis), math.sin(axis)) * radius;
        } else {
          // Home — small slot in the hub, spread along the seat axis.
          final radius = s * 0.028 + (t % 2) * s * 0.026;
          positions[seat][t] =
              c + Offset(math.cos(axis), math.sin(axis)) * radius;
        }
      }
    }
    return positions;
  }

  void _handleTap(Offset local, Size size, List<List<Offset>> positions) {
    final movable = _movable;
    if (movable.isEmpty) return;
    double bestDist = double.infinity;
    int? bestToken;
    for (final t in movable) {
      final pos = positions[widget.mySeat][t];
      final d = (local - pos).distance;
      if (d < bestDist) {
        bestDist = d;
        bestToken = t;
      }
    }
    if (bestToken != null && bestDist < size.width * 0.075) {
      GameFeedback.move();
      widget.onAction('move', {'token': bestToken});
    } else if (bestToken != null) {
      GameFeedback.error();
    }
  }

  @override
  Widget build(BuildContext context) {
    final view = _view;
    final skin = BoardSkin.byId(_skin);
    final movable = _movable;

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
          child: LayoutBuilder(
            builder: (context, constraints) {
              final size = Size(constraints.maxWidth, constraints.maxWidth);
              final positions = tokenPositions(size, view);
              return AspectRatio(
                aspectRatio: 1,
                child: Stack(
                  children: [
                    AnimatedBuilder(
                      animation: _pulse,
                      builder: (context, _) => CustomPaint(
                        size: size,
                        painter: _LudoPainter(
                          view: view,
                          positions: positions,
                          seatCount: widget.session.seats.length,
                          activeSeat: widget.session.currentSeat,
                          mySeat: widget.mySeat,
                          movable: movable,
                          pulse: _pulse.value,
                          palettes: _palettes,
                        ),
                      ),
                    ),
                    Positioned.fill(
                      child: GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTapDown: (details) => _handleTap(details.localPosition, size, positions),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 12),
        _DiceRow(
          view: view,
          myTurn: _myTurn,
          palettes: _palettes,
          mySeat: widget.mySeat,
          onRoll: () {
            GameFeedback.roll();
            widget.onAction('roll', {});
          },
        ),
      ],
    );
  }

  String _statusText(_LudoView view) {
    if (!widget.session.isInProgress) return 'Game over';
    if (!_myTurn) return 'Waiting for the table…';
    if (view.subPhase == 'roll') {
      return view.sixStreak > 0 ? 'Your roll — six streak ×${view.sixStreak + 1}?' : 'Your roll — tap the dice!';
    }
    if (movable.isEmpty) return 'Rolled ${view.dice} — no legal move';
    return 'Rolled ${view.dice} — tap a glowing token';
  }
}

// ── The board painter ───────────────────────────────────────────────────────

class _LudoPainter extends CustomPainter {
  _LudoPainter({
    required this.view,
    required this.positions,
    required this.seatCount,
    required this.activeSeat,
    required this.mySeat,
    required this.movable,
    required this.pulse,
    required this.palettes,
  });

  final _LudoView view;
  final List<List<Offset>> positions;
  final int seatCount;
  final int activeSeat;
  final int mySeat;
  final List<int> movable;
  final double pulse;
  final List<PiecePalette> palettes;

  @override
  void paint(Canvas canvas, Size size) {
    final c = Offset(size.width / 2, size.height / 2);
    final s = size.width;
    final r = s * 0.315;
    final cell = s * 0.052;

    _paintRing(canvas, c, s, r, cell);
    _paintColumns(canvas, c, s, r, cell);
    _paintHub(canvas, c, s);
    _paintYards(canvas, c, s, r);
    _paintTokens(canvas, s, cell);
  }

  void _paintRing(Canvas canvas, Offset c, double s, double r, double cell) {
    for (var k = 0; k < 52; k++) {
      final angle = -math.pi / 2 + k * 2 * math.pi / 52;
      final center = c + Offset(math.cos(angle), math.sin(angle)) * r;
      final rect = Rect.fromCenter(center: center, width: cell, height: cell);
      final rrect = RRect.fromRectAndRadius(rect, Radius.circular(cell * 0.28));

      final startSeat = view.startOffsets.indexOf(k);
      final isSafe = view.safeCells.contains(k);
      Color fill;
      if (startSeat >= 0) {
        final pal = palettes[startSeat % palettes.length];
        fill = Color.lerp(pal.base, Colors.black, 0.45)!;
      } else if (isSafe) {
        fill = const Color(0x33FFFFFF);
      } else {
        fill = const Color(0x14FFFFFF);
      }
      canvas.drawRRect(rrect, Paint()..color = fill);
      canvas.drawRRect(
        rrect,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = s * 0.0022
          ..color = Colors.white.withValues(alpha: startSeat >= 0 || isSafe ? 0.4 : 0.12),
      );
      if (isSafe && startSeat < 0) {
        // Star cells carry a tiny marker.
        final star = Path()
          ..addOval(Rect.fromCenter(center: center, width: cell * 0.24, height: cell * 0.24));
        canvas.drawPath(star, Paint()..color = Colors.white.withValues(alpha: 0.5));
      }
    }
  }

  void _paintColumns(Canvas canvas, Offset c, double s, double r, double cell) {
    for (var seat = 0; seat < seatCount; seat++) {
      final pal = palettes[seat % palettes.length];
      final axis = -math.pi / 2 + seat * math.pi / 2 - 2 * math.pi / 52;
      for (var i = 0; i < 6; i++) {
        final radius = r - cell * 1.55 - i * cell * 1.12;
        final center = c + Offset(math.cos(axis), math.sin(axis)) * radius;
        final w = cell * 0.92;
        final rect = Rect.fromCenter(center: center, width: w, height: w);
        final rrect = RRect.fromRectAndRadius(rect, Radius.circular(w * 0.26));
        canvas.drawRRect(
          rrect,
          Paint()..color = Color.lerp(pal.base, Colors.black, 0.62)!.withValues(alpha: 0.55),
        );
        canvas.drawRRect(
          rrect,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = s * 0.0018
            ..color = pal.base.withValues(alpha: 0.4),
        );
      }
    }
  }

  void _paintHub(Canvas canvas, Offset c, double s) {
    final radius = s * 0.108;
    final body = Paint()
      ..shader = RadialGradient(
        center: const Alignment(-0.3, -0.4),
        colors: [const Color(0xFF2A3B66), const Color(0xFF101B36), const Color(0xFF070D1D)],
      ).createShader(Rect.fromCircle(center: c, radius: radius));
    canvas.drawCircle(c, radius, body);

    // One glowing arc per seat around the hub.
    for (var seat = 0; seat < seatCount; seat++) {
      final pal = palettes[seat % palettes.length];
      final sweep = 2 * math.pi / seatCount - 0.14;
      final start = -math.pi / 2 + seat * (2 * math.pi / seatCount) + 0.07;
      canvas.drawArc(
        Rect.fromCircle(center: c, radius: radius * 0.8),
        start,
        sweep,
        false,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = s * 0.011
          ..strokeCap = StrokeCap.round
          ..color = pal.base.withValues(alpha: seat == activeSeat ? 0.95 : 0.35),
      );
    }
    canvas.drawCircle(
      c,
      radius,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = s * 0.0024
        ..color = Colors.white.withValues(alpha: 0.16),
    );
  }

  void _paintYards(Canvas canvas, Offset c, double s, double r) {
    for (var seat = 0; seat < seatCount; seat++) {
      final pal = palettes[seat % palettes.length];
      final axis = -math.pi / 2 + seat * math.pi / 2;
      final center = c + Offset(math.cos(axis), math.sin(axis)) * (r + s * 0.089);
      final side = s * 0.178;
      final rect = Rect.fromCenter(center: center, width: side, height: side);
      final rrect = RRect.fromRectAndRadius(rect, Radius.circular(side * 0.28));
      canvas.drawRRect(
        rrect,
        Paint()
          ..shader = LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Color.lerp(pal.base, Colors.black, 0.55)!,
              Color.lerp(pal.base, Colors.black, 0.75)!,
            ],
          ).createShader(rect),
      );
      canvas.drawRRect(
        rrect,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = seat == activeSeat ? s * 0.005 : s * 0.0022
          ..color = seat == activeSeat
              ? Colors.white.withValues(alpha: 0.85)
              : pal.light.withValues(alpha: 0.4),
      );
      if (seat == activeSeat) {
        canvas.drawRRect(
          RRect.fromRectAndRadius(rect.inflate(s * 0.008), Radius.circular(side * 0.3)),
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = s * 0.004
            ..color = pal.glow.withValues(alpha: 0.35 + 0.3 * pulse),
        );
      }
      // Yard slot dimples (2×2).
      for (var i = 0; i < 4; i++) {
        final dx = (i % 2 == 0 ? -1 : 1) * s * 0.036;
        final dy = (i < 2 ? -1 : 1) * s * 0.036;
        canvas.drawCircle(
          center + Offset(dx, dy),
          s * 0.026,
          Paint()..color = Colors.black.withValues(alpha: 0.35),
        );
      }
    }
  }

  void _paintTokens(Canvas canvas, double s, double cell) {
    final tokenRadius = cell * 0.42;
    for (var seat = 0; seat < positions.length; seat++) {
      final pal = palettes[seat % palettes.length];
      for (var t = 0; t < positions[seat].length; t++) {
        final pos = positions[seat][t];
        final isMovable = seat == mySeat && movable.contains(t);

        if (isMovable) {
          // Pulsing target halo.
          canvas.drawCircle(
            pos,
            tokenRadius * (1.45 + 0.25 * pulse),
            Paint()..color = AppColors.softCyan.withValues(alpha: 0.22 + 0.22 * pulse),
          );
        }

        final body = Paint()
          ..shader = RadialGradient(
            center: const Alignment(-0.35, -0.45),
            radius: 1.1,
            colors: [pal.light, pal.base, pal.dark],
            stops: const [0.0, 0.55, 1.0],
          ).createShader(Rect.fromCircle(center: pos, radius: tokenRadius));
        canvas.drawCircle(
          pos,
          tokenRadius * 0.98,
          Paint()..color = Colors.black.withValues(alpha: 0.4),
        ); // contact shadow
        canvas.drawCircle(pos, tokenRadius, body);

        // Specular highlight.
        canvas.drawCircle(
          pos + Offset(-tokenRadius * 0.3, -tokenRadius * 0.34),
          tokenRadius * 0.4,
          Paint()
            ..shader = RadialGradient(
              colors: [Colors.white.withValues(alpha: 0.85), Colors.white.withValues(alpha: 0.0)],
            ).createShader(Rect.fromCircle(
              center: pos + Offset(-tokenRadius * 0.3, -tokenRadius * 0.34),
              radius: tokenRadius * 0.5,
            )),
        );

        if (isMovable) {
          canvas.drawCircle(
            pos,
            tokenRadius * 1.06,
            Paint()
              ..style = PaintingStyle.stroke
              ..strokeWidth = s * 0.004
              ..color = Colors.white.withValues(alpha: 0.6 + 0.4 * pulse),
          );
        }
      }
    }
  }

  @override
  bool shouldRepaint(covariant _LudoPainter old) => true;
}

// ── Dice & roll controls ────────────────────────────────────────────────────

/// The 3D dice: tappable to roll on your turn, otherwise shows the live roll.
class _DiceRow extends StatelessWidget {
  const _DiceRow({
    required this.view,
    required this.myTurn,
    required this.palettes,
    required this.mySeat,
    required this.onRoll,
  });

  final _LudoView view;
  final bool myTurn;
  final List<PiecePalette> palettes;
  final int mySeat;
  final VoidCallback onRoll;

  @override
  Widget build(BuildContext context) {
    final canRoll = myTurn && view.subPhase == 'roll';
    final value = view.dice ?? view.lastRollValue;

    return Row(
      children: [
        GestureDetector(
          onTap: canRoll ? onRoll : null,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFFFDFAF4), Color(0xFFE9ECF3), Color(0xFFCFD6E4)],
              ),
              border: Border.all(
                color: canRoll ? AppColors.softCyan : Colors.white.withValues(alpha: 0.7),
                width: canRoll ? 2 : 1,
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.45),
                  blurRadius: 10,
                  offset: const Offset(0, 5),
                ),
                if (canRoll)
                  BoxShadow(
                    color: AppColors.softCyan.withValues(alpha: 0.45),
                    blurRadius: 16,
                  ),
              ],
            ),
            child: Center(
              child: value == null
                  ? Icon(
                      Icons.casino_rounded,
                      size: 30,
                      color: canRoll ? const Color(0xFF0B1426) : const Color(0xFF7787A8),
                    )
                  : _DiceFace(value: value),
            ),
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                view.lastRollValue == null
                    ? 'Throw the dice to start the race'
                    : view.lastRollSeat != null && view.lastRollSeat == mySeat
                        ? 'You rolled ${view.lastRollValue}'
                        : 'Seat ${(view.lastRollSeat ?? 0) + 1} rolled ${view.lastRollValue}',
                style: const TextStyle(
                  color: AppColors.textPrimary,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                canRoll
                    ? (view.sixStreak > 0
                        ? 'Six streak ×${view.sixStreak + 1} — a third six burns the turn!'
                        : 'Tap the dice to roll')
                    : view.subPhase == 'move' && myTurn
                        ? 'Pick a glowing token to move'
                        : 'Tokens home wins the crown',
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
              ),
            ],
          ),
        ),
        for (var seat = 0; seat < view.tokens.length; seat++) ...[
          const SizedBox(width: 6),
          _HomeChip(
            palette: palettes[seat % palettes.length],
            home: view.tokens[seat].where((p) => p == 58).length,
            active: seat == (view.lastRollSeat ?? -1),
          ),
        ],
      ],
    );
  }
}

/// Compact per-seat "tokens home" counter chip.
class _HomeChip extends StatelessWidget {
  const _HomeChip({required this.palette, required this.home, required this.active});

  final PiecePalette palette;
  final int home;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 34,
      height: 34,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: AppColors.glassFill,
        border: Border.all(
          color: active ? palette.light : AppColors.glassStroke,
          width: active ? 1.8 : 1,
        ),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            '$home',
            style: const TextStyle(
              color: AppColors.textPrimary,
              fontSize: 12,
              fontWeight: FontWeight.w900,
              height: 1,
            ),
          ),
          const Text('home', style: TextStyle(color: AppColors.textMuted, fontSize: 7.5)),
        ],
      ),
    );
  }
}

/// Pips for a dice value on the ivory cube.
class _DiceFace extends StatelessWidget {
  const _DiceFace({required this.value});

  final int value;

  static const Map<int, List<List<int>>> _pips = {
    1: [
      [1, 1]
    ],
    2: [
      [0, 0],
      [2, 2]
    ],
    3: [
      [0, 0],
      [1, 1],
      [2, 2]
    ],
    4: [
      [0, 0],
      [0, 2],
      [2, 0],
      [2, 2]
    ],
    5: [
      [0, 0],
      [0, 2],
      [1, 1],
      [2, 0],
      [2, 2]
    ],
    6: [
      [0, 0],
      [0, 2],
      [1, 0],
      [1, 2],
      [2, 0],
      [2, 2]
    ],
  };

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 34,
      height: 34,
      child: Stack(
        children: [
          for (final p in _pips[value] ?? const <List<int>>[])
            Positioned(
              left: p[1] * 10.0 + 2,
              top: p[0] * 10.0 + 2,
              child: Container(
                width: 7,
                height: 7,
                decoration: const BoxDecoration(
                  color: Color(0xFF101A33),
                  shape: BoxShape.circle,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
