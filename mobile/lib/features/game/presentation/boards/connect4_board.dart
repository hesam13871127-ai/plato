import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../../../core/widgets/piece_3d.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Parsed connect-4 view (the engine exposes the full board — no hidden info).
class _C4View {
  _C4View(Map<String, dynamic> b)
      : grid = ((b['grid'] as List?) ?? const [])
            .whereType<List>()
            .map((row) => row.whereType<num>().map((n) => n.toInt()).toList())
            .toList(),
        rows = (b['rows'] as num?)?.toInt() ?? 6,
        cols = (b['cols'] as num?)?.toInt() ?? 7,
        winLine = _pairs(b['winLine']),
        lastCol = ((b['lastMove'] as Map?)?['col'] as num?)?.toInt(),
        lastRow = ((b['lastMove'] as Map?)?['row'] as num?)?.toInt();

  final List<List<int>> grid;
  final int rows;
  final int cols;
  final List<List<int>> winLine;
  final int? lastCol;
  final int? lastRow;

  static List<List<int>> _pairs(Object? raw) => ((raw as List?) ?? const [])
      .whereType<List>()
      .map((p) => p.whereType<num>().map((n) => n.toInt()).toList())
      .where((p) => p.length == 2)
      .toList();

  bool isWinCell(int r, int c) => winLine.any((p) => p[0] == r && p[1] == c);
  bool isOpen(int col) => rows > 0 && grid[rows - 1][col] == -1;
}

/// Connect Four — wave-1 3D board.
///
/// A standing midnight-blue frame with 42 glossy holes. Tapping a column
/// drops a sphere-lit disc that pops in with a fall-and-settle animation; the
/// last disc glows, and when someone connects four the winning run pulses
/// while the rest of the board sinks into shadow. A ghost disc previews your
/// drop above the frame.
class Connect4Board extends StatefulWidget {
  const Connect4Board({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<Connect4Board> createState() => _Connect4BoardState();
}

class _Connect4BoardState extends State<Connect4Board>
    with SingleTickerProviderStateMixin {
  String _skin = 'midnight';
  int? _hoverCol;
  late final AnimationController _winPulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 850),
  );

  static const _palettes = <PiecePalette>[PiecePalette.red, PiecePalette.yellow];

  _C4View get _view => _C4View(widget.session.board);

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  PiecePalette _paletteFor(int seat) => _palettes[seat % _palettes.length];

  @override
  void initState() {
    super.initState();
    _winPulse.repeat(reverse: true);
  }

  @override
  void dispose() {
    _winPulse.dispose();
    super.dispose();
  }

  void _drop(int col) {
    if (!_myTurn) return;
    final view = _view;
    if (col < 0 || col >= view.cols || !view.isOpen(col)) {
      GameFeedback.error();
      return;
    }
    GameFeedback.move();
    widget.onAction('drop', {'col': col});
  }

