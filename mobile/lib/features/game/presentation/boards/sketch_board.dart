import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../skins/skinned_pieces.dart';
import '../skins/table_skins.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Sketch & Guess — a bright paper canvas inside the playground. The drawer
/// gets a real toolbox (colour palette, three brush sizes, eraser, undo/clear)
/// and their strokes stream to everyone in batched packets; guessers see the
/// masked word with progressive letter hints, a shrinking timer bar and a live
/// guess feed. Correct guesses fire a confetti-style flash on the scoreboard.
class SketchBoard extends StatefulWidget {
  const SketchBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<SketchBoard> createState() => _SketchBoardState();
}

class _Stroke {
  _Stroke({required this.color, required this.width, required this.points});
  final Color color;
  final double width;
  final List<Offset> points;
}

class _SketchBoardState extends State<SketchBoard> {
  static const List<Color> _palette = [
    Color(0xFF1B1B2F),
    Color(0xFFE63946),
    Color(0xFFF4A261),
    Color(0xFFFFD166),
    Color(0xFF2A9D8F),
    Color(0xFF457B9D),
    Color(0xFF8A6CFF),
    Color(0xFFFF8FAB),
    Color(0xFF8D5524),
    Color(0xFFFFFFFF),
  ];
  static const Color _paper = Color(0xFFFDFBF4);

  final TextEditingController _guess = TextEditingController();
  final FocusNode _guessFocus = FocusNode();
  Timer? _clock;
  Timer? _flushTimer;

  Color _color = _palette[0];
  double _width = 5;
  bool _eraser = false;

  // Local in-progress stroke (drawer) + pending points not yet sent.
  _Stroke? _live;
  List<List<double>> _pending = [];
  int _lastGuessCount = 0;
  int _lastRound = 0;
  bool _sending = false;

  Map<String, dynamic> get b => widget.session.board;
  int get _drawerSeat => (b['drawerSeat'] as num?)?.toInt() ?? -1;
  bool get _isDrawer => widget.mySeat == _drawerSeat;
  String get _phase => (b['phase'] as String?) ?? 'draw';
  bool get _drawing => widget.session.isInProgress && _phase == 'draw';

