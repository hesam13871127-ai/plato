import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

typedef _Stroke = List<MapEntry<double, double>>;

/// Sketch & Guess: the drawer paints on the shared canvas (strokes stream to
/// everyone); everyone else types guesses. The hidden word is revealed letter
/// by letter. Scores show after every round.
class SketchBoard extends StatefulWidget {
  const SketchBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<SketchBoard> createState() => _SketchBoardState();
}

class _SketchBoardState extends State<SketchBoard> {
  final TextEditingController _guess = TextEditingController();
  List<_Stroke> _strokes = [];
  int _lastCount = 0;

  Map<String, dynamic> get b => widget.session.board;

  bool get _isDrawer => widget.mySeat == ((b['drawerSeat'] as num?)?.toInt() ?? -1);

  List<_Stroke> _parseStrokes() {
    final raw = (b['strokes'] as List?) ?? const [];
    return raw.whereType<Map>().map<_Stroke>((s) {
      final pts = (s['points'] as List?) ?? const [];
      return pts.whereType<List>().map((p) {
        final dx = p.length > 0 ? (p[0] as num).toDouble() : 0.0;
        final dy = p.length > 1 ? (p[1] as num).toDouble() : 0.0;
        return MapEntry(dx, dy);
      }).toList();
    }).toList();
  }

  Color _strokeColor(String? c) {
    switch (c) {
      case '#7B5CFF':
        return AppColors.electricPurple;
      case '#00E5FF':
      default:
        return AppColors.softCyan;
    }
  }

  @override
  void didUpdateWidget(covariant SketchBoard old) {
    super.didUpdateWidget(old);
    final strokes = _parseStrokes();
    if (strokes.length != _lastCount) {
      setState(() {
        _strokes = strokes;
        _lastCount = strokes.length;
      });
    }
  }

  void _addPoint(Offset? local, Size size, bool end) {
    if (local != null) {
      final point = [local.dx / size.width, local.dy / size.height];
      widget.onAction('draw', {'point': point, 'color': '#00E5FF', 'width': 4, if (end) 'end': true});
    } else {
      // Close the in-progress stroke without adding a point.
      widget.onAction('draw', {'color': '#00E5FF', 'width': 4, 'end': true});
    }
  }

  void _guessWord() {
    final text = _guess.text.trim();
    if (text.isEmpty) return;
    GameFeedback.move();
    widget.onAction('guess', {'text': text});
    _guess.clear();
  }

  @override
  Widget build(BuildContext context) {
    final revealed = ((b['revealed'] as List?) ?? const []).whereType<String>().toList();
    final scores = ((b['scores'] as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();
    final guesses = ((b['guesses'] as List?) ?? const []).whereType<Map>().toList();
    final word = b['word'] as String?;
    final isReveal = (b['phase'] as String?) == 'reveal';

    return Column(
      children: [
        TurnIndicator(
          text: widget.session.isCompleted
              ? 'Game over'
              : _isDrawer
                  ? 'You are drawing${word != null ? ': $word' : ''}'
                  : 'Guess the word!',
          highlight: _isDrawer,
          icon: Icons.brush,
        ),
        const SizedBox(height: 6),
        // Word hint blanks.
        Wrap(
          spacing: 4,
          children: [
            for (final letter in revealed)
              Container(
                width: 22,
                height: 30,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: letter == '_' ? AppColors.glassFill : AppColors.electricPurple.withOpacity(0.4),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: AppColors.glassStroke),
                ),
                child: Text(letter == '_' ? '?' : letter,
                    style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.bold)),
              ),
          ],
        ),
        const SizedBox(height: 10),
        TableSurface(
          padding: const EdgeInsets.all(6),
          child: AspectRatio(
            aspectRatio: 1.3,
            child: LayoutBuilder(
              builder: (context, constraints) {
                final size = constraints.biggest;
                return GestureDetector(
                  onPanDown: _isDrawer ? (d) => _addPoint(d.localPosition, size, false) : null,
                  onPanUpdate: _isDrawer ? (d) => _addPoint(d.localPosition, size, false) : null,
                  onPanEnd: _isDrawer ? (_) => _addPoint(null, size, true) : null,
                  child: Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: CustomPaint(
                        size: size,
                        painter: _SketchPainter(strokes: _strokes, color: AppColors.deepNavy),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ),
        if (_isDrawer)
          TextButton.icon(
            onPressed: () {
              GameFeedback.tap();
              widget.onAction('clear', {});
              setState(() {
                _strokes = [];
                _lastCount = 0;
              });
            },
            icon: const Icon(Icons.delete_outline, color: AppColors.danger, size: 18),
            label: const Text('Clear canvas', style: TextStyle(color: AppColors.danger)),
          ),
        const SizedBox(height: 6),
        // Guesses feed.
        SizedBox(
          height: 64,
          child: ListView(
            reverse: true,
            children: [
              for (final g in guesses.reversed)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 1),
                  child: Text(
                    '${g['text']}',
                    style: TextStyle(
                      color: g['correct'] == true ? AppColors.success : AppColors.textSecondary,
                      fontSize: 12,
                      fontWeight: g['correct'] == true ? FontWeight.bold : FontWeight.normal,
                    ),
                  ),
                ),
            ],
          ),
        ),
        if (!_isDrawer && widget.session.isInProgress)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _guess,
                    style: const TextStyle(color: AppColors.textPrimary, fontSize: 14),
                    onSubmitted: (_) => _guessWord(),
                    decoration: InputDecoration(
                      hintText: 'Type your guess…',
                      hintStyle: const TextStyle(color: AppColors.textMuted),
                      isDense: true,
                      filled: true,
                      fillColor: AppColors.glassFill,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide.none),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton(
                  onPressed: _guessWord,
                  icon: const Icon(Icons.send_rounded, color: AppColors.softCyan),
                ),
              ],
            ),
          ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 10,
          children: [
            for (var i = 0; i < scores.length && i < widget.session.seats.length; i++)
              _ScorePill(name: i == widget.mySeat ? 'You' : widget.session.seats[i].displayName, score: scores[i]),
          ],
        ),
        if (isReveal && word != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text('The word was “$word”',
                style: const TextStyle(color: AppColors.warning, fontWeight: FontWeight.bold)),
          ),
      ],
    );
  }

  @override
  void dispose() {
    _guess.dispose();
    super.dispose();
  }
}

class _ScorePill extends StatelessWidget {
  const _ScorePill({required this.name, required this.score});
  final String name;
  final int score;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
          color: AppColors.glassFill,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.glassStroke)),
      child: Text('$name: $score',
          style: const TextStyle(color: AppColors.textPrimary, fontSize: 11, fontWeight: FontWeight.w600)),
    );
  }
}

class _SketchPainter extends CustomPainter {
  _SketchPainter({required this.strokes, required this.color});
  final List<_Stroke> strokes;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;
    for (final stroke in strokes) {
      for (var i = 0; i < stroke.length - 1; i++) {
        canvas.drawLine(
          Offset(stroke[i].key * size.width, stroke[i].value * size.height),
          Offset(stroke[i + 1].key * size.width, stroke[i + 1].value * size.height),
          paint,
        );
      }
    }
  }

  @override
  bool shouldRepaint(_SketchPainter old) => old.strokes.length != strokes.length;
}
