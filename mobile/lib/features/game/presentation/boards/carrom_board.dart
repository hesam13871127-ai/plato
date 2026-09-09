import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Parsed carrom view — the engine exposes the whole board (no hidden info).
class _Piece {
  const _Piece(this.k, this.x, this.y, this.potted);
  final int k; // 0 white · 1 black · 8 queen · 9 striker
  final double x;
  final double y;
  final bool potted;
}

class _LastShot {
  const _LastShot(this.seat, this.potted, this.foul, this.reason, this.frames);
  final int seat;
  final List<int> potted;
  final bool foul;
  final String? reason;
  final List<List<double>> frames;
}

class _CarromView {
  _CarromView(Map<String, dynamic> b)
      : pieces = _parse(b['pieces']),
        strikerInHand = b['strikerInHand'] == true,
        queenPending = b['queenPending'] == true,
        queenCoveredBy = (b['queenCoveredBy'] as num?)?.toInt(),
        lastShot = _lastShot(b['lastShot']);

  final List<_Piece> pieces;
  final bool strikerInHand;
  final bool queenPending;
  final int? queenCoveredBy;
  final _LastShot? lastShot;

  static List<_Piece> _parse(Object? raw) => ((raw as List?) ?? const [])
      .whereType<Map>()
      .map(
        (m) => _Piece(
          (m['k'] as num?)?.toInt() ?? 0,
          (m['x'] as num?)?.toDouble() ?? 0,
          (m['y'] as num?)?.toDouble() ?? 0,
          m['potted'] == true,
        ),
      )
      .toList();

  static _LastShot? _lastShot(Object? raw) {
    final m = raw as Map?;
    if (m == null) return null;
    return _LastShot(
      (m['seat'] as num?)?.toInt() ?? 0,
      ((m['potted'] as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList(),
      m['foul'] == true,
      m['reason'] as String?,
      ((m['frames'] as List?) ?? const [])
          .whereType<List>()
          .map((f) => f.whereType<num>().map((n) => n.toDouble()).toList())
          .toList(),
    );
  }

  _Piece? get striker => pieces.firstWhere((p) => p.k == 9, orElse: () => pieces.first);

  int pottedCount(int seat) => pieces.where((p) => p.potted && p.k == seat).length;

  int remaining(int seat) => pieces.where((p) => !p.potted && p.k == seat).length;

  bool get queenDown => pieces.any((p) => p.k == 8 && p.potted);
}

const _board = 100.0;
const _pieceR = 4.0;
const _strikerR = 4.2;
const _pocketR = 5.4;
const _pockets = <Offset>[Offset(0, 0), Offset(100, 0), Offset(0, 100), Offset(100, 100)];
const _baseXMin = 22.0;
const _baseXMax = 78.0;

double _baselineY(int seat) => seat == 0 ? 81.0 : 19.0;

/// Carrom, wave-2 3D board.
///
/// A polished wooden square with four brass pockets and the classic centre
/// rosette. Each turn the striker snaps onto your baseline band (tap the felt
/// to slide it), then drag to aim with a ghost striker and the target's
/// departure line, charge the power slider and flick. Shots replay through
/// the server's deterministic physics keyframes; the red queen glows while
/// she waits for her cover pot.
class CarromBoard extends StatefulWidget {
  const CarromBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<CarromBoard> createState() => _CarromBoardState();
}

class _CarromBoardState extends State<CarromBoard> with SingleTickerProviderStateMixin {
  String _skin = 'wood';
  double? _aimAngle;
  double _power = 0.6;
  double _previewX = 50;

  late final AnimationController _anim = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 60),
  );
  List<List<double>>? _animFrames;
  int _lastVersion = -1;

  _CarromView get _view => _CarromView(widget.session.board);

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  bool get _animating => _animFrames != null && _anim.isAnimating;

  @override
  void initState() {
    super.initState();
    _lastVersion = widget.session.version;
    _anim.addListener(() {
      if (mounted) setState(() {});
    });
  }

