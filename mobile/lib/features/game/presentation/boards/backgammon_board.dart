import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Parsed backgammon view — the engine exposes the whole board.
class _BgView {
  _BgView(Map<String, dynamic> b)
      : points = _nums(b['points']),
        bar = _nums(b['bar']),
        off = _nums(b['off']),
        dice = _nums(b['dice']),
        rolled = _nums(b['rolled']),
        subPhase = (b['subPhase'] as String?) ?? 'roll',
        lastMove = _lastMove(b['lastMove']);

  final List<int> points; // 24 signed counts
  final List<int> bar; // per seat
  final List<int> off; // borne off per seat
  final List<int> dice; // remaining
  final List<int> rolled; // original roll
  final String subPhase;
  final _LastMove? lastMove;

  static List<int> _nums(Object? raw) =>
      ((raw as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();

  static _LastMove? _lastMove(Object? raw) {
    final m = raw as Map?;
    if (m == null) return null;
    return _LastMove(
      (m['seat'] as num?)?.toInt() ?? 0,
      (m['from'] as num?)?.toInt() ?? 0,
      (m['to'] as num?)?.toInt() ?? 0,
      m['hit'] == true,
    );
  }

  int count(int point) => point >= 1 && point <= 24 ? points[point - 1] : 0;
}

class _LastMove {
  const _LastMove(this.seat, this.from, this.to, this.hit);
  final int seat;
  final int from; // 0 = bar
  final int to; // 0 = off
  final bool hit;
}

/// Backgammon, wave-3 3D board.
///
/// The classic four-quadrant track: wooden frame, bar down the middle,
/// alternating felt triangles, stacked sphere checkers (white vs charcoal).
/// ROLL on your turn, then tap a point (or the bar) to select and tap a
/// highlighted destination — each destination matches one remaining die;
/// hits glow red and bear-offs land in the side trays.
class BackgammonBoard extends StatefulWidget {
  const BackgammonBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<BackgammonBoard> createState() => _BackgammonBoardState();
}

class _BackgammonBoardState extends State<BackgammonBoard> {
  String _skin = 'wood';
  int? _selected; // 0 = bar, 1..24 = point

  _BgView get _view => _BgView(widget.session.board);

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  bool get _moving => _myTurn && _view.subPhase == 'move';

  // ── rules mirror (basic legality; the server has the final word) ────────

  bool get _allHome {
    final view = _view;
    if (view.bar.length > widget.mySeat && view.bar[widget.mySeat] > 0) return false;
    final lo = widget.mySeat == 0 ? 1 : 19;
    final hi = widget.mySeat == 0 ? 6 : 24;
    for (var p = 1; p <= 24; p++) {
      if (p >= lo && p <= hi) continue;
      final v = view.count(p);
      if (widget.mySeat == 0 ? v > 0 : v < 0) return false;
    }
    return true;
  }

  bool _open(int point) {
    final v = _view.count(point);
    final enemy = widget.mySeat == 0 ? -v : v;
    return enemy <= 1;
  }

  /// Destinations for the selected origin: point → {die: destination}.
  Map<int, int> _destinations(int from) {
    final view = _view;
    final out = <int, int>{};
    final dir = widget.mySeat == 0 ? -1 : 1;

    if (from == 0) {
      // Bar entry.
      for (final die in view.dice) {
        final to = widget.mySeat == 0 ? 25 - die : die;
        if (_open(to)) out[die] = to;
      }
      return out;
    }

    final v = view.count(from);
    if (widget.mySeat == 0 ? v <= 0 : v >= 0) return out;

    for (final die in view.dice) {
      final to = from + dir * die;
      if (to >= 1 && to <= 24) {
        if (_open(to)) out[die] = to;
      } else if (_allHome) {
        final exact = to == (widget.mySeat == 0 ? 0 : 25);
        var overshootOk = !exact;
        if (!exact) {
          for (var q = 1; q <= 24; q++) {
            final qv = view.count(q);
            final mine = widget.mySeat == 0 ? qv > 0 : qv < 0;
            if (!mine) continue;
            final farther = widget.mySeat == 0 ? q > from : q < from;
            if (farther) {
              overshootOk = false;
              break;
            }
          }
        }
        if (exact || overshootOk) out[die] = 0; // 0 = bear off
      }
    }
    return out;
  }

  void _tapPoint(int point) {
    if (!_moving) return;
    final view = _view;
    final v = view.count(point);

    // Moving to a destination?
    final selected = _selected;
    if (selected != null) {
      final dests = _destinations(selected);
      final entry = dests.entries.where((e) => e.value == point).toList();
      if (entry.isNotEmpty) {
        GameFeedback.move();
        widget.onAction('move', {'from': selected, 'die': entry.first.key});
        setState(() => _selected = null);
        return;
      }
    }

    // Selecting one of my points (or the bar handled elsewhere).
    if (widget.mySeat == 0 ? v > 0 : v < 0) {
      GameFeedback.tap();
      setState(() => _selected = point);
      return;
    }
    if (selected != null) GameFeedback.error();
  }

  void _tapBar() {
    if (!_moving) return;
    final view = _view;
    if (view.bar.length > widget.mySeat && view.bar[widget.mySeat] > 0) {
      GameFeedback.tap();
      setState(() => _selected = 0);
    }
  }

  void _tapOff() {
    if (!_moving) return;
    final selected = _selected;
    if (selected == null) return;
    final dests = _destinations(selected);
    final entry = dests.entries.where((e) => e.value == 0).toList();
    if (entry.isEmpty) {
      GameFeedback.error();
      return;
    }
    GameFeedback.move();
    widget.onAction('move', {'from': selected, 'die': entry.first.key});
    setState(() => _selected = null);
  }

  Future<void> _roll() async {
    if (!_myTurn || _view.subPhase != 'roll') return;
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
          icon: Icons.swap_vert_rounded,
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
                  _Tray(label: _seatLabel(0), off: _safe(view.off, 0), mine: widget.mySeat == 0),
                  _DiceTray(view: view),
                  _Tray(label: _seatLabel(1), off: _safe(view.off, 1), mine: widget.mySeat == 1),
                ],
              ),
              const SizedBox(height: 10),
              AspectRatio(
                aspectRatio: 1.45,
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
                      BoxShadow(color: Colors.black.withValues(alpha: 0.5), blurRadius: 16, offset: const Offset(0, 8)),
                    ],
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: LayoutBuilder(
                      builder: (context, constraints) {
                        return GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTapUp: (d) => _handleTap(d.localPosition, constraints.biggest),
                          child: CustomPaint(
                            size: Size.infinite,
                            painter: _BgPainter(
                              view: view,
                              mySeat: widget.mySeat,
                              selected: _selected,
                              destinations: _selected != null ? _destinations(_selected!) : const {},
                              skin: skin,
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              _rollButton(view),
            ],
          ),
        ),
      ],
    );
  }

  int _safe(List<int> list, int i) => list.length > i ? list[i] : 0;

  void _handleTap(Offset local, Size size) {
    // Layout: 12 point-columns on the right of the bar... mirrored layout:
    // top-left quadrant points 13-18 (left→right 13,14,15), top-right 19-24…
    // Our geometry (from the painter): left half = points 12..7 (top) and
    // 1..6 (bottom); right half = points 13..18 (top) and 24..19 (bottom).
    final w = size.width;
    final h = size.height;
    final barW = w * 0.09;
    final half = (w - barW) / 2;
    final colW = half / 6;

    int? point;
    if (local.dx < half) {
      final col = (local.dx / colW).floor().clamp(0, 5);
      point = local.dy < h / 2 ? 12 - col : 1 + col;
    } else if (local.dx > half + barW) {
      final col = ((local.dx - half - barW) / colW).floor().clamp(0, 5);
      point = local.dy < h / 2 ? 13 + col : 24 - col;
    } else {
      _tapBar();
      return;
    }
    // Bear-off tray taps: the far edges of my home side.
    if (point != null && _selected != null) {
      final dests = _destinations(_selected!);
      // Near the tray edge? (top strip of the home quadrant edge)
      final homeEdge = widget.mySeat == 0 ? local.dx < half && local.dy > h * 0.86 : local.dx > half + barW && local.dy < h * 0.14;
      if (homeEdge && dests.containsValue(0)) {
        _tapOff();
        return;
      }
    }
    if (point != null) _tapPoint(point);
  }

  Widget _rollButton(_BgView view) {
    final canRoll = _myTurn && view.subPhase == 'roll';
    return ElevatedButton(
      onPressed: canRoll ? _roll : null,
      style: ElevatedButton.styleFrom(
        backgroundColor: canRoll ? AppColors.electricPurple : Colors.white.withValues(alpha: 0.08),
        foregroundColor: Colors.white,
        disabledForegroundColor: Colors.white38,
        padding: const EdgeInsets.symmetric(vertical: 13),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        elevation: canRoll ? 6 : 0,
      ),
      child: Text(
        canRoll ? 'ROLL THE DICE' : (_moving ? 'MOVE A CHECKER' : 'WAITING…'),
        style: const TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1.2, fontSize: 13.5),
      ),
    );
  }

  String _statusText(_BgView view) {
    if (!widget.session.isInProgress) return 'Game over';
    if (!_myTurn) return 'Waiting for the table…';
    if (view.subPhase == 'roll') return 'Your roll — may the dice be kind';
    if (_safe(view.bar, widget.mySeat) > 0) return 'On the bar — enter first!';
    return _selected != null ? 'Tap a highlighted destination' : 'Your move — pick a checker';
  }

  String _seatLabel(int seat) {
    if (seat >= widget.session.seats.length) return 'Seat ${seat + 1}';
    return seat == widget.mySeat ? 'You' : widget.session.seats[seat].displayName;
  }
}