  @override
  void initState() {
    super.initState();
    _clock = Timer.periodic(const Duration(milliseconds: 200), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _clock?.cancel();
    _flushTimer?.cancel();
    _guess.dispose();
    _guessFocus.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant SketchBoard old) {
    super.didUpdateWidget(old);
    final guesses = (b['guesses'] as List?) ?? const [];
    if (guesses.length > _lastGuessCount) {
      final last = guesses.last;
      if (last is Map && last['correct'] == true) GameFeedback.hit();
      else GameFeedback.tap();
    }
    _lastGuessCount = guesses.length;
    final round = (b['round'] as num?)?.toInt() ?? 0;
    if (round != _lastRound) {
      _lastRound = round;
      _live = null;
      _pending = [];
      GameFeedback.roll();
    }
  }

  // ── Parsing ────────────────────────────────────────────────────────────────

  Color _parseColor(Object? raw) {
    final s = raw?.toString() ?? '';
    if (s.startsWith('#') && (s.length == 7 || s.length == 9)) {
      final v = int.tryParse(s.substring(1), radix: 16);
      if (v != null) return Color(s.length == 7 ? (0xFF000000 | v) : v);
    }
    return const Color(0xFF1B1B2F);
  }

  _Stroke? _parseStroke(Object? raw) {
    if (raw is! Map) return null;
    final pts = (raw['points'] as List?) ?? const [];
    final points = <Offset>[];
    for (final p in pts) {
      if (p is List && p.length >= 2) points.add(Offset((p[0] as num).toDouble(), (p[1] as num).toDouble()));
    }
    if (points.isEmpty) return null;
    return _Stroke(color: _parseColor(raw['color']), width: (raw['width'] as num?)?.toDouble() ?? 4, points: points);
  }

  List<_Stroke> _remoteStrokes() {
    final out = <_Stroke>[];
    for (final s in (b['strokes'] as List?) ?? const []) {
      final st = _parseStroke(s);
      if (st != null) out.add(st);
    }
    final cur = _parseStroke(b['currentStroke']);
    if (cur != null && !_isDrawer) out.add(cur);
    return out;
  }

  String _hex(Color c) {
    final v = c.toARGB32() & 0xFFFFFF;
    return '#${v.toRadixString(16).padLeft(6, '0').toUpperCase()}';
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  Color get _brushColor => _eraser ? _paper : _color;

  void _start(Offset local, Size size) {
    if (!_isDrawer || !_drawing) return;
    final p = Offset((local.dx / size.width).clamp(0.0, 1.0), (local.dy / size.height).clamp(0.0, 1.0));
    setState(() {
      _live = _Stroke(color: _brushColor, width: _eraser ? _width * 3 : _width, points: [p]);
      _pending = [
        [p.dx, p.dy]
      ];
    });
    _scheduleFlush();
  }

  void _move(Offset local, Size size) {
    final live = _live;
    if (live == null) return;
    final p = Offset((local.dx / size.width).clamp(0.0, 1.0), (local.dy / size.height).clamp(0.0, 1.0));
    if ((p - live.points.last).distance < 0.004) return;
    setState(() {
      live.points.add(p);
      _pending.add([p.dx, p.dy]);
    });
    _scheduleFlush();
  }

  void _end() {
    if (_live == null) return;
    _flush(end: true);
  }

  void _scheduleFlush() {
    _flushTimer ??= Timer(const Duration(milliseconds: 70), () {
      _flushTimer = null;
      _flush(end: false);
    });
  }

  Future<void> _flush({required bool end}) async {
    final live = _live;
    if (live == null) return;
    final batch = _pending;
    _pending = [];
    if (end) {
      _flushTimer?.cancel();
      _flushTimer = null;
      _live = null;
    }
    if (batch.isEmpty && !end) return;
    await widget.onAction('draw', {
      if (batch.isNotEmpty) 'points': batch,
      'color': _hex(live.color),
      'width': live.width,
      if (end) 'end': true,
    });
    if (mounted && end) setState(() {});
  }

  Future<void> _undo() async {
    // The server has no undo; emulate by clearing and replaying all but the last stroke.
    final strokes = _remoteStrokes();
    if (strokes.isEmpty || _sending) return;
    setState(() => _sending = true);
    GameFeedback.tap();
    await widget.onAction('clear', {});
    for (final s in strokes.take(strokes.length - 1)) {
      await widget.onAction('draw', {
        'stroke': {
          'color': _hex(s.color),
          'width': s.width,
          'points': [for (final p in s.points) [p.dx, p.dy]],
        },
      });
    }
    if (mounted) setState(() => _sending = false);
  }

  Future<void> _clear() async {
    GameFeedback.tap();
    setState(() {
      _live = null;
      _pending = [];
    });
    await widget.onAction('clear', {});
  }

  Future<void> _submitGuess() async {
    final text = _guess.text.trim();
    if (text.isEmpty || !_drawing || _isDrawer) return;
    GameFeedback.move();
    _guess.clear();
    await widget.onAction('guess', {'text': text});
    if (mounted) _guessFocus.requestFocus();
  }

  double _progress() {
    final endsRaw = b['phaseEndsAt'] as String?;
    final ms = (b['roundMs'] as num?)?.toDouble() ?? 45000;
    final ends = endsRaw == null ? null : DateTime.tryParse(endsRaw);
    if (ends == null || _phase != 'draw') return 0;
    return (ends.difference(DateTime.now()).inMilliseconds / ms).clamp(0.0, 1.0);
  }

  int _secondsLeft() {
    final endsRaw = b['phaseEndsAt'] as String?;
    final ends = endsRaw == null ? null : DateTime.tryParse(endsRaw);
    if (ends == null) return 0;
    return math.max(0, ends.difference(DateTime.now()).inSeconds);
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final playground = TableSkins.playgroundFor(widget.session, widget.mySeat);
    final revealed = ((b['revealed'] as List?) ?? const []).map((e) => e.toString()).toList();
    final scores = ((b['scores'] as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();
    final guessed = ((b['guessed'] as List?) ?? const []).map((e) => e == true).toList();
    final guesses = ((b['guesses'] as List?) ?? const []).whereType<Map>().toList();
    final names = ((b['names'] as List?) ?? const []).map((e) => e.toString()).toList();
    final word = b['word'] as String?;
    final round = (b['round'] as num?)?.toInt() ?? 1;
    final total = (b['totalRounds'] as num?)?.toInt() ?? widget.session.seats.length;
    final isReveal = _phase == 'reveal';
    final strokes = _remoteStrokes();
    final progress = _progress();
    final seconds = _secondsLeft();

    String nameOf(int seat) {
      if (seat >= 0 && seat < names.length && names[seat].isNotEmpty) return names[seat];
      if (seat >= 0 && seat < widget.session.seats.length) return widget.session.seats[seat].displayName;
      return 'Player ${seat + 1}';
    }

    String status;
    if (!widget.session.isInProgress) {
      status = 'Game over';
    } else if (isReveal) {
      status = 'The word was “${revealed.join()}”';
    } else if (_isDrawer) {
      status = 'Draw: ${word ?? '…'}';
    } else {
      final iGuessed = widget.mySeat >= 0 && widget.mySeat < guessed.length && guessed[widget.mySeat];
      status = iGuessed ? 'You got it! Watch the others sweat' : '${nameOf(_drawerSeat)} is drawing — guess!';
    }

    return Column(
      children: [
        TurnIndicator(text: status, highlight: _drawing, icon: _isDrawer ? Icons.brush_rounded : Icons.lightbulb_rounded),
        const SizedBox(height: 6),
        Playground(
          skin: playground,
          padding: const EdgeInsets.all(8),
          child: Column(
            children: [
              // Header: round · word mask · timer.
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.35), borderRadius: BorderRadius.circular(8)),
                    child: Text('Round $round/$total', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800)),
                  ),
                  const SizedBox(width: 8),
                  Expanded(child: Center(child: _WordMask(letters: _isDrawer && word != null ? word.split('') : revealed, solved: isReveal))),
                  const SizedBox(width: 8),
                  _TimerBadge(seconds: seconds, progress: progress, active: _drawing),
                ],
              ),
              const SizedBox(height: 6),
              // Timer bar.
              ClipRRect(
                borderRadius: BorderRadius.circular(3),
                child: LinearProgressIndicator(
                  value: _drawing ? progress : 0,
                  minHeight: 4,
                  backgroundColor: Colors.white.withValues(alpha: 0.12),
                  color: progress < 0.25 ? AppColors.coral : playground.accent,
                ),
              ),
              const SizedBox(height: 8),
              // Canvas.
              AspectRatio(
                aspectRatio: 1.15,
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final size = Size(constraints.maxWidth, constraints.maxHeight);
                    return Container(
                      decoration: BoxDecoration(
                        color: _paper,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: Colors.white.withValues(alpha: 0.6), width: 2),
                        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.35), blurRadius: 14, offset: const Offset(0, 6))],
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(14),
                        child: GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onPanStart: _isDrawer && _drawing ? (d) => _start(d.localPosition, size) : null,
                          onPanUpdate: _isDrawer && _drawing ? (d) => _move(d.localPosition, size) : null,
                          onPanEnd: _isDrawer && _drawing ? (_) => _end() : null,
                          onPanCancel: _isDrawer && _drawing ? _end : null,
                          child: Stack(
                            children: [
                              Positioned.fill(child: CustomPaint(painter: _PaperPainter())),
                              Positioned.fill(child: CustomPaint(painter: _SketchPainter(strokes: strokes, live: _live))),
                              if (isReveal)
                                Positioned.fill(
                                  child: Container(
                                    color: Colors.black.withValues(alpha: 0.35),
                                    child: Center(
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
                                        decoration: BoxDecoration(color: AppColors.gold, borderRadius: BorderRadius.circular(14), boxShadow: const [BoxShadow(color: Colors.black45, blurRadius: 12)]),
                                        child: Text(revealed.join().toUpperCase(), style: const TextStyle(color: Color(0xFF1B1B2F), fontSize: 22, fontWeight: FontWeight.w900, letterSpacing: 2)),
                                      ),
                                    ),
                                  ),
                                ),
                              if (_isDrawer && _drawing && strokes.isEmpty && _live == null)
                                const Positioned.fill(
                                  child: IgnorePointer(
                                    child: Center(
                                      child: Text('Draw here ✏️', style: TextStyle(color: Color(0xFF9A9AAE), fontSize: 16, fontWeight: FontWeight.w700)),
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
              const SizedBox(height: 8),
              // Tools or guess box.
              if (_isDrawer)
                _Toolbox(
                  palette: _palette,
                  color: _color,
                  width: _width,
                  eraser: _eraser,
                  enabled: _drawing,
                  busy: _sending,
                  onColor: (c) => setState(() {
                    _color = c;
                    _eraser = false;
                  }),
                  onWidth: (w) => setState(() => _width = w),
                  onEraser: () => setState(() => _eraser = !_eraser),
                  onUndo: _undo,
                  onClear: _clear,
                )
              else
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _guess,
                        focusNode: _guessFocus,
                        enabled: _drawing && !(widget.mySeat >= 0 && widget.mySeat < guessed.length && guessed[widget.mySeat]),
                        textInputAction: TextInputAction.send,
                        onSubmitted: (_) => _submitGuess(),
                        style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w700),
                        decoration: InputDecoration(
                          hintText: 'Type your guess…',
                          hintStyle: const TextStyle(color: AppColors.textMuted),
                          filled: true,
                          fillColor: Colors.black.withValues(alpha: 0.3),
                          isDense: true,
                          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: AppColors.glassStroke)),
                          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: AppColors.glassStroke)),
                          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: playground.accent, width: 1.6)),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    ActionButton(label: 'Guess', icon: Icons.send_rounded, expanded: false, color: playground.accent, onPressed: _drawing ? _submitGuess : null),
                  ],
                ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        // Scores + guess feed.
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                flex: 5,
                child: Column(
                  children: [
                    for (var i = 0; i < widget.session.seats.length; i++)
                      _ScoreRow(
                        session: widget.session,
                        seat: i,
                        name: nameOf(i),
                        score: i < scores.length ? scores[i] : 0,
                        drawing: i == _drawerSeat,
                        solved: i < guessed.length && guessed[i],
                        me: i == widget.mySeat,
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                flex: 6,
                child: Container(
                  height: 40.0 * math.max(2, math.min(widget.session.seats.length, 5)),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  decoration: BoxDecoration(color: AppColors.glassFill, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.glassStroke)),
                  child: guesses.isEmpty
                      ? const Center(child: Text('Guesses appear here', style: TextStyle(color: AppColors.textMuted, fontSize: 11)))
                      : ListView.builder(
                          reverse: true,
                          itemCount: guesses.length,
                          itemBuilder: (context, i) {
                            final g = guesses[guesses.length - 1 - i];
                            final seat = (g['seat'] as num?)?.toInt() ?? -1;
                            final correct = g['correct'] == true;
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 3),
                              child: RichText(
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                text: TextSpan(
                                  style: const TextStyle(fontSize: 11.5),
                                  children: [
                                    TextSpan(text: '${nameOf(seat)}: ', style: TextStyle(color: TableSkins.paletteFor(widget.session, seat).light, fontWeight: FontWeight.w800)),
                                    TextSpan(
                                      text: correct ? 'guessed it! ✅' : g['text'].toString(),
                                      style: TextStyle(color: correct ? AppColors.success : AppColors.textPrimary, fontWeight: correct ? FontWeight.w800 : FontWeight.w500),
                                    ),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ── Widgets ───────────────────────────────────────────────────────────────────

class _WordMask extends StatelessWidget {
  const _WordMask({required this.letters, required this.solved});
  final List<String> letters;
  final bool solved;

  @override
  Widget build(BuildContext context) {
    if (letters.isEmpty) return const SizedBox.shrink();
    return Wrap(
      spacing: 3,
      runSpacing: 3,
      alignment: WrapAlignment.center,
      children: [
        for (final ch in letters)
          ch == ' '
              ? const SizedBox(width: 10)
              : AnimatedContainer(
                  duration: const Duration(milliseconds: 250),
                  width: 18,
                  height: 24,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: ch == '_' ? Colors.black.withValues(alpha: 0.35) : (solved ? AppColors.gold : Colors.white),
                    borderRadius: BorderRadius.circular(5),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.5)),
                  ),
                  child: Text(ch == '_' ? '' : ch.toUpperCase(), style: const TextStyle(color: Color(0xFF1B1B2F), fontSize: 13, fontWeight: FontWeight.w900)),
                ),
        Padding(
          padding: const EdgeInsets.only(left: 6),
          child: Text('${letters.where((c) => c != ' ').length}', style: const TextStyle(color: AppColors.textMuted, fontSize: 11, fontWeight: FontWeight.w700)),
        ),
      ],
    );
  }
}

class _TimerBadge extends StatelessWidget {
  const _TimerBadge({required this.seconds, required this.progress, required this.active});
  final int seconds;
  final double progress;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final color = !active ? AppColors.textMuted : (progress < 0.25 ? AppColors.coral : AppColors.gold);
    return Container(
      width: 44,
      height: 30,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: color.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(8), border: Border.all(color: color)),
      child: Text(active ? '${seconds}s' : '—', style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w900)),
    );
  }
}

class _Toolbox extends StatelessWidget {
  const _Toolbox({
    required this.palette,
    required this.color,
    required this.width,
    required this.eraser,
    required this.enabled,
    required this.busy,
    required this.onColor,
    required this.onWidth,
    required this.onEraser,
    required this.onUndo,
    required this.onClear,
  });
  final List<Color> palette;
  final Color color;
  final double width;
  final bool eraser;
  final bool enabled;
  final bool busy;
  final ValueChanged<Color> onColor;
  final ValueChanged<double> onWidth;
  final VoidCallback onEraser;
  final VoidCallback onUndo;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            for (final c in palette)
              GestureDetector(
                onTap: enabled ? () => onColor(c) : null,
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 150),
                  width: c == color && !eraser ? 30 : 24,
                  height: c == color && !eraser ? 30 : 24,
                  decoration: BoxDecoration(
                    color: c,
                    shape: BoxShape.circle,
                    border: Border.all(color: c == color && !eraser ? AppColors.gold : Colors.white.withValues(alpha: 0.7), width: c == color && !eraser ? 2.5 : 1.2),
                    boxShadow: [if (c == color && !eraser) BoxShadow(color: c.withValues(alpha: 0.7), blurRadius: 10)],
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            for (final w in const [3.0, 6.0, 11.0])
              GestureDetector(
                onTap: enabled ? () => onWidth(w) : null,
                child: Container(
                  width: 34,
                  height: 34,
                  margin: const EdgeInsets.only(right: 6),
                  decoration: BoxDecoration(
                    color: width == w ? AppColors.electricPurple.withValues(alpha: 0.35) : Colors.black.withValues(alpha: 0.3),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: width == w ? AppColors.electricPurple : AppColors.glassStroke),
                  ),
                  child: Center(child: Container(width: w * 1.6, height: w * 1.6, decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle))),
                ),
              ),
            const SizedBox(width: 4),
            _ToolButton(icon: Icons.auto_fix_normal_rounded, label: 'Eraser', active: eraser, onTap: enabled ? onEraser : null),
            const Spacer(),
            _ToolButton(icon: Icons.undo_rounded, label: 'Undo', active: false, onTap: enabled && !busy ? onUndo : null),
            const SizedBox(width: 6),
            _ToolButton(icon: Icons.delete_sweep_rounded, label: 'Clear', active: false, color: AppColors.coral, onTap: enabled && !busy ? onClear : null),
          ],
        ),
      ],
    );
  }
}

