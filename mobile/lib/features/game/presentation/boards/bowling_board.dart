import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Parsed bowling view — the engine exposes the whole sheet.
class _BowlView {
  _BowlView(Map<String, dynamic> b)
      : pins = _pins(b['pins']),
        frameNumber = (b['frameNumber'] as num?)?.toInt() ?? 1,
        rollsThisFrame = (b['rollsThisFrame'] as num?)?.toInt() ?? 0,
        frames = _rolls(b['frames']),
        lastShot = _shot(b['lastShot']);

  final List<_Pin> pins;
  final int frameNumber;
  final int rollsThisFrame;
  final List<List<int>> frames;
  final _LastShot? lastShot;

  static List<_Pin> _pins(Object? raw) => ((raw as List?) ?? const [])
      .whereType<Map>()
      .map(
        (m) => _Pin(
          (m['x'] as num?)?.toDouble() ?? 0,
          (m['y'] as num?)?.toDouble() ?? 0,
          m['down'] == true,
        ),
      )
      .toList();

  static List<List<int>> _rolls(Object? raw) => ((raw as List?) ?? const [])
      .map((seat) => ((seat as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList())
      .toList();

  static _LastShot? _shot(Object? raw) {
    final m = raw as Map?;
    if (m == null) return null;
    return _LastShot(
      (m['seat'] as num?)?.toInt() ?? 0,
      (m['knocked'] as num?)?.toInt() ?? 0,
      m['gutter'] == true,
      _frames(m['frames']),
    );
  }

  static List<List<double>> _frames(Object? raw) => ((raw as List?) ?? const [])
      .map((f) => ((f as List?) ?? const []).whereType<num>().map((n) => n.toDouble()).toList())
      .toList();
}

class _Pin {
  const _Pin(this.x, this.y, this.down);
  final double x;
  final double y;
  final bool down;
}

class _LastShot {
  const _LastShot(this.seat, this.knocked, this.gutter, this.frames);
  final int seat;
  final int knocked;
  final bool gutter;
  final List<List<double>> frames;
}

/// Standard 10-pin scoring mirror (per-frame cumulative, -1 = pending).
List<int> _scoreFrames(List<int> rolls) {
  final per = <int>[];
  var total = 0;
  var i = 0;
  for (var f = 0; f < 10; f++) {
    if (i >= rolls.length) {
      per.add(-1);
      continue;
    }
    final r1 = rolls[i];
    if (r1 == 10) {
      if (i + 2 < rolls.length) {
        total += 10 + rolls[i + 1] + rolls[i + 2];
        per.add(total);
      } else {
        per.add(-1);
      }
      i += 1;
    } else if (i + 1 < rolls.length) {
      final r2 = rolls[i + 1];
      if (r1 + r2 == 10) {
        if (i + 2 < rolls.length) {
          total += 10 + rolls[i + 2];
          per.add(total);
        } else {
          per.add(-1);
        }
      } else {
        total += r1 + r2;
        per.add(total);
      }
      i += 2;
    } else {
      per.add(-1);
      i += 2;
    }
  }
  return per;
}

/// Bowling, wave-3 3D board.
///
/// A perspective lane with polished boards, ten pin silhouettes on the deck
/// and gutters either side. Drag across the lane to line up the approach,
/// set the power and let it fly — the throw replays from physics keyframes.
/// A classic ten-frame score sheet tracks both bowlers.
class BowlingBoard extends StatefulWidget {
  const BowlingBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<BowlingBoard> createState() => _BowlingBoardState();
}

class _BowlingBoardState extends State<BowlingBoard> with SingleTickerProviderStateMixin {
  String _skin = 'wood';
  double _aim = 0;
  double _power = 0.75;
  int _lastVersion = -1;

  late final AnimationController _anim = AnimationController(vsync: this, duration: const Duration(milliseconds: 900));
  List<List<double>>? _animFrames;

  _BowlView get _view => _BowlView(widget.session.board);

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  bool get _animating => _animFrames != null && _anim.isAnimating;

  @override
  void initState() {
    super.initState();
    _anim.addListener(() {
      if (mounted) setState(() {});
    });
    _lastVersion = widget.session.version;
  }

  @override
  void didUpdateWidget(BowlingBoard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.session.version != _lastVersion) {
      _lastVersion = widget.session.version;
      final shot = _view.lastShot;
      if (shot != null && shot.frames.length > 1) {
        _animFrames = shot.frames;
        _anim.duration = Duration(milliseconds: (shot.frames.length - 1) * 66);
        _anim.forward(from: 0);
      } else {
        _animFrames = null;
      }
    }
  }

  @override
  void dispose() {
    _anim.dispose();
    super.dispose();
  }

  Future<void> _throwBall() async {
    if (!_myTurn || _animating) return;
    GameFeedback.tap();
    await widget.onAction('throw', {'angle': _aim.toStringAsFixed(4), 'power': _power.toStringAsFixed(3)});
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
              _ScoreSheet(
                view: view,
                mySeat: widget.mySeat,
                seatLabel: _seatLabel,
                currentSeat: widget.session.currentSeat,
                inProgress: widget.session.isInProgress,
              ),
              const SizedBox(height: 10),
              AspectRatio(
                aspectRatio: 0.95,
                child: Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(16),
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
                    borderRadius: BorderRadius.circular(11),
                    child: LayoutBuilder(
                      builder: (context, constraints) {
                        return GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onPanUpdate: (d) {
                            if (!_myTurn || _animating) return;
                            setState(() => _aim = (_aim - d.dx / 900).clamp(-0.45, 0.45));
                          },
                          child: CustomPaint(
                            size: Size.infinite,
                            painter: _LanePainter(
                              view: view,
                              myTurn: _myTurn,
                              animating: _animating,
                              animFrames: _animFrames,
                              animT: _anim.value,
                              aim: _aim,
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
              _controls(),
            ],
          ),
        ),
      ],
    );
  }

  Widget _controls() {
    final canThrow = _myTurn && !_animating;
    return Column(
      children: [
        Row(
          children: [
            const Text('POWER', style: TextStyle(color: AppColors.textSecondary, fontSize: 10, fontWeight: FontWeight.w800)),
            Expanded(
              child: Slider(
                value: _power,
                min: 0.15,
                max: 1,
                activeColor: AppColors.electricPurple,
                onChanged: canThrow ? (v) => setState(() => _power = v) : null,
              ),
            ),
            Text(
              '${(_power * 100).round()}%',
              style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w900),
            ),
          ],
        ),
        const SizedBox(height: 4),
        ElevatedButton(
          onPressed: canThrow ? _throwBall : null,
          style: ElevatedButton.styleFrom(
            backgroundColor: canThrow ? AppColors.electricPurple : Colors.white.withValues(alpha: 0.08),
            foregroundColor: Colors.white,
            disabledForegroundColor: Colors.white38,
            padding: const EdgeInsets.symmetric(vertical: 13),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            elevation: canThrow ? 6 : 0,
          ),
          child: Text(
            canThrow ? 'ROLL THE BALL' : 'WAITING…',
            style: const TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1.2, fontSize: 13.5),
          ),
        ),
      ],
    );
  }

  String _statusText(_BowlView view) {
    if (!widget.session.isInProgress) {
      if (widget.session.winnerSeat == null) return 'Game over — dead even';
      return widget.session.winnerSeat == widget.mySeat ? 'You bowled them over!' : 'They edged the series…';
    }
    if (_animating) return 'The ball is away…';
    if (!_myTurn) return 'Waiting for the other bowler…';
    final last = view.lastShot;
    if (last != null && last.gutter) return 'Gutter! Shake it off — line up the next one';
    if (view.rollsThisFrame > 0) return 'Second ball — pick up the spare!';
    return 'Frame ${view.frameNumber} — drag to aim, then roll';
  }

  String _seatLabel(int seat) {
    if (seat >= widget.session.seats.length) return 'Seat ${seat + 1}';
    return seat == widget.mySeat ? 'You' : widget.session.seats[seat].displayName;
  }
}