// ── widgets ─────────────────────────────────────────────────────────────────

class _Tray extends StatelessWidget {
  const _Tray({required this.label, required this.off, required this.mine});

  final String label;
  final int off;
  final bool mine;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: TextStyle(
            color: mine ? AppColors.softCyan : AppColors.textSecondary,
            fontSize: 11,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(width: 4),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: Colors.white.withValues(alpha: 0.14)),
          ),
          child: Text(
            'off $off/15',
            style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800),
          ),
        ),
      ],
    );
  }
}

class _DiceTray extends StatelessWidget {
  const _DiceTray({required this.view});

  final _BgView view;

  @override
  Widget build(BuildContext context) {
    if (view.rolled.isEmpty) return const SizedBox(width: 60);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < view.rolled.length; i++)
          Container(
            width: 22,
            height: 22,
            margin: const EdgeInsets.symmetric(horizontal: 2),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(5),
              gradient: const LinearGradient(
                colors: [Color(0xFFFDFBF4), Color(0xFFCFC9BA)],
              ),
              border: Border.all(
                color: i < view.dice.length ? AppColors.softCyan : Colors.white24,
                width: i < view.dice.length ? 1.6 : 0.8,
              ),
            ),
            child: Center(
              child: Text(
                '${view.rolled[i]}',
                style: const TextStyle(color: Color(0xFF2A2A33), fontSize: 12, fontWeight: FontWeight.w900),
              ),
            ),
          ),
      ],
    );
  }
}

