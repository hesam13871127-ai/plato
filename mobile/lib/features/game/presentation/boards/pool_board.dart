import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Parsed pool view — the engine exposes the whole table (no hidden info).
class _Ball {
  const _Ball(this.n, this.x, this.y, this.potted);
  final int n; // 0 cue, 1-7 solids, 8 black, 9-15 stripes
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

class _PoolView {
  _PoolView(Map<String, dynamic> b)
      : balls = _parse(b['balls']),
        openTable = b['openTable'] == true,
        groups = _groups(b['groups']),
        ballInHand = b['ballInHand'] == true,
        lastShot = _lastShot(b['lastShot']);

  final List<_Ball> balls;
  final bool openTable;
  final List<int?> groups; // 0 solids / 1 stripes per seat
  final bool ballInHand;
  final _LastShot? lastShot;

  static List<_Ball> _parse(Object? raw) => ((raw as List?) ?? const [])
      .whereType<Map>()
      .map(
        (m) => _Ball(
          (m['n'] as num?)?.toInt() ?? 0,
          (m['x'] as num?)?.toDouble() ?? 0,
          (m['y'] as num?)?.toDouble() ?? 0,
          m['potted'] == true,
        ),
      )
      .toList();

  static List<int?> _groups(Object? raw) =>
      raw is List && raw.length == 2 ? [raw[0] is num ? (raw[0] as num).toInt() : null, raw[1] is num ? (raw[1] as num).toInt() : null] : [null, null];

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

  _Ball? get cue => balls.firstWhere((b) => b.n == 0 && !b.potted, orElse: () => balls.first);

  /// Object balls still on the table for `seat`'s group (empty → on the 8).
  List<_Ball> remainingFor(int seat) {
    final g = groups.length > seat ? groups[seat] : null;
    if (g == null) {
      return balls.where((b) => !b.potted && b.n != 0 && b.n != 8).toList();
    }
    return balls.where((b) => !b.potted && b.n != 0 && b.n != 8 && (b.n < 8 ? 0 : 1) == g).toList();
  }

  bool onEight(int seat) => !openTable && groups[seat] != null && remainingFor(seat).isEmpty;

  /// Balls of `seat`'s group that are down (or all object balls while open).
  List<_Ball> pottedFor(int seat) {
    if (openTable || groups[seat] == null) {
      return balls.where((b) => b.potted && b.n != 0 && b.n != 8).toList();
    }
    final g = groups[seat]!;
    return balls.where((b) => b.potted && b.n != 0 && b.n != 8 && (b.n < 8 ? 0 : 1) == g).toList();
  }
}

const _ballColors = <int, Color>{
  1: Color(0xFFF5C518), 9: Color(0xFFF5C518),
  2: Color(0xFF1E5AAF), 10: Color(0xFF1E5AAF),
  3: Color(0xFFD62828), 11: Color(0xFFD62828),
  4: Color(0xFF6B3FA0), 12: Color(0xFF6B3FA0),
  5: Color(0xFFF77F00), 13: Color(0xFFF77F00),
  6: Color(0xFF1D9E52), 14: Color(0xFF1D9E52),
  7: Color(0xFF7B2D26), 15: Color(0xFF7B2D26),
};

const _tableW = 200.0;
const _tableH = 100.0;
const _ballR = 3.0;
const _pockets = <Offset>[
  Offset(0, 0), Offset(100, 0), Offset(200, 0),
  Offset(0, 100), Offset(100, 100), Offset(200, 100),
];

/// Arcade 8-ball Pool, wave-2 3D board.
///
/// A raised baize table with brass-trimmed pockets and numbered sphere balls
/// (solids full-colour, stripes banded). Drag on the felt to aim — a ghost
/// cue and the target's departure line preview the shot — then charge the
/// power slider and fire. Shots replay through the server's deterministic
/// physics keyframes; fouls hand over ball-in-hand (tap the felt to place).
class PoolBoard extends StatefulWidget {
  const PoolBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<PoolBoard> createState() => _PoolBoardState();
}

class _PoolBoardState extends State<PoolBoard> with SingleTickerProviderStateMixin {
  String _skin = 'wood';
  double? _aimAngle;
  double _power = 0.6;