  @override
  Widget build(BuildContext context) {
    final view = _view;
    final skin = BoardSkin.byId(_skin);
    final myPalette = _paletteFor(widget.mySeat);

    return Column(
      children: [
        TurnIndicator(
          text: !widget.session.isInProgress
              ? (view.winLine.isNotEmpty ? 'Four in a row!' : 'Board full — a draw')
              : _myTurn
                  ? 'Your drop — pick a column'
                  : 'Rival is thinking…',
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
              // Ghost preview row above the frame.
              SizedBox(
                height: 34,
                child: Row(
                  children: [
                    for (var c = 0; c < view.cols; c++)
                      Expanded(
                        child: Center(
                          child: AnimatedOpacity(
                            duration: const Duration(milliseconds: 140),
                            opacity: _myTurn && _hoverCol == c && view.isOpen(c) ? 1 : 0,
                            child: Container(
                              width: 26,
                              height: 26,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                gradient: RadialGradient(
                                  center: const Alignment(-0.3, -0.4),
                                  colors: [
                                    Color.lerp(myPalette.base, Colors.white, 0.35)!,
                                    myPalette.base,
                                    myPalette.dark,
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 4),
              // The standing frame.
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(18),
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      Color.lerp(skin.edge, Colors.white, 0.08)!,
                      skin.edge,
                      Color.lerp(skin.edge, Colors.black, 0.45)!,
                    ],
                  ),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.5),
                      blurRadius: 18,
                      offset: const Offset(0, 10),
                    ),
                    BoxShadow(
                      color: skin.accent.withValues(alpha: 0.14),
                      blurRadius: 26,
                    ),
                  ],
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(14),
                  child: AspectRatio(
                    aspectRatio: view.cols / view.rows,
                    child: Row(
                      children: [
                        for (var c = 0; c < view.cols; c++)
                          Expanded(
                            child: GestureDetector(
                              behavior: HitTestBehavior.opaque,
                              onTap: () => _drop(c),
                              onTapDown: (_) => setState(() => _hoverCol = c),
                              onTapCancel: () => setState(() => _hoverCol = null),
                              child: MouseRegion(
                                onEnter: (_) => setState(() => _hoverCol = c),
                                onExit: (_) => setState(() => _hoverCol = null),
                                child: Column(
                                  children: [
                                    for (var r = view.rows - 1; r >= 0; r--)
                                      Expanded(child: _cell(view, r, c)),
                                  ],
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _LegendDot(palette: _palettes[0], label: _seatLabel(0)),
                  const SizedBox(width: 16),
                  _LegendDot(palette: _palettes[1], label: _seatLabel(1)),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  String _seatLabel(int seat) {
    if (seat >= widget.session.seats.length) return 'Seat ${seat + 1}';
    return seat == widget.mySeat
        ? 'You'
        : widget.session.seats[seat].displayName;
  }

  Widget _cell(_C4View view, int r, int c) {
    final seat = view.grid[r][c];
    final isWin = view.isWinCell(r, c);
    final isLast = view.lastCol == c && view.lastRow == r;

    return Padding(
      padding: const EdgeInsets.all(2.5),
      child: DecoratedBox(
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: Colors.black.withValues(alpha: 0.42),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.5),
              blurRadius: 4,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: seat == -1
            ? const SizedBox.expand()
            : AnimatedScale(
                scale: isWin ? 1.0 + 0.07 * _winPulse.value : 1.0,
                duration: const Duration(milliseconds: 120),
                child: _Disc(
                  palette: _paletteFor(seat),
                  isWin: isWin,
                  isLast: isLast,
                  dimmed: view.winLine.isNotEmpty && !isWin,
                ),
              ),
      ),
    );
  }
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/// One dropped disc: sphere-lit with a contact shadow, glow on the last move
/// and a pulsing halo on winning cells.
class _Disc extends StatelessWidget {
  const _Disc({required this.palette, required this.isWin, required this.isLast, required this.dimmed});

  final PiecePalette palette;
  final bool isWin;
  final bool isLast;
  final bool dimmed;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: dimmed ? 0.35 : 1,
      child: Container(
        margin: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 5),
            if (isLast && !isWin)
              BoxShadow(color: palette.glow.withValues(alpha: 0.55), blurRadius: 9),
            if (isWin)
              BoxShadow(
                color: palette.glow.withValues(alpha: 0.75),
                blurRadius: 14,
                spreadRadius: 1,
              ),
          ],
        ),
        child: CustomPaint(
          painter: _DiscPainter(palette),
          child: const SizedBox.expand(),
        ),
      ),
    );
  }
}

class _DiscPainter extends CustomPainter {
  _DiscPainter(this.p);
  final PiecePalette p;

  @override
  void paint(Canvas canvas, Size size) {
    final c = Offset(size.width / 2, size.height / 2);
    final r = size.width / 2;

    final body = Paint()
      ..shader = RadialGradient(
        center: const Alignment(-0.35, -0.45),
        radius: 1.05,
        colors: [p.light, p.base, p.dark],
        stops: const [0.0, 0.55, 1.0],
      ).createShader(Rect.fromCircle(center: c, radius: r));
    canvas.drawCircle(c, r, body);

    // Inner ring detail, like a real connect-four disc.
    canvas.drawCircle(
      c,
      r * 0.62,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = r * 0.09
        ..color = p.dark.withValues(alpha: 0.5),
    );

    final spec = Paint()
      ..shader = RadialGradient(
        colors: [Colors.white.withValues(alpha: 0.85), Colors.white.withValues(alpha: 0.0)],
      ).createShader(Rect.fromCircle(center: c + Offset(-r * 0.3, -r * 0.34), radius: r * 0.5));
    canvas.drawCircle(c + Offset(-r * 0.3, -r * 0.34), r * 0.42, spec);
  }

  @override
  bool shouldRepaint(covariant _DiscPainter old) => old.p != p;
}

class _LegendDot extends StatelessWidget {
  const _LegendDot({required this.palette, required this.label});

  final PiecePalette palette;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 16,
          height: 16,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: RadialGradient(
              center: const Alignment(-0.3, -0.4),
              colors: [palette.light, palette.base, palette.dark],
            ),
          ),
        ),
        const SizedBox(width: 6),
        Text(
          label,
          style: const TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w700),
        ),
      ],
    );
  }
}
