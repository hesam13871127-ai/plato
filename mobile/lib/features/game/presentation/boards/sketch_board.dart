import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Parsed sketch view.
class _SketchView {
  _SketchView(Map<String, dynamic> b)
      : round = (b['round'] as num?)?.toInt() ?? 0,
        totalRounds = (b['totalRounds'] as num?)?.toInt() ?? 4,
        artist = (b['artist'] as num?)?.toInt() ?? 0,
        word = b['word'] as String? ?? '',
        subPhase = (b['subPhase'] as String?) ?? 'draw',
        strokes = _strokes(b['strokes']),
        guesses = _guesses(b['guesses']),
        history = _history(b['history']);

  final int round;
  final int totalRounds;
  final int artist;
  final String word; // '?' when the server hides the secret
  final String subPhase;
  final List<_Stroke> strokes;
  final List<_Guess> guesses;
  final List<_RoundRecord> history;

  static List<_Stroke> _strokes(Object? raw) => ((raw as List?) ?? const [])
      .whereType<Map>()
      .map((m) => _Stroke(
            (m['color'] as String?) ?? '#FFFFFF',
            ((m['points'] as List?) ?? const []).whereType<num>().map((n) => n.toDouble()).toList(),
          ))
      .toList();

  static List<_Guess> _guesses(Object? raw) => ((raw as List?) ?? const [])
      .whereType<Map>()
      .map((m) => _Guess(
            (m['seat'] as num?)?.toInt() ?? 0,
            (m['word'] as String?) ?? '',
            m['correct'] == true,
          ))
      .toList();

  static List<_RoundRecord> _history(Object? raw) => ((raw as List?) ?? const [])
      .whereType<Map>()
      .map((m) => _RoundRecord(
            (m['round'] as num?)?.toInt() ?? 0,
            (m['artist'] as num?)?.toInt() ?? 0,
            (m['word'] as String?) ?? '',
            (m['winner'] as num?)?.toInt(),
          ))
      .toList();
}

class _Stroke {
  const _Stroke(this.color, this.points);
  final String color;
  final List<double> points; // flat [x0, y0, x1, y1, …] in 0..1
}

class _Guess {
  const _Guess(this.seat, this.word, this.correct);
  final int seat;
  final String word;
  final bool correct;
}

class _RoundRecord {
  const _RoundRecord(this.round, this.artist, this.word, this.winner);
  final int round;
  final int artist;
  final String word;
  final int? winner;
}

/// Sketch, wave-4 3D board.
///
/// Draw phase: your secret word in the corner, a finger-paint canvas with
/// four colours, undo and clear. Guess phase: the artwork rendered centre
/// stage and a guess field below. Everyone sees the reveal after each round.
class SketchBoard extends StatefulWidget {
  const SketchBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<SketchBoard> createState() => _SketchBoardState();
}

class _SketchBoardState extends State<SketchBoard> {
  String _skin = 'wood';
  final List<_LocalStroke> _local = [];
  Color _color = const Color(0xFF22D3EE);
  static const _palette = [
    Color(0xFF22D3EE),
    Color(0xFFFACC15),
    Color(0xFFF472B6),
    Color(0xFFFFFFFF),
  ];

  _SketchView get _view => _SketchView(widget.session.board);

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  bool get _iDraw => _view.subPhase == 'draw' && _view.artist == widget.mySeat;

  @override
  void didUpdateWidget(SketchBoard oldWidget) {
    super.didUpdateWidget(oldWidget);
    // A fresh round wipes the local canvas.
    if (oldWidget.session.version != widget.session.version) {
      final v = _view;
      if (v.subPhase == 'draw' && v.strokes.isEmpty) {
        _local.clear();
      }
    }
  }

  void _onPanStart(DragStartDetails d, Size size) {
    if (!_iDraw) return;
    setState(() {
      _local.add(_LocalStroke(_color, [
        (d.localPosition.dx / size.width).clamp(0.0, 1.0),
        (d.localPosition.dy / size.height).clamp(0.0, 1.0),
      ]));
    });
  }

  void _onPanUpdate(DragUpdateDetails d, Size size) {
    if (!_iDraw || _local.isEmpty) return;
    if (_local.last.points.length >= 400) return; // engine cap per stroke
    setState(() {
      _local.last.points
        ..add((d.localPosition.dx / size.width).clamp(0.0, 1.0))
        ..add((d.localPosition.dy / size.height).clamp(0.0, 1.0));
    });
  }

  void _onPanEnd(DragEndDetails _) {
    GameFeedback.tap();
  }

  Future<void> _submitDrawing() async {
    if (!_iDraw || _local.isEmpty) return;
    // Strokes need at least two points (one coordinate pair).
    final strokes = _local
        .where((s) => s.points.length >= 2)
        .map((s) => {'color': _hexOf(s.color), 'points': s.points.map((v) => v).toList()})
        .toList();
    if (strokes.isEmpty) return;
    GameFeedback.move();
    await widget.onAction('draw', {'strokes': strokes});
  }