  @override
  void didUpdateWidget(covariant CarromBoard old) {
    super.didUpdateWidget(old);
    if (widget.session.version != _lastVersion) {
      _lastVersion = widget.session.version;
      final shot = _view.lastShot;
      if (shot != null && shot.frames.length > 1) {
        _animFrames = shot.frames;
        _anim.duration = Duration(milliseconds: (shot.frames.length - 1) * 66);
        _anim.forward(from: 0);
        _aimAngle = null;
      }
    }
  }

  @override
  void dispose() {
    _anim.dispose();
    super.dispose();
  }

  // ── interaction ───────────────────────────────────────────────────────────

  Offset _toLogical(Offset local, Size size) =>
      Offset(local.dx / size.width * _board, local.dy / size.height * _board);

  void _pan(Offset local, Size size) {
    if (!_myTurn || _view.strikerInHand || _animating) return;
    final p = _toLogical(local, size);
    final striker = _view.striker;
    if (striker == null || striker.potted || striker.k != 9) return;
    final dx = p.dx - striker.x;
    final dy = p.dy - striker.y;
    if (dx * dx + dy * dy < 1) return;
    GameFeedback.tap();
    setState(() => _aimAngle = math.atan2(dy, dx));
  }

  void _strikerPan(Offset local, Size size) {
    if (!_myTurn || !_view.strikerInHand) return;
    final p = _toLogical(local, size);
    final x = p.dx.clamp(_baseXMin + 2, _baseXMax - 2).toDouble();
    if (_strikerFree(x)) {
      GameFeedback.tap();
      setState(() => _previewX = x);
    }
  }

  bool _strikerFree(double x) {
    final y = _baselineY(widget.mySeat);
    for (final p in _view.pieces) {
      if (p.potted || p.k == 9) continue;
      if (math.sqrt((p.x - x) * (p.x - x) + (p.y - y) * (p.y - y)) < 8.4) return false;
    }
    return true;
  }

  void _tap(Offset local, Size size) {
    final view = _view;
    if (!_myTurn) return;
    if (view.strikerInHand) {
      final p = _toLogical(local, size);
      final x = p.dx.clamp(_baseXMin + 2, _baseXMax - 2).toDouble();
      if (!_strikerFree(x)) {
        GameFeedback.error();
        return;
      }
      GameFeedback.tap();
      widget.onAction('place', {'x': x, 'y': _baselineY(widget.mySeat)});
      return;
    }
    _pan(local, size);
  }

  Future<void> _shoot() async {
    if (!_myTurn || _view.strikerInHand || _animating) return;
    var angle = _aimAngle;
    angle ??= _autoAim();
    if (angle == null) return;
    GameFeedback.move();
    await widget.onAction('shoot', {'angle': angle, 'power': _power});
    if (mounted) setState(() => _aimAngle = null);
  }

  double? _autoAim() {
    final view = _view;
    final striker = view.striker;
    if (striker == null) return null;
    final targets = view.pieces.where((p) => !p.potted && p.k == widget.mySeat).toList();
    if (targets.isEmpty) {
      return null; // only the queen/struggle shots left — default below
    }
    _Piece nearest = targets.first;
    var bestDist = double.infinity;
    for (final t in targets) {
      final d = (t.x - striker.x) * (t.x - striker.x) + (t.y - striker.y) * (t.y - striker.y);
      if (d < bestDist) {
        bestDist = d;
        nearest = t;
      }
    }
    return math.atan2(nearest.y - striker.y, nearest.x - striker.x);
  }

  // ── build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final view = _view;
    final skin = BoardSkin.byId(_skin);