class _ToolButton extends StatelessWidget {
  const _ToolButton({required this.icon, required this.label, required this.active, required this.onTap, this.color});
  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback? onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? AppColors.electricPurple;
    return GestureDetector(
      onTap: onTap,
      child: Opacity(
        opacity: onTap == null ? 0.45 : 1,
        child: Container(
          height: 34,
          padding: const EdgeInsets.symmetric(horizontal: 10),
          decoration: BoxDecoration(
            color: active ? c.withValues(alpha: 0.35) : Colors.black.withValues(alpha: 0.3),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: active ? c : AppColors.glassStroke),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 16, color: active ? Colors.white : c),
              const SizedBox(width: 4),
              Text(label, style: TextStyle(color: active ? Colors.white : AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w800)),
            ],
          ),
        ),
      ),
    );
  }
}

class _ScoreRow extends StatelessWidget {
  const _ScoreRow({required this.session, required this.seat, required this.name, required this.score, required this.drawing, required this.solved, required this.me});
  final GameSessionView session;
  final int seat;
  final String name;
  final int score;
  final bool drawing;
  final bool solved;
  final bool me;

  @override
  Widget build(BuildContext context) {
    final palette = TableSkins.paletteFor(session, seat);
    return AnimatedContainer(
      duration: const Duration(milliseconds: 250),
      margin: const EdgeInsets.only(bottom: 4),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: solved ? AppColors.success.withValues(alpha: 0.18) : (drawing ? palette.base.withValues(alpha: 0.2) : AppColors.glassFill),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: solved ? AppColors.success : (drawing ? palette.light : AppColors.glassStroke)),
      ),
      child: Row(
        children: [
          Container(width: 10, height: 10, decoration: BoxDecoration(shape: BoxShape.circle, color: palette.base, border: Border.all(color: palette.light))),
          const SizedBox(width: 6),
          Expanded(child: Text(me ? 'You' : name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.textPrimary, fontSize: 11.5, fontWeight: FontWeight.w700))),
          if (drawing) const Padding(padding: EdgeInsets.only(right: 4), child: Icon(Icons.brush_rounded, size: 13, color: AppColors.gold)),
          if (solved) const Padding(padding: EdgeInsets.only(right: 4), child: Icon(Icons.check_circle_rounded, size: 13, color: AppColors.success)),
          Text('$score', style: const TextStyle(color: AppColors.gold, fontSize: 12, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }
}

// ── Painters ──────────────────────────────────────────────────────────────────

class _PaperPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final dots = Paint()..color = const Color(0xFF1B1B2F).withValues(alpha: 0.06);
    const step = 18.0;
    for (var x = step; x < size.width; x += step) {
      for (var y = step; y < size.height; y += step) {
        canvas.drawCircle(Offset(x, y), 1, dots);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _PaperPainter old) => false;
}

class _SketchPainter extends CustomPainter {
  _SketchPainter({required this.strokes, required this.live});
  final List<_Stroke> strokes;
  final _Stroke? live;

  @override
  void paint(Canvas canvas, Size size) {
    void draw(_Stroke s) {
      final paint = Paint()
        ..color = s.color
        ..strokeWidth = s.width
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..style = PaintingStyle.stroke;
      if (s.points.length == 1) {
        canvas.drawCircle(Offset(s.points.first.dx * size.width, s.points.first.dy * size.height), s.width / 2, Paint()..color = s.color);
        return;
      }
      final path = Path()..moveTo(s.points.first.dx * size.width, s.points.first.dy * size.height);
      for (var i = 1; i < s.points.length; i++) {
        final p0 = Offset(s.points[i - 1].dx * size.width, s.points[i - 1].dy * size.height);
        final p1 = Offset(s.points[i].dx * size.width, s.points[i].dy * size.height);
        final mid = Offset((p0.dx + p1.dx) / 2, (p0.dy + p1.dy) / 2);
        path.quadraticBezierTo(p0.dx, p0.dy, mid.dx, mid.dy);
      }
      final last = s.points.last;
      path.lineTo(last.dx * size.width, last.dy * size.height);
      canvas.drawPath(path, paint);
    }

    for (final s in strokes) {
      draw(s);
    }
    if (live != null) draw(live!);
  }

  @override
  bool shouldRepaint(covariant _SketchPainter old) => true;
}
