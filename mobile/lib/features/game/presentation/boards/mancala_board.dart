import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Parsed mancala view — the engine exposes the whole board.
class _MancalaView {
  _MancalaView(Map<String, dynamic> b)
      : pits = _nums(b['pits']),
        lastSow = _lastSow(b['lastSow']);

  /// 0-5 seat 0 pits, 6 store 0, 7-12 seat 1 pits, 13 store 1.
  final List<int> pits;
  final _LastSow? lastSow;

  static List<int> _nums(Object? raw) =>
      ((raw as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();

  static _LastSow? _lastSow(Object? raw) {
    final m = raw as Map?;
    if (m == null) return null;
    return _LastSow(
      (m['seat'] as num?)?.toInt() ?? 0,
      (m['pit'] as num?)?.toInt() ?? 0,
      (m['lastCup'] as num?)?.toInt() ?? -1,
      (m['captured'] as num?)?.toInt() ?? 0,
      m['extraTurn'] == true,
    );
  }

  int get store0 => pits.length > 6 ? pits[6] : 0;
  int get store1 => pits.length > 13 ? pits[13] : 0;
  int at(int i) => pits.length > i ? pits[i] : 0;
}

class _LastSow {
  const _LastSow(this.seat, this.pit, this.lastCup, this.captured, this.extraTurn);
  final int seat;
  final int pit;
  final int lastCup;
  final int captured;
  final bool extraTurn;
}

/// Mancala (Kalah), wave-3 3D board.
///
/// Two ranks of six carved wooden pits on a boat-shaped board with a tall
/// store at each end. Tap one of your pits (bottom rank) to sow its seeds
/// counter-clockwise — the last seed in your store glows cyan for another
/// turn, captures splash gold.
class MancalaBoard extends StatefulWidget {
  const MancalaBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<MancalaBoard> createState() => _MancalaBoardState();
}

class _MancalaBoardState extends State<MancalaBoard> {
  String _skin = 'wood';

  _MancalaView get _view => _MancalaView(widget.session.board);

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  /// My pit number (1-6) for cup index i, or null.
  int? _myPitFor(int cup) {
    final me = widget.mySeat;
    if (me == 0 && cup >= 0 && cup <= 5) return cup + 1;
    if (me == 1 && cup >= 7 && cup <= 12) return cup - 6;
    return null;
  }

  bool _playable(int cup) {
    if (!_myTurn) return false;
    final pit = _myPitFor(cup);
    return pit != null && _view.at(cup) > 0;
  }

  void _tapCup(int cup) {
    if (!_myTurn) return;
    final pit = _myPitFor(cup);
    if (pit == null || _view.at(cup) <= 0) {
      GameFeedback.error();
      return;
    }
    GameFeedback.move();
    widget.onAction('sow', {'pit': pit});
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
          icon: Icons.all_inclusive_rounded,
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
              _storesRow(view),
              const SizedBox(height: 10),
              AspectRatio(
                aspectRatio: 1.35,
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
                    child: LayoutBuilder(
                      builder: (context, constraints) {
                        return GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTapUp: (d) => _handleTap(d.localPosition, constraints.biggest),
                          child: CustomPaint(
                            size: Size.infinite,
                            painter: _MancalaPainter(
                              view: view,
                              mySeat: widget.mySeat,
                              myTurn: _myTurn,
                              skin: skin,
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  void _handleTap(Offset local, Size size) {
    final h = size.height;
    // Top rank: seat 1 pits (cups 12..7 left→right). Bottom rank: seat 0 (cups 0..5).
    final cols = 6;
    final colW = size.width / cols;
    final col = (local.dx / colW).floor().clamp(0, cols - 1);
    final cup = local.dy < h / 2 ? 12 - col : col;
    _tapCup(cup);
  }

  Widget _storesRow(_MancalaView view) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        _StoreChip(label: _seatLabel(0), seeds: view.store0, mine: widget.mySeat == 0),
        _StoreChip(label: _seatLabel(1), seeds: view.store1, mine: widget.mySeat == 1, alignEnd: true),
      ],
    );
  }

  String _statusText(_MancalaView view) {
    if (!widget.session.isInProgress) {
      if (widget.session.winnerSeat == null) return 'Game over — a perfect tie';
      return widget.session.winnerSeat == widget.mySeat ? 'You hoarded the most!' : 'They out-hoarded you…';
    }
    if (!_myTurn) return 'Waiting for the other farmer…';
    final last = view.lastSow;
    if (last != null && last.extraTurn && last.seat == widget.mySeat) {
      return 'Another turn — sow again!';
    }
    return 'Tap one of your pits to sow';
  }

  String _seatLabel(int seat) {
    if (seat >= widget.session.seats.length) return 'Seat ${seat + 1}';
    return seat == widget.mySeat ? 'You' : widget.session.seats[seat].displayName;
  }
}

// ── widgets ─────────────────────────────────────────────────────────────────

class _StoreChip extends StatelessWidget {
  const _StoreChip({required this.label, required this.seeds, required this.mine, this.alignEnd = false});

  final String label;
  final int seeds;
  final bool mine;
  final bool alignEnd;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: alignEnd ? MainAxisAlignment.end : MainAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            color: mine ? AppColors.softCyan : AppColors.textSecondary,
            fontSize: 11,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(width: 5),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Colors.white.withValues(alpha: 0.14)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.grain_rounded, size: 13, color: Color(0xFFD9A94A)),
              const SizedBox(width: 3),
              Text(
                '$seeds',
                style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w900),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ── painter ─────────────────────────────────────────────────────────────────

class _MancalaPainter extends CustomPainter {
  _MancalaPainter({
    required this.view,
    required this.mySeat,
    required this.myTurn,
    required this.skin,
  });

  final _MancalaView view;
  final int mySeat;
  final bool myTurn;
  final BoardSkin skin;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final cols = 6;
    final colW = w / cols;
    final rowH = h / 2;

    // Wood felt.
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

    final last = view.lastSow;

    void pit(int cup, Offset c, double rx, double ry) {
      final playable = myTurn &&
          ((mySeat == 0 && cup <= 5) || (mySeat == 1 && cup >= 7 && cup <= 12)) &&
          view.at(cup) > 0;

      // Carved hollow.
      final hollow = Paint()
        ..shader = RadialGradient(
          center: const Alignment(0, -0.4),
          radius: 1.2,
          colors: [
            Color.lerp(skin.feltTop, Colors.black, 0.55)!,
            Color.lerp(skin.feltTop, Colors.black, 0.3)!,
          ],
        ).createShader(Rect.fromCenter(center: c, width: rx * 2.4, height: ry * 2.4));
      canvas.drawOval(Rect.fromCenter(center: c, width: rx * 2, height: ry * 2), hollow);
      final rim = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.4
        ..color = Colors.white.withValues(alpha: 0.10);
      canvas.drawOval(Rect.fromCenter(center: c, width: rx * 2, height: ry * 2), rim);

      if (playable) {
        final pulse = Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2
          ..color = AppColors.softCyan.withValues(alpha: 0.55);
        canvas.drawOval(Rect.fromCenter(center: c, width: rx * 2 + 4, height: ry * 2 + 4), pulse);
      }
      if (last != null && last.seat == (cup <= 5 || cup == 6 ? 0 : 1) && last.lastCup == cup) {
        final flash = Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2
          ..color = (last.captured > 0 ? const Color(0xFFD9A94A) : AppColors.softCyan).withValues(alpha: 0.9);
        canvas.drawOval(Rect.fromCenter(center: c, width: rx * 2 + 7, height: ry * 2 + 7), flash);
      }

      // Seeds.
      final n = view.at(cup);
      final rng = _seedRng(cup);
      for (var i = 0; i < n && i < 14; i++) {
        final a = rng() * 6.283;
        final rad = (0.18 + 0.55 * rng()) * rx * 0.92;
        final sc = Offset(c.dx + rad * 0.75, c.dy + rad * 0.42);
        _paintSeed(canvas, sc, rx * 0.16 + 1.2);
      }

      // Count.
      final tp = TextPainter(
        text: TextSpan(
          text: n > 14 ? '$n' : '',
          style: const TextStyle(color: Colors.white70, fontSize: 9, fontWeight: FontWeight.w800),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      if (n > 14) tp.paint(canvas, Offset(c.dx - tp.width / 2, c.dy - tp.height / 2));
    }

    // Top rank: seat 1's pits (cups 12..7 left→right).
    for (var col = 0; col < cols; col++) {
      pit(12 - col, Offset(col * colW + colW / 2, rowH * 0.48), colW * 0.36, rowH * 0.3);
    }
    // Bottom rank: seat 0's pits (cups 0..5).
    for (var col = 0; col < cols; col++) {
      pit(col, Offset(col * colW + colW / 2, h - rowH * 0.48), colW * 0.36, rowH * 0.3);
    }
  }

  void _paintSeed(Canvas canvas, Offset c, double r) {
    final shadow = Paint()..color = Colors.black.withValues(alpha: 0.3);
    canvas.drawCircle(c + const Offset(0.4, 0.7), r, shadow);
    final body = Paint()
      ..shader = RadialGradient(
        center: const Alignment(-0.3, -0.4),
        radius: 1.1,
        colors: [Color(0xFFF3DCA8), Color(0xFFC8973F), Color(0xFF8A5B1E)],
      ).createShader(Rect.fromCircle(center: c, radius: r));
    canvas.drawCircle(c, r, body);
  }

  /// Deterministic per-cup jitter so seeds do not jump between repaints.
  double Function() _seedRng(int cup) {
    var x = (cup * 2654435761) % 4294967296;
    return () {
      x = (x * 1664525 + 1013904223) % 4294967296;
      return x / 4294967296;
    };
  }

  @override
  bool shouldRepaint(covariant _MancalaPainter old) =>
      old.view.pits.join(',') != view.pits.join(',') || old.myTurn != myTurn;
}