    return Column(
      children: [
        TurnIndicator(
          text: _statusText(view),
          highlight: _myTurn,
          icon: Icons.adjust_rounded,
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
                  _Tray(view: view, seat: 0, label: _seatLabel(0), mine: widget.mySeat == 0),
                  _Tray(view: view, seat: 1, label: _seatLabel(1), mine: widget.mySeat == 1),
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
                      onPanUpdate: (d) {
                        if (_view.strikerInHand && _myTurn) {
                          _strikerPan(d.localPosition, size);
                        } else {
                          _pan(d.localPosition, size);
                        }
                      },
                      onTapUp: (d) => _tap(d.localPosition, size),
                      child: CustomPaint(
                        size: Size.infinite,
                        painter: _CarromPainter(
                          view: view,
                          skin: skin,
                          animFrames: _animating ? _animFrames : null,
                          animT: _anim.value,
                          aimAngle: (_myTurn && !_animating && !view.strikerInHand) ? _aimAngle : null,
                          previewX: (_myTurn && view.strikerInHand) ? _previewX : null,
                          mySeat: widget.mySeat,
                        ),
                      ),
                    ),
                  );
                },
              ),
              const SizedBox(height: 10),
              _controls(view),
            ],
          ),
        ),
      ],
    );
  }

  Widget _controls(_CarromView view) {
    final canShoot = _myTurn && !view.strikerInHand && !_animating;
    if (view.strikerInHand && _myTurn) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: AppColors.softCyan.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.softCyan.withValues(alpha: 0.5)),
        ),
        child: const Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.swipe_rounded, color: AppColors.softCyan, size: 18),
            SizedBox(width: 8),
            Text(
              'STRIKER IN HAND — tap your baseline to place it',
              style: TextStyle(
                color: AppColors.softCyan,
                fontSize: 11.5,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.4,
              ),
            ),
          ],
        ),
      );
    }
    return Row(
      children: [
        const SizedBox(width: 4),
        const Text(
          'POWER',
          style: TextStyle(
            color: AppColors.textSecondary,
            fontSize: 10,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
          ),
        ),
        Expanded(
          child: Slider(
            value: _power,
            min: 0.15,
            max: 1,
            divisions: 17,
            activeColor: AppColors.softCyan,
            inactiveColor: Colors.white.withValues(alpha: 0.12),
            onChanged: canShoot ? (v) => setState(() => _power = v) : null,
          ),
        ),
        SizedBox(
          width: 44,
          child: Text(
            '${(_power * 100).round()}%',
            style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w800),
          ),
        ),
        const SizedBox(width: 6),
        ElevatedButton(
          onPressed: canShoot ? _shoot : null,
          style: ElevatedButton.styleFrom(
            backgroundColor: canShoot ? AppColors.electricPurple : Colors.white.withValues(alpha: 0.08),
            foregroundColor: Colors.white,
            disabledForegroundColor: Colors.white38,
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            elevation: canShoot ? 6 : 0,
          ),
          child: const Text('FLICK', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1)),
        ),
        const SizedBox(width: 4),
      ],
    );
  }

  String _statusText(_CarromView view) {
    if (!widget.session.isInProgress) return 'Game over';
    if (_animating) return 'Pieces sliding…';
    if (!_myTurn) return 'Waiting for the table…';
    if (view.strikerInHand) return 'Place the striker on your baseline';
    if (view.queenPending && view.lastShot?.seat == widget.mySeat) {
      return 'Cover the queen — pot one of your men!';
    }
    return _aimAngle != null ? 'Charge the power and flick!' : 'Your turn — drag on the board to aim';
  }

  String _seatLabel(int seat) {
    if (seat >= widget.session.seats.length) return 'Seat ${seat + 1}';
    return seat == widget.mySeat ? 'You' : widget.session.seats[seat].displayName;
  }
}

// ── trays ───────────────────────────────────────────────────────────────────

class _Tray extends StatelessWidget {
  const _Tray({required this.view, required this.seat, required this.label, required this.mine});

  final _CarromView view;
  final int seat;
  final String label;
  final bool mine;

  @override
  Widget build(BuildContext context) {
    final potted = view.pottedCount(seat);
    final color = seat == 0 ? const Color(0xFFF2EEE2) : const Color(0xFF23262E);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          '$label · $potted/9',
          style: TextStyle(
            color: mine ? AppColors.softCyan : AppColors.textSecondary,
            fontSize: 11,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(width: 6),
        for (var i = 0; i < 9; i++)
          Container(
            width: 8,
            height: 8,
            margin: const EdgeInsets.only(right: 2.5),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: i < potted ? color : Colors.transparent,
              border: Border.all(color: i < potted ? Colors.white24 : Colors.white12, width: 0.8),
            ),
          ),
        if (view.queenCoveredBy == seat)
          Container(
            margin: const EdgeInsets.only(left: 4),
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: const Color(0xFFB3212E),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Text(
              'QUEEN',
              style: TextStyle(color: Colors.white, fontSize: 8.5, fontWeight: FontWeight.w900),
            ),
          ),
      ],
    );
  }
}