  late final AnimationController _anim = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 60),
  );
  List<List<double>>? _animFrames;
  int _lastVersion = -1;

  _PoolView get _view => _PoolView(widget.session.board);

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
  void didUpdateWidget(covariant PoolBoard old) {
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
      Offset(local.dx / size.width * _tableW, local.dy / size.height * _tableH);

  void _pan(Offset local, Size size) {
    if (!_myTurn || _view.ballInHand || _animating) return;
    final p = _toLogical(local, size);
    final cue = _view.cue;
    if (cue == null || cue.potted) return;
    final dx = p.dx - cue.x;
    final dy = p.dy - cue.y;
    if (dx * dx + dy * dy < 1) return;
    GameFeedback.tap();
    setState(() => _aimAngle = _normAngle(math.atan2(dy, dx)));
  }

  double _normAngle(double a) {
    var r = a;
    while (r < 0) {
      r += 2 * 3.141592653589793;
    }
    while (r >= 2 * 3.141592653589793) {
      r -= 2 * 3.141592653589793;
    }
    return r;
  }

  void _tap(Offset local, Size size) {
    final view = _view;
    if (!_myTurn) return;
    if (view.ballInHand) {
      final p = _toLogical(local, size);
      if (_validSpot(view, p.dx, p.dy)) {
        GameFeedback.tap();
        widget.onAction('place', {'x': p.dx, 'y': p.dy});
      } else {
        GameFeedback.error();
      }
      return;
    }
    _pan(local, size);
  }

  bool _validSpot(_PoolView view, double x, double y) {
    if (x < _ballR + 0.2 || x > _tableW - _ballR - 0.2) return false;
    if (y < _ballR + 0.2 || y > _tableH - _ballR - 0.2) return false;
    for (final b in view.balls) {
      if (b.potted || b.n == 0) continue;
      final d = ((b.x - x) * (b.x - x)) + ((b.y - y) * (b.y - y));
      if (d < (2 * _ballR + 0.05) * (2 * _ballR + 0.05)) return false;
    }
    for (final p in _pockets) {
      final d = ((p.dx - x) * (p.dx - x)) + ((p.dy - y) * (p.dy - y));
      if (d < 9.2 * 9.2) return false;
    }
    return true;
  }

  Future<void> _shoot() async {
    if (!_myTurn || _view.ballInHand || _animating) return;
    var angle = _aimAngle;
    angle ??= _autoAim();
    if (angle == null) return;
    GameFeedback.move();
    await widget.onAction('shoot', {'angle': angle, 'power': _power});
    if (mounted) setState(() => _aimAngle = null);
  }

  /// Aim at the nearest own ball so the SHOOT button always has a sane default.
  double? _autoAim() {
    final view = _view;
    final cue = view.cue;
    if (cue == null) return null;
    final targets = view.openTable || view.groups[widget.mySeat] == null
        ? view.balls.where((b) => !b.potted && b.n != 0 && b.n != 8).toList()
        : view.onEight(widget.mySeat)
            ? view.balls.where((b) => !b.potted && b.n == 8).toList()
            : view.remainingFor(widget.mySeat);
    if (targets.isEmpty) return null;
    _Ball nearest = targets.first;
    var bestDist = double.infinity;
    for (final t in targets) {
      final d = ((t.x - cue.x) * (t.x - cue.x)) + ((t.y - cue.y) * (t.y - cue.y));
      if (d < bestDist) {
        bestDist = d;
        nearest = t;
      }
    }
    return math.atan2(nearest.y - cue.y, nearest.x - cue.x);
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
          icon: Icons.sports_bar_rounded,
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
                  final size = Size(constraints.maxWidth, constraints.maxWidth / 2);
                  return AspectRatio(
                    aspectRatio: 2,
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onPanUpdate: (d) => _pan(d.localPosition, size),
                      onTapUp: (d) => _tap(d.localPosition, size),
                      child: CustomPaint(
                        size: Size.infinite,
                        painter: _TablePainter(
                          view: view,
                          skin: skin,
                          animFrames: _animating ? _animFrames : null,
                          animT: _anim.value,
                          aimAngle: (_myTurn && !_animating && !view.ballInHand) ? _aimAngle : null,
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

  Widget _controls(_PoolView view) {
    final canShoot = _myTurn && !view.ballInHand && !_animating;
    if (view.ballInHand && _myTurn) {
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
            Icon(Icons.ads_click_rounded, color: AppColors.softCyan, size: 18),
            SizedBox(width: 8),
            Text(
              'BALL IN HAND — tap open felt to place the cue',
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
        Text(
          'POWER',
          style: const TextStyle(
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
          child: const Text('SHOOT', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1)),
        ),
        const SizedBox(width: 4),
      ],
    );
  }

  String _statusText(_PoolView view) {
    if (!widget.session.isInProgress) return 'Game over';
    if (_animating) return 'Balls rolling…';
    if (!_myTurn) return 'Waiting for the table…';
    if (view.ballInHand) return 'Ball in hand — tap the felt to place the cue';
    if (view.onEight(widget.mySeat)) return 'You are on the 8-ball — finish it!';
    if (view.openTable) return 'Open table — sink a ball to claim your group';
    return _aimAngle != null ? 'Charge the power and fire!' : 'Your shot — drag on the felt to aim';
  }

  String _seatLabel(int seat) {
    if (seat >= widget.session.seats.length) return 'Seat ${seat + 1}';
    return seat == widget.mySeat ? 'You' : widget.session.seats[seat].displayName;
  }
}

// ── trays ───────────────────────────────────────────────────────────────────

class _Tray extends StatelessWidget {
  const _Tray({required this.view, required this.seat, required this.label, required this.mine});

  final _PoolView view;
  final int seat;
  final String label;
  final bool mine;

  @override
  Widget build(BuildContext context) {
    final potted = view.pottedFor(seat);
    final onEight = view.onEight(seat);
    final groupLabel = view.openTable
        ? 'OPEN'
        : view.groups[seat] == 0
            ? 'SOLIDS'
            : 'STRIPES';
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          '$label · $groupLabel',
          style: TextStyle(
            color: mine ? AppColors.softCyan : AppColors.textSecondary,
            fontSize: 11,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(width: 6),
        for (final b in potted.take(7))
          Container(
            width: 10,
            height: 10,
            margin: const EdgeInsets.only(right: 3),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: _ballColors[b.n] ?? Colors.grey,
              border: Border.all(color: Colors.white24, width: 0.6),
            ),
          ),
        if (onEight)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: Colors.black,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: AppColors.danger),
            ),
            child: const Text(
              'ON 8',
              style: TextStyle(color: AppColors.danger, fontSize: 8.5, fontWeight: FontWeight.w900),
            ),
          ),
      ],
    );
  }
}