  String _hexOf(Color c) {
    final r = (c.r * 255).round().toRadixString(16).padLeft(2, '0').toUpperCase();
    final g = (c.g * 255).round().toRadixString(16).padLeft(2, '0').toUpperCase();
    final b = (c.b * 255).round().toRadixString(16).padLeft(2, '0').toUpperCase();
    return '#$r$g$b';
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
          icon: Icons.brush_rounded,
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
              _scoreRow(),
              const SizedBox(height: 10),
              _canvas(view, skin),
              const SizedBox(height: 10),
              if (view.subPhase == 'draw' && _iDraw) _drawTools(),
              if (view.subPhase == 'guess') _guessArea(view),
              if (view.subPhase == 'draw' && !_iDraw && view.artist != widget.mySeat)
                Text(
                  '${_seatLabel(view.artist)} is sketching…',
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w700),
                ),
              const SizedBox(height: 6),
              Text(
                'Round ${(view.round + 1).clamp(1, view.totalRounds)} / ${view.totalRounds}',
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w700),
              ),
              if (view.history.isNotEmpty) _historyRow(view),
            ],
          ),
        ),
      ],
    );
  }

  Widget _canvas(_SketchView view, BoardSkin skin) {
    final drawing = _iDraw ? _local.map((s) => _Stroke(_hexOf(s.color), s.points)).toList() : view.strokes;
    return AspectRatio(
      aspectRatio: 1.25,
      child: Container(
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
            BoxShadow(color: Colors.black.withValues(alpha: 0.5), blurRadius: 14, offset: const Offset(0, 6)),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: LayoutBuilder(
            builder: (context, constraints) {
              final size = constraints.biggest;
              return GestureDetector(
                behavior: HitTestBehavior.opaque,
                onPanStart: (d) => _onPanStart(d, size),
                onPanUpdate: (d) => _onPanUpdate(d, size),
                onPanEnd: _onPanEnd,
                child: CustomPaint(
                  size: Size.infinite,
                  painter: _SketchPainter(strokes: drawing),
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _drawTools() {
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            for (final c in _palette)
              GestureDetector(
                onTap: () => setState(() => _color = c),
                child: Container(
                  width: 34,
                  height: 34,
                  margin: const EdgeInsets.symmetric(horizontal: 5),
                  decoration: BoxDecoration(
                    color: c,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: _color == c ? AppColors.softCyan : Colors.white.withValues(alpha: 0.25),
                      width: _color == c ? 2.5 : 1,
                    ),
                  ),
                ),
              ),
            const SizedBox(width: 12),
            IconButton(
              onPressed: _local.isNotEmpty
                  ? () {
                      GameFeedback.tap();
                      setState(() => _local.removeLast());
                    }
                  : null,
              icon: const Icon(Icons.undo_rounded, color: Colors.white),
              tooltip: 'Undo stroke',
            ),
            IconButton(
              onPressed: _local.isNotEmpty
                  ? () {
                      GameFeedback.tap();
                      setState(() => _local.clear());
                    }
                  : null,
              icon: const Icon(Icons.delete_outline_rounded, color: Colors.white),
              tooltip: 'Clear canvas',
            ),
          ],
        ),
        const SizedBox(height: 6),
        ElevatedButton(
          onPressed: _local.isNotEmpty ? _submitDrawing : null,
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.electricPurple,
            foregroundColor: Colors.white,
            disabledBackgroundColor: Colors.white.withValues(alpha: 0.08),
            disabledForegroundColor: Colors.white38,
            padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 28),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          ),
          child: const Text('DONE — LET THEM GUESS', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1)),
        ),
      ],
    );
  }

  Widget _guessArea(_SketchView view) {
    return Column(
      children: [
        if (view.guesses.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Wrap(
              spacing: 6,
              runSpacing: 4,
              alignment: WrapAlignment.center,
              children: [
                for (final g in view.guesses)
                  Text(
                    '${_seatLabel(g.seat)}: ${g.word}',
                    style: TextStyle(
                      color: g.correct ? const Color(0xFF4ADE80) : AppColors.textSecondary,
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      decoration: g.correct ? null : TextDecoration.lineThrough,
                    ),
                  ),
              ],
            ),
          ),
        if (_myTurn)
          Row(
            children: [
              Expanded(
                child: _GuessField(onGuess: (w) => widget.onAction('guess', {'word': w})),
              ),
            ],
          )
        else
          Text(
            'Waiting for ${_seatLabel(widget.session.currentSeat)} to guess…',
            style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
          ),
      ],
    );
  }

  Widget _historyRow(_SketchView view) {
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Text(
        'Revealed: ${view.history.map((h) => h.word).join(' · ')}',
        style: const TextStyle(color: AppColors.textSecondary, fontSize: 10.5),
        overflow: TextOverflow.ellipsis,
      ),
    );
  }

  Widget _scoreRow() {
    return Wrap(
      spacing: 8,
      runSpacing: 6,
      alignment: WrapAlignment.center,
      children: [
        for (var seat = 0; seat < widget.session.seats.length; seat++)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: widget.session.currentSeat == seat && widget.session.isInProgress
                  ? AppColors.electricPurple.withValues(alpha: 0.3)
                  : Colors.white.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: widget.session.currentSeat == seat && widget.session.isInProgress
                    ? AppColors.softCyan
                    : Colors.white.withValues(alpha: 0.12),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  _seatLabel(seat),
                  style: TextStyle(
                    color: seat == widget.mySeat ? AppColors.softCyan : AppColors.textSecondary,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  '${widget.session.scores.length > seat ? widget.session.scores[seat] : 0}',
                  style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w900),
                ),
              ],
            ),
          ),
      ],
    );
  }

  String _statusText(_SketchView view) {
    if (!widget.session.isInProgress) {
      if (widget.session.winnerSeat == null) return 'Gallery closed — a tie';
      return widget.session.winnerSeat == widget.mySeat ? 'Your art spoke loudest!' : 'Their doodles ruled…';
    }
    if (view.subPhase == 'draw') {
      if (view.artist == widget.mySeat) return 'Paint: ${view.word}';
      return 'The artist is thinking…';
    }
    if (_myTurn) return 'Type your guess!';
    return 'Guesses are flying…';
  }

  String _seatLabel(int seat) {
    if (seat >= widget.session.seats.length) return 'Seat ${seat + 1}';
    return seat == widget.mySeat ? 'You' : widget.session.seats[seat].displayName;
  }
}