// ── the board painter ───────────────────────────────────────────────────────

class _CarromPainter extends CustomPainter {
  _CarromPainter({
    required this.view,
    required this.skin,
    required this.animFrames,
    required this.animT,
    required this.aimAngle,
    required this.previewX,
    required this.mySeat,
  });

  final _CarromView view;
  final BoardSkin skin;
  final List<List<double>>? animFrames;
  final double animT;
  final double? aimAngle;
  final double? previewX;
  final int mySeat;

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / _board;
    canvas.save();
    canvas.scale(s, s);

    // Wooden outer frame.
    final frame = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [
          Color.lerp(skin.edge, Colors.white, 0.18)!,
          skin.edge,
          Color.lerp(skin.edge, Colors.black, 0.55)!,
        ],
      ).createShader(const Rect.fromLTWH(0, 0, _board, _board));
    canvas.drawRRect(
      RRect.fromRectAndRadius(const Rect.fromLTWH(0, 0, _board, _board), const Radius.circular(6)),
      frame,
    );

    // Polished playing surface.
    final surface = Paint()
      ..shader = RadialGradient(
        center: const Alignment(-0.15, -0.25),
        radius: 1.4,
        colors: [
          const Color(0xFFF0DEB8),
          const Color(0xFFE4CD9C),
          const Color(0xFFC9AC74),
        ],
      ).createShader(const Rect.fromLTWH(3, 3, _board - 6, _board - 6));
    canvas.drawRRect(
      RRect.fromRectAndRadius(const Rect.fromLTWH(3, 3, _board - 6, _board - 6), const Radius.circular(4)),
      surface,
    );

    // Decorative inlay lines.
    final ink = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.5
      ..color = const Color(0xFF5C4326).withValues(alpha: 0.85);
    canvas.drawRRect(
      RRect.fromRectAndRadius(const Rect.fromLTWH(10, 10, _board - 20, _board - 20), const Radius.circular(2)),
      ink,
    );
    // Centre rosette.
    canvas.drawCircle(const Offset(50, 50), 8.6, ink);
    canvas.drawCircle(const Offset(50, 50), 1.2, ink..style = PaintingStyle.fill);

    // Baseline bands with base circles.
    for (final seat in [0, 1]) {
      final y = _baselineY(seat);
      final yLo = seat == 0 ? 79.0 : 17.0;
      final yHi = seat == 0 ? 83.0 : 21.0;
      final line = Paint()
        ..strokeWidth = 0.45
        ..color = const Color(0xFF3E2C54).withValues(alpha: 0.9);
      canvas.drawLine(Offset(_baseXMin, yLo), Offset(_baseXMax, yLo), line);
      canvas.drawLine(Offset(_baseXMin, yHi), Offset(_baseXMax, yHi), line);
      // Arrow towards the centre.
      final arrow = Paint()
        ..strokeWidth = 0.45
        ..color = const Color(0xFFB3212E).withValues(alpha: 0.9)
        ..strokeCap = StrokeCap.round;
      final dir = seat == 0 ? -1.0 : 1.0;
      canvas.drawLine(Offset(50, y + dir * 2.5), Offset(50, y + dir * 8.5), arrow);
      for (final bx in [_baseXMin, _baseXMax]) {
        final circle = Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 0.55
          ..color = const Color(0xFFB3212E).withValues(alpha: 0.95);
        canvas.drawCircle(Offset(bx.toDouble(), y), 2.1, circle);
      }
    }

    // Pockets.
    for (final p in _pockets) {
      final pocket = Paint()
        ..shader = RadialGradient(colors: [const Color(0xFF05070C), const Color(0xFF1A140C)]).createShader(
          Rect.fromCircle(center: p, radius: _pocketR + 1),
        );
      canvas.drawCircle(p, _pocketR + 1, pocket);
      final rim = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.8
        ..color = const Color(0xFFC9A86A).withValues(alpha: 0.9);
      canvas.drawCircle(p, _pocketR + 1, rim);
    }

    // Piece positions: server keyframes during replay, resting state otherwise.
    final positions = _positions();
    final striker = view.striker;

    // Striker preview on the baseline while in hand.
    if (previewX != null && (striker == null || striker.potted || striker.k != 9)) {
      final ghost = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.7
        ..color = AppColors.softCyan.withValues(alpha: 0.9);
      canvas.drawCircle(Offset(previewX!, _baselineY(mySeat)), _strikerR, ghost);
    } else if (previewX != null) {
      _paintPiece(canvas, 9, Offset(previewX!, _baselineY(mySeat)), ghost: true);
    }

    // Aim overlay.
    if (aimAngle != null && striker != null && !striker.potted && striker.k == 9) {
      _paintAim(canvas, striker, aimAngle!);
    }

    // Pieces.
    for (var i = 0; i < view.pieces.length; i++) {
      final p = view.pieces[i];
      if (p.k == 9 && (view.strikerInHand || animFrames == null && p.potted)) continue;
      final pos = positions[i];
      if (pos == null) continue;
      _paintPiece(canvas, p.k, pos, isQueenPending: p.k == 8 && view.queenPending);
    }

    canvas.restore();
  }

  List<Offset?> _positions() {
    final frames = animFrames;
    final out = List<Offset?>.filled(view.pieces.length, null);
    if (frames != null && frames.length > 1) {
      final t = (animT.clamp(0.0, 1.0)) * (frames.length - 1);
      final i0 = t.floor();
      final i1 = (i0 + 1).clamp(0, frames.length - 1);
      final f = t - i0;
      for (var b = 0; b < out.length; b++) {
        final k = b * 2;
        final a = frames[i0];
        final c = frames[i1];
        if (a.length <= k + 1 || c.length <= k + 1) continue;
        if (a[k] < 0 && c[k] < 0) continue;
        final x = a[k] < 0 ? c[k] : (c[k] < 0 ? a[k] : a[k] + (c[k] - a[k]) * f);
        final y = a[k + 1] < 0 ? c[k + 1] : (c[k + 1] < 0 ? a[k + 1] : a[k + 1] + (c[k + 1] - a[k + 1]) * f);
        out[b] = Offset(x, y);
      }
      return out;
    }
    for (var i = 0; i < view.pieces.length; i++) {
      final p = view.pieces[i];
      out[i] = p.potted ? null : Offset(p.x, p.y);
    }
    return out;
  }

  void _paintAim(Canvas canvas, _Piece striker, double angle) {
    final dir = Offset(math.cos(angle), math.sin(angle));
    final from = Offset(striker.x, striker.y);

    var bestT = double.infinity;
    Offset? contact;
    int? hitPiece;
    for (var i = 0; i < view.pieces.length; i++) {
      final p = view.pieces[i];
      if (p.potted || p.k == 9) continue;
      final rel = Offset(p.x - from.dx, p.y - from.dy);
      final proj = rel.dx * dir.dx + rel.dy * dir.dy;
      if (proj <= 0) continue;
      final perp2 = rel.dx * rel.dx + rel.dy * rel.dy - proj * proj;
      const rr = _pieceR + _strikerR;
      if (perp2 >= rr * rr) continue;
      final t = proj - math.sqrt(rr * rr - perp2);
      if (t > 0 && t < bestT) {
        bestT = t;
        contact = from + dir * t;
        hitPiece = i;
      }
    }
    double railT = double.infinity;
    if (dir.dx > 0.0001) railT = math.min(railT, (_board - _strikerR - from.dx) / dir.dx);
    if (dir.dx < -0.0001) railT = math.min(railT, (_strikerR - from.dx) / dir.dx);
    if (dir.dy > 0.0001) railT = math.min(railT, (_board - _strikerR - from.dy) / dir.dy);
    if (dir.dy < -0.0001) railT = math.min(railT, (_strikerR - from.dy) / dir.dy);
    if (railT < bestT) {
      bestT = railT;
      contact = from + dir * railT;
      hitPiece = null;
    }
    if (contact == null) return;

    final line = Paint()
      ..strokeWidth = 0.7
      ..color = Colors.white.withValues(alpha: 0.85)
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(from, contact, line);

    if (hitPiece != null) {
      final ghost = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.6
        ..color = Colors.white.withValues(alpha: 0.9);
      canvas.drawCircle(contact, _strikerR, ghost);

      final p = view.pieces[hitPiece];
      final dep = Offset(p.x - contact.dx, p.y - contact.dy);
      final dl = math.sqrt(dep.dx * dep.dx + dep.dy * dep.dy);
      if (dl > 0.01) {
        final d = Offset(dep.dx / dl, dep.dy / dl);
        final start = Offset(p.x, p.y) + d * _pieceR;
        final end = start + d * 13;
        final depLine = Paint()
          ..strokeWidth = 0.7
          ..color = AppColors.softCyan.withValues(alpha: 0.9)
          ..strokeCap = StrokeCap.round;
        canvas.drawLine(start, end, depLine);
        final perp = Offset(-d.dy, d.dx);
        final arrow = Paint()
          ..strokeWidth = 0.7
          ..color = AppColors.softCyan.withValues(alpha: 0.9)
          ..strokeCap = StrokeCap.round;
        canvas.drawLine(end, end - d * 2.2 + perp * 1.3, arrow);
        canvas.drawLine(end, end - d * 2.2 - perp * 1.3, arrow);
      }
    } else {
      final railDot = Paint()..color = Colors.white.withValues(alpha: 0.8);
      canvas.drawCircle(contact, 0.9, railDot);
    }
  }

  void _paintPiece(Canvas canvas, int k, Offset pos, {bool ghost = false, bool isQueenPending = false}) {
    final r = k == 9 ? _strikerR : _pieceR;

    if (!ghost) {
      final shadow = Paint()..color = Colors.black.withValues(alpha: 0.35);
      canvas.drawOval(
        Rect.fromCenter(center: Offset(pos.dx + 0.6, pos.dy + 1.0), width: r * 1.9, height: r * 1.4),
        shadow,
      );
    }

    final base = k == 0
        ? const Color(0xFFF2EEE2)
        : k == 1
            ? const Color(0xFF23262E)
            : k == 8
                ? const Color(0xFFB3212E)
                : const Color(0xFFFAF6EA);

    final body = Paint()
      ..shader = RadialGradient(
        center: const Alignment(-0.35, -0.45),
        radius: 1.15,
        colors: [
          Color.lerp(base, Colors.white, 0.55)!,
          base,
          Color.lerp(base, Colors.black, 0.5)!,
        ],
        stops: const [0.0, 0.55, 1.0],
      ).createShader(Rect.fromCircle(center: pos, radius: r));
    if (ghost) {
      canvas.drawCircle(pos, r, Paint()..color = base.withValues(alpha: 0.35));
    } else {
      canvas.drawCircle(pos, r, body);
    }

    // Concentric ring detail (classic carrom men).
    final ring = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.5
      ..color = Color.lerp(base, Colors.black, 0.35)!.withValues(alpha: ghost ? 0.35 : 0.7);
    canvas.drawCircle(pos, r * 0.55, ring);

    // Striker navy rim.
    if (k == 9) {
      final rim = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.7
        ..color = const Color(0xFF26418C).withValues(alpha: ghost ? 0.5 : 0.95);
      canvas.drawCircle(pos, r * 0.92, rim);
    }

    // Pending-queen glow.
    if (isQueenPending) {
      final glow = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.8
        ..color = const Color(0xFFFFD166).withValues(alpha: 0.9);
      canvas.drawCircle(pos, r + 1.2, glow);
    }

    if (!ghost) {
      final spec = Paint()
        ..shader = RadialGradient(
          colors: [Colors.white.withValues(alpha: 0.8), Colors.white.withValues(alpha: 0.0)],
        ).createShader(Rect.fromCircle(center: pos + const Offset(-1.2, -1.5), radius: r * 0.6));
      canvas.drawCircle(pos + const Offset(-1.2, -1.5), r * 0.55, spec);
    }
  }

  @override
  bool shouldRepaint(covariant _CarromPainter old) =>
      old.view != view ||
      old.animT != animT ||
      old.aimAngle != aimAngle ||
      old.animFrames != animFrames ||
      old.previewX != previewX;
}