// ── the table painter ───────────────────────────────────────────────────────

class _TablePainter extends CustomPainter {
  _TablePainter({
    required this.view,
    required this.skin,
    required this.animFrames,
    required this.animT,
    required this.aimAngle,
    required this.mySeat,
  });

  final _PoolView view;
  final BoardSkin skin;
  final List<List<double>>? animFrames;
  final double animT;
  final double? aimAngle;
  final int mySeat;

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / _tableW;
    canvas.save();
    canvas.scale(s, s);

    // Wooden outer rail.
    final rail = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color.lerp(skin.edge, Colors.white, 0.15)!, skin.edge, Color.lerp(skin.edge, Colors.black, 0.55)!],
      ).createShader(Rect.fromLTWH(0, 0, _tableW, _tableH));
    canvas.drawRRect(
      RRect.fromRectAndRadius(const Rect.fromLTWH(0, 0, _tableW, _tableH), const Radius.circular(8)),
      rail,
    );

    // Baize with a soft light pool.
    final felt = Paint()
      ..shader = RadialGradient(
        center: const Alignment(-0.2, -0.3),
        radius: 1.4,
        colors: [Color.lerp(skin.feltTop, Colors.white, 0.10)!, skin.feltTop, Color.lerp(skin.feltTop, Colors.black, 0.35)!],
      ).createShader(const Rect.fromLTWH(4, 4, _tableW - 8, _tableH - 8));
    canvas.drawRRect(
      RRect.fromRectAndRadius(const Rect.fromLTWH(4, 4, _tableW - 8, _tableH - 8), const Radius.circular(5)),
      felt,
    );

    // Cushion shading.
    final cushion = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.4
      ..color = Color.lerp(skin.feltTop, Colors.black, 0.45)!.withValues(alpha: 0.8);
    canvas.drawRRect(
      RRect.fromRectAndRadius(const Rect.fromLTWH(5.2, 5.2, _tableW - 10.4, _tableH - 10.4), const Radius.circular(4)),
      cushion,
    );

    // Head & foot spots.
    final spot = Paint()..color = Colors.white.withValues(alpha: 0.35);
    canvas.drawCircle(const Offset(50, 50), 0.7, spot);
    canvas.drawCircle(const Offset(150, 50), 0.7, spot);

    // Pockets.
    for (final p in _pockets) {
      final pocket = Paint()
        ..shader = RadialGradient(colors: [const Color(0xFF05070C), const Color(0xFF141B26)]).createShader(
          Rect.fromCircle(center: p, radius: 6.4),
        );
      canvas.drawCircle(p, 6.4, pocket);
      final rim = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.9
        ..color = const Color(0xFFC9A86A).withValues(alpha: 0.8);
      canvas.drawCircle(p, 6.4, rim);
    }

    // Ball positions: live animation frames override the resting state.
    final positions = _positions();
    final cue = view.cue;

    // Aim overlay under the balls' shadows.
    if (aimAngle != null && cue != null && !cue.potted) {
      _paintAim(canvas, cue, aimAngle!);
    }

    // Balls.
    for (var i = 0; i < view.balls.length; i++) {
      final b = view.balls[i];
      final pos = positions[i];
      if (pos == null) continue;
      _paintBall(canvas, b.n, pos);
    }

    canvas.restore();
  }

  List<Offset?> _positions() {
    final frames = animFrames;
    final out = List<Offset?>.filled(view.balls.length, null);
    if (frames != null && frames.length > 1) {
      final t = animT.clamp(0.0, 1.0) * (frames.length - 1);
      final i0 = t.floor();
      final i1 = (i0 + 1).clamp(0, frames.length - 1);
      final f = t - i0;
      for (var b = 0; b < out.length; b++) {
        final k = b * 2;
        final a = frames[i0];
        final c = frames[i1];
        if (a.length <= k + 1 || c.length <= k + 1) continue;
        if (a[k] < 0 && c[k] < 0) continue; // potted
        final x = a[k] < 0 ? c[k] : (c[k] < 0 ? a[k] : a[k] + (c[k] - a[k]) * f);
        final y = a[k + 1] < 0 ? c[k + 1] : (c[k + 1] < 0 ? a[k + 1] : a[k + 1] + (c[k + 1] - a[k + 1]) * f);
        out[b] = Offset(x, y);
      }
      return out;
    }
    for (var i = 0; i < view.balls.length; i++) {
      final b = view.balls[i];
      out[i] = b.potted ? null : Offset(b.x, b.y);
    }
    return out;
  }

  void _paintAim(Canvas canvas, _Ball cue, double angle) {
    final dir = Offset(math.cos(angle), math.sin(angle));
    final from = Offset(cue.x, cue.y);

    // Raycast to the first ball contact (ghost centre) or rail.
    var bestT = double.infinity;
    Offset? contact;
    int? hitBall;
    for (var i = 0; i < view.balls.length; i++) {
      final b = view.balls[i];
      if (b.potted || b.n == 0) continue;
      final rel = Offset(b.x - from.dx, b.y - from.dy);
      final proj = rel.dx * dir.dx + rel.dy * dir.dy;
      if (proj <= 0) continue;
      final perp2 = rel.dx * rel.dx + rel.dy * rel.dy - proj * proj;
      const rr = 2 * _ballR;
      if (perp2 >= rr * rr) continue;
      final t = proj - math.sqrt(rr * rr - perp2);
      if (t > 0 && t < bestT) {
        bestT = t;
        contact = from + dir * t;
        hitBall = i;
      }
    }
    // Rails.
    double railT = double.infinity;
    if (dir.dx > 0.0001) railT = math.min(railT, (_tableW - _ballR - from.dx) / dir.dx);
    if (dir.dx < -0.0001) railT = math.min(railT, (_ballR - from.dx) / dir.dx);
    if (dir.dy > 0.0001) railT = math.min(railT, (_tableH - _ballR - from.dy) / dir.dy);
    if (dir.dy < -0.0001) railT = math.min(railT, (_ballR - from.dy) / dir.dy);
    if (railT < bestT) {
      bestT = railT;
      contact = from + dir * railT;
      hitBall = null;
    }
    if (contact == null) return;

    final line = Paint()
      ..strokeWidth = 0.7
      ..color = Colors.white.withValues(alpha: 0.85)
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(from, contact, line);

    if (hitBall != null) {
      // Ghost cue ball at the contact point.
      final ghost = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.6
        ..color = Colors.white.withValues(alpha: 0.9);
      canvas.drawCircle(contact, _ballR, ghost);

      // The struck ball's departure line.
      final b = view.balls[hitBall];
      final dep = Offset(b.x - contact.dx, b.y - contact.dy);
      final dl = math.sqrt(dep.dx * dep.dx + dep.dy * dep.dy);
      if (dl > 0.01) {
        final d = Offset(dep.dx / dl, dep.dy / dl);
        final start = Offset(b.x, b.y) + d * _ballR;
        final end = start + d * 14;
        final depLine = Paint()
          ..strokeWidth = 0.7
          ..color = AppColors.softCyan.withValues(alpha: 0.9)
          ..strokeCap = StrokeCap.round;
        canvas.drawLine(start, end, depLine);
        // Arrowhead.
        final perp = Offset(-d.dy, d.dx);
        final arrow = Paint()
          ..strokeWidth = 0.7
          ..color = AppColors.softCyan.withValues(alpha: 0.9)
          ..strokeCap = StrokeCap.round;
        canvas.drawLine(end, end - d * 2.4 + perp * 1.4, arrow);
        canvas.drawLine(end, end - d * 2.4 - perp * 1.4, arrow);
      }
    } else {
      final railDot = Paint()..color = Colors.white.withValues(alpha: 0.8);
      canvas.drawCircle(contact, 0.9, railDot);
    }
  }

  void _paintBall(Canvas canvas, int n, Offset pos) {
    // Contact shadow.
    final shadow = Paint()..color = Colors.black.withValues(alpha: 0.4);
    canvas.drawOval(
      Rect.fromCenter(center: Offset(pos.dx + 0.7, pos.dy + 1.1), width: _ballR * 1.9, height: _ballR * 1.5),
      shadow,
    );

    final isStripe = n > 8;
    final base = n == 0
        ? const Color(0xFFF4F1E8)
        : n == 8
            ? const Color(0xFF15171C)
            : _ballColors[n] ?? Colors.grey;

    // Sphere body.
    final body = Paint()
      ..shader = RadialGradient(
        center: const Alignment(-0.35, -0.45),
        radius: 1.15,
        colors: [
          Color.lerp(base, Colors.white, 0.55)!,
          base,
          Color.lerp(base, Colors.black, 0.55)!,
        ],
        stops: const [0.0, 0.55, 1.0],
      ).createShader(Rect.fromCircle(center: pos, radius: _ballR));
    canvas.drawCircle(pos, _ballR, body);

    // Stripe band.
    if (isStripe) {
      canvas.save();
      canvas.clipPath(Path()..addOval(Rect.fromCircle(center: pos, radius: _ballR)));
      final band = Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Color.lerp(base, Colors.white, 0.45)!,
            base,
            Color.lerp(base, Colors.black, 0.35)!,
          ],
        ).createShader(Rect.fromCircle(center: pos, radius: _ballR));
      final rect = Rect.fromCenter(center: pos, width: _ballR * 2, height: _ballR * 1.15);
      canvas.drawRect(rect, band);
      canvas.restore();
    }

    // Number disc (object balls).
    if (n > 0) {
      final disc = Paint()
        ..shader = RadialGradient(
          center: const Alignment(-0.3, -0.4),
          colors: [Colors.white, const Color(0xFFE8E4D8)],
        ).createShader(Rect.fromCircle(center: pos, radius: _ballR * 0.52));
      canvas.drawCircle(pos, _ballR * 0.52, disc);
      _paintNumber(canvas, n, pos);
    } else {
      // Red dot on the cue ball.
      final dot = Paint()..color = const Color(0xFFC0392B).withValues(alpha: 0.9);
      canvas.drawCircle(pos + const Offset(-1, -1), 0.55, dot);
    }

    // Glossy specular.
    final spec = Paint()
      ..shader = RadialGradient(
        colors: [Colors.white.withValues(alpha: 0.85), Colors.white.withValues(alpha: 0.0)],
      ).createShader(Rect.fromCircle(center: pos + const Offset(-1.1, -1.3), radius: _ballR * 0.6));
    canvas.drawCircle(pos + const Offset(-1.1, -1.3), _ballR * 0.55, spec);
  }

  void _paintNumber(Canvas canvas, int n, Offset pos) {
    final tp = TextPainter(
      text: TextSpan(
        text: '$n',
        style: const TextStyle(
          color: Color(0xFF22262E),
          fontSize: 3.1,
          fontWeight: FontWeight.w900,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, pos - Offset(tp.width / 2, tp.height / 2));
  }

  @override
  bool shouldRepaint(covariant _TablePainter old) =>
      old.view != view ||
      old.animT != animT ||
      old.aimAngle != aimAngle ||
      old.animFrames != animFrames;
}