class _LocalStroke {
  _LocalStroke(this.color, this.points);
  final Color color;
  final List<double> points;
}

/// Small stateful guess field (kept outside the main state for simplicity).
class _GuessField extends StatefulWidget {
  const _GuessField({required this.onGuess});

  final Future<void> Function(String word) onGuess;

  @override
  State<_GuessField> createState() => _GuessFieldState();
}

class _GuessFieldState extends State<_GuessField> {
  final TextEditingController _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final w = _controller.text.trim();
    if (w.isEmpty) return;
    GameFeedback.tap();
    _controller.clear();
    await widget.onGuess(w);
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: TextField(
            controller: _controller,
            textInputAction: TextInputAction.send,
            onSubmitted: (_) => _send(),
            maxLength: 24,
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, letterSpacing: 1),
            decoration: InputDecoration(
              counterText: '',
              hintText: 'Your guess…',
              hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.3)),
              filled: true,
              fillColor: Colors.white.withValues(alpha: 0.06),
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: AppColors.softCyan.withValues(alpha: 0.25)),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: AppColors.softCyan),
              ),
            ),
          ),
        ),
        const SizedBox(width: 8),
        ElevatedButton(
          onPressed: _send,
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.electricPurple,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 13),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
          child: const Icon(Icons.send_rounded, size: 19),
        ),
      ],
    );
  }
}

// ── painter ─────────────────────────────────────────────────────────────────

class _SketchPainter extends CustomPainter {
  _SketchPainter({required this.strokes});

  final List<_Stroke> strokes;

  @override
  void paint(Canvas canvas, Size size) {
    // Paper.
    final paper = Paint()
      ..shader = RadialGradient(
        center: const Alignment(-0.2, -0.3),
        radius: 1.4,
        colors: [const Color(0xFF2E2848), const Color(0xFF241F3A), const Color(0xFF1A1629)],
      ).createShader(Rect.fromLTWH(0, 0, size.width, size.height));
    canvas.drawRect(Rect.fromLTWH(0, 0, size.width, size.height), paper);

    for (final s in strokes) {
      if (s.points.length < 4) {
        if (s.points.length >= 2) {
          final p = Paint()
            ..color = _parse(s.color)
            ..strokeWidth = 3.5
            ..strokeCap = StrokeCap.round;
          canvas.drawCircle(
            Offset(s.points[0] * size.width, s.points[1] * size.height),
            1.8,
            p,
          );
        }
        continue;
      }
      final path = Path()..moveTo(s.points[0] * size.width, s.points[1] * size.height);
      for (var i = 2; i + 1 < s.points.length; i += 2) {
        path.lineTo(s.points[i] * size.width, s.points[i + 1] * size.height);
      }
      final paint = Paint()
        ..color = _parse(s.color)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3.5
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round;
      canvas.drawPath(path, paint);
    }
  }

  Color _parse(String hex) {
    final v = int.tryParse(hex.replaceFirst('#', ''), radix: 16);
    if (v == null) return Colors.white;
    return Color(0xFF000000 | v);
  }

  @override
  bool shouldRepaint(covariant _SketchPainter old) => old.strokes != strokes;
}
