import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Parsed dots & boxes view — the engine exposes the whole grid.
class _DnbView {
  _DnbView(Map<String, dynamic> b)
      : size = (b['size'] as num?)?.toInt() ?? 5,
        h = _grid(b['h']),
        v = _grid(b['v']),
        boxes = _grid(b['boxes']),
        lastEdge = _lastEdge(b['lastEdge']);

  final int size; // boxes per side
  final List<List<int>> h; // (size+1) × size — edge owner or -1
  final List<List<int>> v; // size × (size+1)
  final List<List<int>> boxes; // size × size — box owner or -1
  final _LastEdge? lastEdge;

  static List<List<int>> _grid(Object? raw) => ((raw as List?) ?? const [])
      .whereType<List>()
      .map((row) => row.whereType<num>().map((n) => n.toInt()).toList())
      .toList();

  static _LastEdge? _lastEdge(Object? raw) {
    final m = raw as Map?;
    if (m == null) return null;
    return _LastEdge(
      (m['kind'] as String?) ?? 'h',
      (m['r'] as num?)?.toInt() ?? 0,
      (m['c'] as num?)?.toInt() ?? 0,
      (m['seat'] as num?)?.toInt() ?? 0,
    );
  }

  int countFor(int seat) => boxes.expand((row) => row).where((o) => o == seat).length;

  int get totalBoxes => size * size;
}

class _LastEdge {
  const _LastEdge(this.kind, this.r, this.c, this.seat);
  final String kind;
  final int r;
  final int c;
  final int seat;
}

/// Dots & Boxes, wave-2 3D board.
///
/// A floating glass grid of glowing dots; tap the gap between two dots to
/// draw that edge. Claimed squares fill with the owner's neon wash, the
/// newest line pulses, and chained turns keep you drawing.
class DotsBoard extends StatefulWidget {
  const DotsBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<DotsBoard> createState() => _DotsBoardState();
}

class _DotsBoardState extends State<DotsBoard> {
  String _skin = 'wood';

  _DnbView get _view => _DnbView(widget.session.board);

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  static const _seatColors = <Color>[Color(0xFF22D3EE), Color(0xFFA78BFA)];

  Color _colorFor(int seat) => seat == 0 || seat == 1 ? _seatColors[seat] : Colors.white24;

  // ── interaction ───────────────────────────────────────────────────────────

  void _tap(Offset local, Size size) {
    if (!_myTurn) return;
    final view = _view;
    // Logical coords: dots sit at (i + 0.5) lattice points, cell = 1.
    final gx = local.dx / size.width * view.size;
    final gy = local.dy / size.height * view.size;

    // Nearest horizontal edge: row round(gy - 0.5), col floor(gx - 0.5).
    final hr = (gy - 0.5).round();
    final hc = (gx - 0.5).floor();
    final hDist = (gy - (hr + 0.5)).abs();
    // Nearest vertical edge: col round(gx - 0.5), row floor(gy - 0.5).
    final vc = (gx - 0.5).round();
    final vr = (gy - 0.5).floor();
    final vDist = (gx - (vc + 0.5)).abs();

    const threshold = 0.30;
    String? kind;
    int r = 0;
    int c = 0;
    if (hDist <= vDist && hDist < threshold && hr >= 0 && hr <= view.size && hc >= 0 && hc < view.size) {
      kind = 'h';
      r = hr;
      c = hc;
    } else if (vDist < threshold && vr >= 0 && vr < view.size && vc >= 0 && vc <= view.size) {
      kind = 'v';
      r = vr;
      c = vc;
    }
    if (kind == null) return;

    final owner = kind == 'h' ? view.h[r][c] : view.v[r][c];
    if (owner != -1) {
      GameFeedback.error();
      return;
    }
    GameFeedback.tap();
    widget.onAction('edge', {'kind': kind, 'r': r, 'c': c});
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
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  _Tray(label: _seatLabel(0), count: view.countFor(0), color: _colorFor(0), mine: widget.mySeat == 0, total: view.totalBoxes),
                  _Tray(label: _seatLabel(1), count: view.countFor(1), color: _colorFor(1), mine: widget.mySeat == 1, total: view.totalBoxes),
                ],
              ),
              const SizedBox(height: 10),
              LayoutBuilder(
                builder: (context, constraints) {
                  final size = Size(constraints.maxWidth, constraints.maxWidth);
                  return AspectRatio(
                    aspectRatio: 1,
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTapUp: (d) => _tap(d.localPosition, size),
                      child: CustomPaint(
                        size: Size.infinite,
                        painter: _DnbPainter(view: view, myColor: _colorFor(widget.mySeat)),
                      ),
                    ),
                  );
                },
              ),
            ],
          ),
        ),
      ],
    );
  }

  String _statusText(_DnbView view) {
    if (!widget.session.isInProgress) {
      return 'Final squares — ${view.countFor(0)} : ${view.countFor(1)}';
    }
    if (!_myTurn) return 'Waiting for the table…';
    return 'Your line — tap between two dots';
  }

  String _seatLabel(int seat) {
    if (seat >= widget.session.seats.length) return 'Seat ${seat + 1}';
    return seat == widget.mySeat ? 'You' : widget.session.seats[seat].displayName;
  }
}

