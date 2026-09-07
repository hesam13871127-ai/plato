import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/piece_3d.dart';
import '../../domain/entities/game_entities.dart';
import '../skins/skinned_pieces.dart';
import '../skins/table_skins.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Bingo hall. The server is the caller: a numbered ball pops out of the
/// hopper every few seconds and the last few calls roll along a rail. Your
/// 5×5 card daubs itself as numbers are called; a line one away from
/// completing glows, and the big BINGO button lights up the moment you have
/// a row, column or diagonal. Calling early is a false call.
class BingoBoard extends StatefulWidget {
  const BingoBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<BingoBoard> createState() => _BingoBoardState();
}

class _BingoBoardState extends State<BingoBoard> with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;
  Timer? _timer;
  int _now = DateTime.now().millisecondsSinceEpoch;
  int? _lastCall;
  int _lastCallSeenAt = 0;
  bool _busy = false;

  static const int free = 0;
  static const _letters = ['B', 'I', 'N', 'G', 'O'];
  static const _lines = [
    [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14], [15, 16, 17, 18, 19], [20, 21, 22, 23, 24],
    [0, 5, 10, 15, 20], [1, 6, 11, 16, 21], [2, 7, 12, 17, 22], [3, 8, 13, 18, 23], [4, 9, 14, 19, 24],
    [0, 6, 12, 18, 24], [4, 8, 12, 16, 20],
  ];

  Map<String, dynamic> get b => widget.session.board;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(vsync: this, duration: const Duration(milliseconds: 800))..repeat(reverse: true);
    _timer = Timer.periodic(const Duration(milliseconds: 200), (_) {
      if (mounted) setState(() => _now = DateTime.now().millisecondsSinceEpoch);
    });
    _lastCall = (b['currentCall'] as num?)?.toInt();
    _lastCallSeenAt = _now;
  }

  @override
  void didUpdateWidget(covariant BingoBoard old) {
    super.didUpdateWidget(old);
    final call = (b['currentCall'] as num?)?.toInt();
    if (call != null && call != _lastCall) {
      _lastCall = call;
      _lastCallSeenAt = DateTime.now().millisecondsSinceEpoch;
      final card = _card;
      if (card.contains(call)) {
        GameFeedback.move();
      } else {
        GameFeedback.tap();
      }
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _pulse.dispose();
    super.dispose();
  }

  List<int> get _card {
    final raw = (b['myCard'] as List?) ?? const [];
    final cells = raw.isNotEmpty && raw.first is Map ? ((raw.first['cells'] as List?) ?? const []) : raw;
    return cells.map((v) => v == null ? free : (v as num).toInt()).toList();
  }

  List<int> get _called => ((b['called'] as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();

  bool _isMarked(List<int> card, Set<int> marked, int idx) => card[idx] == free || marked.contains(card[idx]);

  /// Indices of any completed line, plus the set of cells sitting on a line one call away.
  _LineStatus _lineStatus(List<int> card, Set<int> marked) {
    final complete = <int>{};
    final almost = <int>{};
    if (card.length != 25) return _LineStatus(complete, almost);
    for (final line in _lines) {
      final missing = line.where((i) => !_isMarked(card, marked, i)).toList();
      if (missing.isEmpty) {
        complete.addAll(line);
      } else if (missing.length == 1) {
        almost.addAll(line);
      }
    }
    return _LineStatus(complete, almost);
  }

  Future<void> _claim() async {
    if (_busy) return;
    setState(() => _busy = true);
    GameFeedback.hit();
    // A premature claim is rejected server-side ("False call") and surfaces
    // in the table's error banner; the card simply keeps daubing.
    await widget.onAction('claim', {});
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final card = _card;
    final called = _called;
    final calledSet = called.toSet();
    final current = (b['currentCall'] as num?)?.toInt();
    final markedCounts = ((b['markedCounts'] as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();
    final playground = TableSkins.playgroundFor(widget.session, widget.mySeat);
    final status = _lineStatus(card, calledSet);
    final haveBingo = status.complete.isNotEmpty && widget.session.isInProgress && widget.mySeat >= 0;
    final sinceCall = (_now - _lastCallSeenAt).clamp(0, 4000) / 4000;
    final recent = called.length > 6 ? called.sublist(called.length - 6) : called;

    String text;
    if (!widget.session.isInProgress) {
      text = 'Game over';
    } else if (haveBingo) {
      text = 'You have a line — call BINGO!';
    } else if (status.almost.isNotEmpty) {
      text = 'One away! ${called.length} of 75 called';
    } else {
      text = 'Daubing automatically · ${called.length} of 75 called';
    }

    return Column(
      children: [
        TurnIndicator(text: text, highlight: haveBingo, icon: Icons.campaign_rounded),
        const SizedBox(height: 8),
        Playground(
          skin: playground,
          padding: const EdgeInsets.all(12),
          child: Column(
            children: [
              // Caller: hopper + current ball + recent rail.
              SizedBox(
                height: 84,
                child: Row(
                  children: [
                    // Current ball.
                    AnimatedBuilder(
                      animation: _pulse,
                      builder: (context, _) {
                        final pop = Curves.elasticOut.transform(sinceCall.clamp(0.0, 1.0));
                        return Transform.scale(
                          scale: current == null ? 1 : 0.7 + 0.3 * pop,
                          child: _BingoBall(number: current, size: 72, big: true, glow: playground.glow),
                        );
                      },
                    ),
                    const SizedBox(width: 10),
                    // Countdown to the next ball.
                    SizedBox(
                      width: 26,
                      height: 26,
                      child: CircularProgressIndicator(
                        value: 1 - sinceCall,
                        strokeWidth: 3,
                        backgroundColor: Colors.white.withValues(alpha: 0.1),
                        valueColor: AlwaysStoppedAnimation<Color>(playground.accent),
                      ),
                    ),
                    const SizedBox(width: 10),
                    // Recent calls rail.
                    Expanded(
                      child: Container(
                        height: 52,
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.3),
                          borderRadius: BorderRadius.circular(26),
                          border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            for (var i = 0; i < recent.length - 1 && i < recent.length; i++)
                              Padding(
                                padding: const EdgeInsets.only(left: 4),
                                child: _BingoBall(number: recent[i], size: 34, glow: playground.glow),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              // The card.
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(18),
                  gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFFFDFBFF), Color(0xFFE9E5F6)]),
                  boxShadow: [
                    BoxShadow(color: Colors.black.withValues(alpha: 0.45), blurRadius: 16, offset: const Offset(0, 8)),
                    if (haveBingo) BoxShadow(color: AppColors.gold.withValues(alpha: 0.5), blurRadius: 24),
                  ],
                ),
                child: Column(
                  children: [
                    Row(
                      children: [
                        for (var c = 0; c < 5; c++)
                          Expanded(
                            child: Container(
                              margin: const EdgeInsets.all(2),
                              height: 34,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(8),
                                gradient: LinearGradient(colors: [_letterColor(c), Color.lerp(_letterColor(c), Colors.black, 0.25)!]),
                              ),
                              child: Text(_letters[c], style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 18)),
                            ),
                          ),
                      ],
                    ),
                    if (card.length == 25)
                      for (var r = 0; r < 5; r++)
                        Row(
                          children: [
                            for (var c = 0; c < 5; c++)
                              Expanded(
                                child: AspectRatio(
                                  aspectRatio: 1,
                                  child: _Cell(
                                    number: card[r * 5 + c],
                                    isFree: card[r * 5 + c] == free,
                                    marked: _isMarked(card, calledSet, r * 5 + c),
                                    justCalled: current != null && card[r * 5 + c] == current,
                                    inCompleteLine: status.complete.contains(r * 5 + c),
                                    inAlmostLine: status.almost.contains(r * 5 + c),
                                    daub: TableSkins.paletteFor(widget.session, widget.mySeat < 0 ? 0 : widget.mySeat),
                                    pulse: _pulse,
                                  ),
                                ),
                              ),
                          ],
                        )
                    else
                      const Padding(
                        padding: EdgeInsets.all(24),
                        child: Text('Spectating — no card', style: TextStyle(color: Colors.black54, fontWeight: FontWeight.w600)),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        // BINGO button.
        if (widget.session.isInProgress && widget.mySeat >= 0)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: AnimatedBuilder(
              animation: _pulse,
              builder: (context, _) {
                final glow = haveBingo ? 0.35 + 0.35 * _pulse.value : 0.0;
                return Container(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(18),
                    boxShadow: haveBingo ? [BoxShadow(color: AppColors.gold.withValues(alpha: glow), blurRadius: 22, spreadRadius: 1)] : null,
                  ),
                  child: ActionButton(
                    label: haveBingo ? 'BINGO!' : 'Bingo (need a full line)',
                    icon: Icons.celebration_rounded,
                    color: haveBingo ? AppColors.gold : AppColors.surfaceElevated,
                    onPressed: _busy ? null : _claim,
                  ),
                );
              },
            ),
          ),
        const SizedBox(height: 10),
        // Players: marked counts race.
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Wrap(
            spacing: 8,
            runSpacing: 6,
            alignment: WrapAlignment.center,
            children: [
              for (var i = 0; i < widget.session.seats.length; i++)
                _PlayerChip(
                  name: i == widget.mySeat ? 'You' : widget.session.seats[i].displayName,
                  marked: i < markedCounts.length ? markedCounts[i] : 0,
                  skin: TableSkins.pieceSkin(widget.session.cosmeticsOf(i).piece),
                  seat: i,
                  winner: widget.session.winnerSeat == i,
                  me: i == widget.mySeat,
                ),
            ],
          ),
        ),
      ],
    );
  }

  Color _letterColor(int col) {
    const colors = [AppColors.electricPurple, AppColors.softCyan, AppColors.gold, AppColors.coral, AppColors.sky];
    return colors[col % colors.length];
  }
}

class _LineStatus {
  const _LineStatus(this.complete, this.almost);
  final Set<int> complete;
  final Set<int> almost;
}

class _Cell extends StatelessWidget {
  const _Cell({
    required this.number,
    required this.isFree,
    required this.marked,
    required this.justCalled,
    required this.inCompleteLine,
    required this.inAlmostLine,
    required this.daub,
    required this.pulse,
  });
  final int number;
  final bool isFree;
  final bool marked;
  final bool justCalled;
  final bool inCompleteLine;
  final bool inAlmostLine;
  final PiecePalette daub;
  final Animation<double> pulse;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: pulse,
      builder: (context, _) {
        final almostGlow = inAlmostLine && !marked ? 0.15 + 0.2 * pulse.value : 0.0;
        return Container(
          margin: const EdgeInsets.all(2),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            color: inCompleteLine ? AppColors.gold.withValues(alpha: 0.35) : (inAlmostLine ? AppColors.gold.withValues(alpha: almostGlow) : Colors.black.withValues(alpha: 0.05)),
            border: Border.all(color: inCompleteLine ? AppColors.gold : Colors.black.withValues(alpha: 0.08), width: inCompleteLine ? 1.6 : 1),
          ),
          child: Stack(
            alignment: Alignment.center,
            children: [
              // Daub.
              AnimatedScale(
                duration: const Duration(milliseconds: 260),
                curve: Curves.easeOutBack,
                scale: marked ? 1 : 0,
                child: Container(
                  margin: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(center: const Alignment(-0.3, -0.35), colors: [daub.light, daub.base, daub.dark]),
                    boxShadow: [BoxShadow(color: daub.glow.withValues(alpha: justCalled ? 0.8 : 0.35), blurRadius: justCalled ? 12 : 5)],
                  ),
                ),
              ),
              Text(
                isFree ? '★' : '$number',
                style: TextStyle(
                  color: marked ? Colors.white : const Color(0xFF232544),
                  fontWeight: FontWeight.w900,
                  fontSize: isFree ? 20 : 15,
                  shadows: marked ? const [Shadow(color: Colors.black38, blurRadius: 3)] : null,
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _BingoBall extends StatelessWidget {
  const _BingoBall({required this.number, required this.size, required this.glow, this.big = false});
  final int? number;
  final double size;
  final Color glow;
  final bool big;

  static const _letters = ['B', 'I', 'N', 'G', 'O'];

  @override
  Widget build(BuildContext context) {
    final n = number;
    final col = n == null ? -1 : ((n - 1) ~/ 15).clamp(0, 4);
    const colors = [AppColors.electricPurple, AppColors.softCyan, AppColors.gold, AppColors.coral, AppColors.sky];
    final color = col < 0 ? AppColors.surfaceElevated : colors[col];
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(center: const Alignment(-0.35, -0.4), colors: [Color.lerp(color, Colors.white, 0.6)!, color, Color.lerp(color, Colors.black, 0.45)!], stops: const [0, 0.5, 1]),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.5), blurRadius: size * 0.15, offset: Offset(0, size * 0.08)),
          if (big) BoxShadow(color: glow.withValues(alpha: 0.45), blurRadius: size * 0.4),
        ],
      ),
      child: Center(
        child: Container(
          width: size * 0.6,
          height: size * 0.6,
          decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: 0.92)),
          child: n == null
              ? Icon(Icons.hourglass_top_rounded, size: size * 0.3, color: AppColors.textMuted)
              : Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(_letters[col], style: TextStyle(color: color, fontSize: size * 0.17, fontWeight: FontWeight.w900, height: 1)),
                    Text('$n', style: TextStyle(color: const Color(0xFF1B1E33), fontSize: size * 0.27, fontWeight: FontWeight.w900, height: 1)),
                  ],
                ),
        ),
      ),
    );
  }
}

class _PlayerChip extends StatelessWidget {
  const _PlayerChip({required this.name, required this.marked, required this.skin, required this.seat, required this.winner, required this.me});
  final String name;
  final int marked;
  final PieceSkin skin;
  final int seat;
  final bool winner;
  final bool me;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: me ? AppColors.electricPurple.withValues(alpha: 0.22) : AppColors.glassFill,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: winner ? AppColors.gold : AppColors.glassStroke, width: winner ? 1.6 : 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          SkinnedPiece(skin: skin, seat: seat, size: 16),
          const SizedBox(width: 8),
          Text(name, style: const TextStyle(color: AppColors.textPrimary, fontSize: 12, fontWeight: FontWeight.w600)),
          const SizedBox(width: 8),
          Text('${math.min(marked, 24)}/24', style: const TextStyle(color: AppColors.softCyan, fontWeight: FontWeight.w800, fontSize: 12)),
          if (winner) const Padding(padding: EdgeInsets.only(left: 4), child: Text('🏆', style: TextStyle(fontSize: 12))),
        ],
      ),
    );
  }
}