// ── score sheet ─────────────────────────────────────────────────────────────

class _ScoreSheet extends StatelessWidget {
  const _ScoreSheet({
    required this.view,
    required this.mySeat,
    required this.seatLabel,
    required this.currentSeat,
    required this.inProgress,
  });

  final _BowlView view;
  final int mySeat;
  final String Function(int) seatLabel;
  final int currentSeat;
  final bool inProgress;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (var seat = 0; seat < view.frames.length; seat++)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 3),
            child: Row(
              children: [
                SizedBox(
                  width: 74,
                  child: Text(
                    seatLabel(seat),
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: seat == mySeat ? AppColors.softCyan : AppColors.textSecondary,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                Expanded(
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        for (var f = 0; f < 10; f++) _frameBox(view, seat, f),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _frameBox(_BowlView view, int seat, int f) {
    final rolls = view.frames.length > seat ? view.frames[seat] : <int>[];
    final per = _scoreFrames(rolls);
    final total = f < per.length && per[f] >= 0 ? '${per[f]}' : '';
    final isCurrent = inProgress && view.frameNumber == f + 1 && currentSeat == seat;

    // Roll marks for this frame (X strike, / spare).
    String mark = '';
    var consumed = 0;
    for (var k = 0; k < f; k++) {
      final r = rolls.length > consumed ? rolls[consumed] : null;
      consumed += r == 10 ? 1 : 2;
    }
    final r1 = rolls.length > consumed ? rolls[consumed] : null;
    final r2 = rolls.length > consumed + 1 ? rolls[consumed + 1] : null;
    if (r1 != null) mark = r1 == 10 ? 'X' : '$r1';
    if (r2 != null) mark += r1 == 10 ? (r2 == 10 ? ' X' : ' $r2') : (r1! + r2 == 10 ? ' /' : ' $r2');
    if (f == 9) {
      final r3 = rolls.length > consumed + 2 ? rolls[consumed + 2] : null;
      if (r3 != null) mark += r3 == 10 ? ' X' : ' $r3';
    }

    return Container(
      width: 40,
      height: 34,
      margin: const EdgeInsets.symmetric(horizontal: 1.5),
      decoration: BoxDecoration(
        color: isCurrent ? AppColors.electricPurple.withValues(alpha: 0.25) : Colors.white.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: isCurrent ? AppColors.softCyan : Colors.white.withValues(alpha: 0.12)),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            mark.isEmpty ? '·' : mark,
            style: const TextStyle(color: Colors.white70, fontSize: 9, fontWeight: FontWeight.w700),
          ),
          Text(
            total,
            style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w900),
          ),
        ],
      ),
    );
  }
}