// ── tray ────────────────────────────────────────────────────────────────────

class _Tray extends StatelessWidget {
  const _Tray({required this.label, required this.count, required this.color, required this.mine, required this.total});

  final String label;
  final int count;
  final Color color;
  final bool mine;
  final int total;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 12,
          height: 12,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(3),
            color: color.withValues(alpha: 0.85),
            border: Border.all(color: Colors.white24, width: 0.8),
          ),
        ),
        const SizedBox(width: 5),
        Text(
          '$label · $count/$total',
          style: TextStyle(
            color: mine ? AppColors.softCyan : AppColors.textSecondary,
            fontSize: 11.5,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    );
  }
}

// ── painter ─────────────────────────────────────────────────────────────────

class _DnbPainter extends CustomPainter {
  _DnbPainter({required this.view, required this.myColor});

  final _DnbView view;
  final Color myColor;

  @override
  void paint(Canvas canvas, Size size) {
    final n = view.size;
    final cell = size.width / n;
    final dotR = cell * 0.075;
    final edgeW = cell * 0.11;

    Offset dotPos(int r, int c) => Offset((c + 0.5) * cell, (r + 0.5) * cell);
    Offset hCenter(int r, int c) => Offset((c + 1) * cell, (r + 0.5) * cell);
    Offset vCenter(int r, int c) => Offset((c + 0.5) * cell, (r + 1) * cell);

    // Claimed boxes (owner wash).
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        final owner = r < view.boxes.length && c < view.boxes[r].length ? view.boxes[r][c] : -1;
        if (owner == -1) continue;
        final rect = Rect.fromLTWH((c + 0.5) * cell, (r + 0.5) * cell, cell, cell);
        final wash = Paint()
          ..shader = RadialGradient(
            center: Alignment.center,
            colors: [
              (owner == 0 ? const Color(0xFF22D3EE) : const Color(0xFFA78BFA)).withValues(alpha: 0.30),
              (owner == 0 ? const Color(0xFF22D3EE) : const Color(0xFFA78BFA)).withValues(alpha: 0.12),
            ],
          ).createShader(rect);
        canvas.drawRRect(
          RRect.fromRectAndRadius(rect.inflate(-cell * 0.10), Radius.circular(cell * 0.12)),
          wash,
        );
      }
    }

    // Drawn edges.
    final edgePaint = Paint()
      ..strokeWidth = edgeW
      ..strokeCap = StrokeCap.round;
    for (var r = 0; r <= n; r++) {
      for (var c = 0; c < n; c++) {
        final owner = r < view.h.length && c < view.h[r].length ? view.h[r][c] : -1;
        if (owner == -1) continue;
        final isLast = view.lastEdge != null &&
            view.lastEdge!.kind == 'h' &&
            view.lastEdge!.r == r &&
            view.lastEdge!.c == c;
        edgePaint.color = isLast ? Colors.white : _edgeColor(owner);
        canvas.drawLine(dotPos(r, c), dotPos(r, c + 1), edgePaint);
        if (isLast) {
          final halo = Paint()
            ..strokeWidth = edgeW * 2.4
            ..strokeCap = StrokeCap.round
            ..color = _edgeColor(owner).withValues(alpha: 0.35);
          canvas.drawLine(dotPos(r, c), dotPos(r, c + 1), halo);
        }
      }
    }
    for (var r = 0; r < n; r++) {
      for (var c = 0; c <= n; c++) {
        final owner = r < view.v.length && c < view.v[r].length ? view.v[r][c] : -1;
        if (owner == -1) continue;
        final isLast = view.lastEdge != null &&
            view.lastEdge!.kind == 'v' &&
            view.lastEdge!.r == r &&
            view.lastEdge!.c == c;
        edgePaint.color = isLast ? Colors.white : _edgeColor(owner);
        canvas.drawLine(dotPos(r, c), dotPos(r + 1, c), edgePaint);
        if (isLast) {
          final halo = Paint()
            ..strokeWidth = edgeW * 2.4
            ..strokeCap = StrokeCap.round
            ..color = _edgeColor(owner).withValues(alpha: 0.35);
          canvas.drawLine(dotPos(r, c), dotPos(r + 1, c), halo);
        }
      }
    }

    // Dots on top.
    final dot = Paint()..color = Colors.white.withValues(alpha: 0.92);
    final dotGlow = Paint()..color = myColor.withValues(alpha: 0.18);
    for (var r = 0; r <= n; r++) {
      for (var c = 0; c <= n; c++) {
        final p = dotPos(r, c);
        canvas.drawCircle(p, dotR * 2.4, dotGlow);
        canvas.drawCircle(p, dotR, dot);
      }
    }
  }

  Color _edgeColor(int seat) => seat == 0 ? const Color(0xFF22D3EE) : const Color(0xFFA78BFA);

  @override
  bool shouldRepaint(covariant _DnbPainter old) => old.view != view || old.myColor != myColor;
}