// ── painter ─────────────────────────────────────────────────────────────────

class _BgPainter extends CustomPainter {
  _BgPainter({
    required this.view,
    required this.mySeat,
    required this.selected,
    required this.destinations,
    required this.skin,
  });

  final _BgView view;
  final int mySeat;
  final int? selected;
  final Map<int, int> destinations; // die → to (0 = off)
  final BoardSkin skin;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final barW = w * 0.09;
    final half = (w - barW) / 2;
    final colW = half / 6;

    Offset pointCenter(int p) {
      // Left half top: 12..7 (left→right), left bottom: 1..6,
      // right top: 13..18, right bottom: 24..19.
      int col;
      bool top;
      bool right;
      if (p >= 13 && p <= 18) {
        col = p - 13;
        top = true;
        right = true;
      } else if (p >= 7) {
        col = 12 - p;
        top = true;
        right = false;
      } else if (p <= 6) {
        col = p - 1;
        top = false;
        right = false;
      } else {
        col = 24 - p;
        top = false;
        right = true;
      }
      final x = right ? half + barW + col * colW + colW / 2 : col * colW + colW / 2;
      return Offset(x, top ? 0.0 : h);
    }

    // Felt.
    final felt = Paint()
      ..shader = RadialGradient(
        center: const Alignment(-0.2, -0.3),
        radius: 1.5,
        colors: [
          Color.lerp(skin.feltTop, Colors.white, 0.10)!,
          skin.feltTop,
          Color.lerp(skin.feltTop, Colors.black, 0.4)!,
        ],
      ).createShader(Rect.fromLTWH(0, 0, w, h));
    canvas.drawRect(Rect.fromLTWH(0, 0, w, h), felt);