// ── painter ─────────────────────────────────────────────────────────────────

class _LanePainter extends CustomPainter {
  _LanePainter({
    required this.view,
    required this.myTurn,
    required this.animating,
    required this.animFrames,
    required this.animT,
    required this.aim,
    required this.skin,
  });

  final _BowlView view;
  final bool myTurn;
  final bool animating;
  final List<List<double>>? animFrames;
  final double animT;
  final double aim;
  final BoardSkin skin;

  // Lane space: x 0..180 (down-lane), y 0..40 (across).
  static const double laneL = 180;
  static const double laneW = 40;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;

    // Perspective mapping: far deck narrower than the foul line.
    Offset project(double x, double y) {
      final t = x / laneL; // 0 near, 1 far
      final persp = 0.52 + 0.48 * t;
      final cx = w / 2;
      final halfW = w * 0.46 * persp;
      final py = h * 0.12 + (h * 0.84) * t;
      return Offset(cx + (y / laneW - 0.5) * 2 * halfW, py);
    }

    // Lane body.
    final lane = Path()
      ..moveTo(project(0, 0).dx, project(0, 0).dy)
      ..lineTo(project(0, laneW).dx, project(0, laneW).dy)
      ..lineTo(project(laneL, laneW).dx, project(laneL, laneW).dy)
      ..lineTo(project(laneL, 0).dx, project(laneL, 0).dy)
      ..close();
    canvas.drawPath(
      lane,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.bottomCenter,
          end: Alignment.topCenter,
          colors: [
            Color.lerp(skin.feltTop, const Color(0xFFC89B62), 0.55)!,
            const Color(0xFFB5844D),
            Color.lerp(skin.feltTop, const Color(0xFF8A5E2F), 0.4)!,
          ],
        ).createShader(Rect.fromLTWH(0, 0, w, h)),
    );

    // Boards (length-wise grain lines).
    for (var i = 1; i < 10; i++) {
      final y = laneW * i / 10;
      final p = Path()
        ..moveTo(project(0, y).dx, project(0, y).dy)
        ..lineTo(project(laneL, y).dx, project(laneL, y).dy);
      canvas.drawPath(p, Paint()..color = Colors.black.withValues(alpha: 0.10)..strokeWidth = 1..style = PaintingStyle.stroke);
    }

    // Gutters.
    for (final side in [0.0, laneW]) {
      final g = Path()
        ..moveTo(project(0, side).dx, project(0, side).dy)
        ..lineTo(project(0, side == 0 ? -3 : laneW + 3).dx, project(0, side == 0 ? -3 : laneW + 3).dy)
        ..lineTo(project(laneL, side == 0 ? -3 : laneW + 3).dx, project(laneL, side == 0 ? -3 : laneW + 3).dy)
        ..lineTo(project(laneL, side).dx, project(laneL, side).dy)
        ..close();
      canvas.drawPath(g, Paint()..color = const Color(0xFF171A22));
    }

    // Pins (or the animated replay).
    final frames = animFrames;
    if (animating && frames != null && frames.length > 1) {
      final t = (animT.clamp(0.0, 1.0)) * (frames.length - 1);
      final i0 = t.floor();
      final i1 = math.min(i0 + 1, frames.length - 1);
      final f = t - i0;
      final a = frames[i0];
      final b = frames[i1];
      if (a.isNotEmpty && b.isNotEmpty) {
        // frames: [ballX, ballY, pinX, pinY, ...] for the pins in play.
        final ballP = project(_lerp(a[0], b[0], f), _lerp(a[1], b[1], f));
        _paintBall(canvas, ballP, w);
        for (var k = 2; k + 1 < a.length; k += 2) {
          final pp = project(_lerp(a[k], b[k], f), _lerp(a[k + 1], b[k + 1], f));
          _paintPin(canvas, pp, w, true);
        }
      }
    } else {
      for (final p in view.pins) {
        if (p.down) continue;
        _paintPin(canvas, project(p.x, p.y), w, false);
      }
      // Ball waiting at the foul line.
      if (myTurn) {
        final by = laneW / 2 + (aim * 34).clamp(-16.0, 16.0).toDouble();
        _paintBall(canvas, project(8, by), w);
        // Aim guide.
        final from = project(8, by);
        final to = project(150, laneW / 2 + aim * 150 * 1.1);
        final guide = Paint()
          ..color = AppColors.softCyan.withValues(alpha: 0.5)
          ..strokeWidth = 1.5;
        canvas.drawLine(from, to, guide);
      }
    }
  }

  double _lerp(double a, double b, double t) => a + (b - a) * t;

  void _paintPin(Canvas canvas, Offset c, double w, bool flying) {
    final s = w * 0.028;
    final shadow = Paint()..color = Colors.black.withValues(alpha: flying ? 0.15 : 0.35);
    canvas.drawOval(Rect.fromCenter(center: c + const Offset(0.6, 1.2), width: s * 1.6, height: s * 0.9), shadow);
    final body = Paint()
      ..shader = RadialGradient(
        center: const Alignment(-0.3, -0.4),
        radius: 1.1,
        colors: [Colors.white, const Color(0xFFE8E2D6), const Color(0xFFB4AB99)],
      ).createShader(Rect.fromCircle(center: c, radius: s));
    canvas.drawCircle(c, s, body);
    // Two red stripes.
    final stripe = Paint()..color = const Color(0xFFD23B3B)..style = PaintingStyle.stroke..strokeWidth = s * 0.22;
    canvas.drawCircle(c, s * 0.72, stripe);
    canvas.drawCircle(c, s * 0.5, stripe);
  }

  void _paintBall(Canvas canvas, Offset c, double w) {
    final r = w * 0.043;
    final shadow = Paint()..color = Colors.black.withValues(alpha: 0.4);
    canvas.drawOval(Rect.fromCenter(center: c + const Offset(0.8, 1.5), width: r * 2.1, height: r * 1.2), shadow);
    final body = Paint()
      ..shader = RadialGradient(
        center: const Alignment(-0.35, -0.45),
        radius: 1.2,
        colors: [const Color(0xFF7E5CD6), AppColors.electricPurple, const Color(0xFF2E1A5E)],
      ).createShader(Rect.fromCircle(center: c, radius: r));
    canvas.drawCircle(c, r, body);
    final shine = Paint()..color = Colors.white.withValues(alpha: 0.5);
    canvas.drawCircle(c + Offset(-r * 0.35, -r * 0.4), r * 0.16, shine);
  }

  @override
  bool shouldRepaint(covariant _LanePainter old) =>
      old.view != view || old.aim != aim || old.animT != animT || old.myTurn != myTurn;
}