    // Triangles.
    for (var p = 1; p <= 24; p++) {
      final c = pointCenter(p);
      final top = c.dy == 0;
      final triH = h * 0.42;
      final even = p % 2 == 0;
      final base = even
          ? Color.lerp(skin.feltTop, Colors.white, 0.16)!.withValues(alpha: 0.55)
          : Color.lerp(skin.feltTop, Colors.black, 0.38)!.withValues(alpha: 0.6);
      final path = Path()
        ..moveTo(c.dx - colW / 2 + 1.5, top ? 0 : h)
        ..lineTo(c.dx + colW / 2 - 1.5, top ? 0 : h)
        ..lineTo(c.dx, top ? triH : h - triH)
        ..close();
      canvas.drawPath(path, Paint()..color = base);
      canvas.drawPath(
        path,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 0.8
          ..color = Colors.white.withValues(alpha: 0.10),
      );
    }

    // Bar.
    final barPaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          Color.lerp(skin.edge, Colors.white, 0.2)!,
          skin.edge,
          Color.lerp(skin.edge, Colors.black, 0.5)!,
        ],
      ).createShader(Rect.fromLTWH(half, 0, barW, h));
    canvas.drawRect(Rect.fromLTWH(half, 0, barW, h), barPaint);

    // Destination highlights.
    for (final to in destinations.values.toSet()) {
      if (to == 0) continue;
      final c = pointCenter(to);
      final top = c.dy == 0;
      final y = top ? h * 0.06 : h * 0.94;
      final glow = Paint()..color = AppColors.softCyan.withValues(alpha: 0.85);
      canvas.drawCircle(Offset(c.dx, y), 5.5, glow);
      final ring = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.2
        ..color = Colors.white;
      canvas.drawCircle(Offset(c.dx, y), 5.5, ring);
    }

    // Checkers per point (stacked from the edge).
    for (var p = 1; p <= 24; p++) {
      final v = view.count(p);
      if (v == 0) continue;
      final seat = v > 0 ? 0 : 1;
      final n = v.abs();
      final c = pointCenter(p);
      final top = c.dy == 0;
      final r = colW * 0.38;
      for (var i = 0; i < n; i++) {
        var y = top ? r + 1.5 + i * (r * 1.75) : h - r - 1.5 - i * (r * 1.75);
        if (top && y > h * 0.46) y = h * 0.46;
        if (!top && y < h * 0.54) y = h * 0.54;
        _paintChecker(canvas, Offset(c.dx, y), r, seat, selected == p);
      }
    }

    // Bar checkers.
    for (var seat = 0; seat < 2; seat++) {
      final n = view.bar.length > seat ? view.bar[seat] : 0;
      for (var i = 0; i < n && i < 3; i++) {
        final y = seat == 0 ? h * 0.30 + i * 14 : h * 0.70 - i * 14;
        _paintChecker(canvas, Offset(half + barW / 2, y), colW * 0.34, seat, selected == 0 && mySeat == seat);
      }
      if (n > 3) {
        final tp = TextPainter(
          text: TextSpan(text: '$n', style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w900)),
          textDirection: TextDirection.ltr,
        )..layout();
        final y = seat == 0 ? h * 0.30 + 3 * 14 : h * 0.70 - 3 * 14;
        tp.paint(canvas, Offset(half + barW / 2 - tp.width / 2, y - tp.height / 2));
      }
    }

    // Bear-off trays (edges of the home quadrants).
    _paintOffTray(canvas, Rect.fromLTWH(0, h * 0.86, colW * 0.7, h * 0.14), 0);
    _paintOffTray(canvas, Rect.fromLTWH(w - colW * 0.7, 0, colW * 0.7, h * 0.14), 1);

    // Last move marker.
    final last = view.lastMove;
    if (last != null && last.from > 0) {
      final c = pointCenter(last.from);
      final top = c.dy == 0;
      final paint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.4
        ..color = (last.hit ? AppColors.danger : Colors.white).withValues(alpha: 0.6);
      canvas.drawCircle(Offset(c.dx, top ? h * 0.10 : h * 0.90), 7, paint);
    }
  }

  void _paintChecker(Canvas canvas, Offset c, double r, int seat, bool selectedFlag) {
    final base = seat == 0 ? const Color(0xFFF2EEE2) : const Color(0xFF23262E);
    final light = seat == 0 ? const Color(0xFFFFFFFF) : const Color(0xFF6B7691);
    final dark = seat == 0 ? const Color(0xFFB5AC96) : const Color(0xFF0B0F1E);
    final shadow = Paint()..color = Colors.black.withValues(alpha: 0.35);
    canvas.drawOval(Rect.fromCenter(center: c + const Offset(0.6, 1), width: r * 1.9, height: r * 1.4), shadow);
    if (selectedFlag) {
      final halo = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..color = AppColors.softCyan;
      canvas.drawCircle(c, r + 2.5, halo);
    }
    final body = Paint()
      ..shader = RadialGradient(
        center: const Alignment(-0.35, -0.45),
        radius: 1.15,
        colors: [light, base, dark],
        stops: const [0.0, 0.55, 1.0],
      ).createShader(Rect.fromCircle(center: c, radius: r));
    canvas.drawCircle(c, r, body);
    final rim = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.8
      ..color = seat == 0 ? Colors.black26 : Colors.white24;
    canvas.drawCircle(c, r * 0.8, rim);
  }

  void _paintOffTray(Canvas canvas, Rect rect, int seat) {
    final paint = Paint()
      ..shader = LinearGradient(
        colors: [
          const Color(0xFF1A140C),
          const Color(0xFF3A2E1E),
        ],
      ).createShader(rect);
    canvas.drawRRect(RRect.fromRectAndRadius(rect, const Radius.circular(4)), paint);
    final n = view.off.length > seat ? view.off[seat] : 0;
    if (n > 0) {
      final tp = TextPainter(
        text: TextSpan(
          text: '$n',
          style: const TextStyle(color: Colors.white70, fontSize: 9, fontWeight: FontWeight.w800),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, rect.center - Offset(tp.width / 2, tp.height / 2));
    }
  }

  @override
  bool shouldRepaint(covariant _BgPainter old) =>
      old.view != view || old.selected != selected || old.destinations != destinations;
}
