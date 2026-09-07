import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../skins/skinned_pieces.dart';
import '../skins/table_skins.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Memory Race: a shared grid of face-down cards (8 pairs). Everybody plays at
/// once — tap two cards; a match is yours for good and the pair is framed in
/// your colour. Real 3D flips, a glowing live pair and a race timer.
class MemoryRaceBoard extends StatefulWidget {
  const MemoryRaceBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<MemoryRaceBoard> createState() => _MemoryRaceBoardState();
}

class _MemoryRaceBoardState extends State<MemoryRaceBoard> {
  Timer? _tick;
  int _now = DateTime.now().millisecondsSinceEpoch;
  bool _busy = false;
  int _lastMatchedCount = 0;

  Map<String, dynamic> get b => widget.session.board;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(milliseconds: 250), (_) {
      if (mounted) setState(() => _now = DateTime.now().millisecondsSinceEpoch);
    });
  }

  @override
  void didUpdateWidget(covariant MemoryRaceBoard old) {
    super.didUpdateWidget(old);
    final matched = ((b['states'] as List?) ?? const []).where((s) => s == 'matched').length;
    if (matched > _lastMatchedCount) GameFeedback.hit();
    _lastMatchedCount = matched;
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final emojis = ((b['emojis'] as List?) ?? const []).map((e) => e == null ? '' : e.toString()).toList();
    final states = ((b['states'] as List?) ?? const []).map((e) => e.toString()).toList();
    final matchedBy = ((b['matchedBy'] as List?) ?? const []).map((e) => (e as num?)?.toInt() ?? -1).toList();
    final scores = ((b['scores'] as List?) ?? const []).map((e) => (e as num?)?.toInt() ?? 0).toList();
    final flipped = ((b['flipped'] as List?) ?? const []).map((e) => (e as num).toInt()).toList();
    final endsAt = DateTime.tryParse((b['roundEndsAt'] as String?) ?? '')?.millisecondsSinceEpoch ?? _now;
    final remainMs = (endsAt - _now).clamp(0, 120000);
    final playground = TableSkins.playgroundFor(widget.session, widget.mySeat);

    final totalPairs = emojis.length ~/ 2;
    final matchedPairs = matchedBy.where((s) => s >= 0).length ~/ 2;
    final pairsLeft = totalPairs - matchedPairs;
    final columns = emojis.length <= 12 ? 3 : (emojis.length <= 20 ? 4 : 5);
    final canFlip = widget.session.isInProgress && flipped.length < 2 && !_busy && widget.mySeat >= 0;

    return Column(
      children: [
        TurnIndicator(
          text: widget.session.isInProgress ? 'Everyone plays at once — $pairsLeft pair${pairsLeft == 1 ? '' : 's'} left' : 'Game over',
          highlight: canFlip,
          icon: Icons.psychology_alt_rounded,
        ),
        const SizedBox(height: 8),
        // Race timer.
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Row(
            children: [
              Icon(Icons.timer_outlined, size: 16, color: remainMs < 15000 ? AppColors.coral : AppColors.textSecondary),
              const SizedBox(width: 6),
              Text(
                '${(remainMs / 1000).ceil()}s',
                style: TextStyle(color: remainMs < 15000 ? AppColors.coral : AppColors.textPrimary, fontWeight: FontWeight.w800, fontSize: 14),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: (remainMs / 120000).clamp(0.0, 1.0),
                    minHeight: 5,
                    backgroundColor: Colors.white.withValues(alpha: 0.08),
                    valueColor: AlwaysStoppedAnimation<Color>(remainMs < 15000 ? AppColors.coral : playground.accent),
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Playground(
          skin: playground,
          padding: const EdgeInsets.all(12),
          child: GridView.count(
            crossAxisCount: columns,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 8,
            crossAxisSpacing: 8,
            childAspectRatio: 0.82,
            children: List.generate(emojis.length, (i) {
              final state = i < states.length ? states[i] : 'down';
              final faceUp = state == 'up' || state == 'matched';
              final matched = state == 'matched';
              final owner = i < matchedBy.length ? matchedBy[i] : -1;
              final palette = owner >= 0 ? TableSkins.paletteFor(widget.session, owner) : null;
              final live = flipped.contains(i);
              return _FlipCard(
                key: ValueKey('card-$i'),
                faceUp: faceUp,
                emoji: emojis[i],
                matched: matched,
                live: live,
                ownerColor: palette?.light,
                ownerGlow: palette?.glow,
                mine: owner == widget.mySeat && owner >= 0,
                backAccent: playground.accent,
                backTop: playground.feltTop,
                backBottom: playground.feltBottom,
                onTap: canFlip && !faceUp ? () => _flip(i) : null,
              );
            }),
          ),
        ),
        const SizedBox(height: 10),
        // Scores.
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Wrap(
            spacing: 8,
            runSpacing: 6,
            alignment: WrapAlignment.center,
            children: List.generate(math.min(scores.length, widget.session.seats.length), (i) {
              final palette = TableSkins.paletteFor(widget.session, i);
              final leader = scores[i] > 0 && scores[i] == scores.reduce(math.max);
              return Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: i == widget.mySeat ? palette.base.withValues(alpha: 0.22) : AppColors.glassFill,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: leader ? palette.light : AppColors.glassStroke, width: leader ? 1.6 : 1),
                  boxShadow: leader ? [BoxShadow(color: palette.glow.withValues(alpha: 0.3), blurRadius: 10)] : null,
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    SkinnedPiece(skin: TableSkins.pieceSkin(widget.session.cosmeticsOf(i).piece), seat: i, size: 16),
                    const SizedBox(width: 8),
                    Text(
                      i == widget.mySeat ? 'You' : widget.session.seats[i].displayName,
                      style: const TextStyle(color: AppColors.textPrimary, fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(width: 8),
                    Text('${scores[i]}', style: TextStyle(color: palette.light, fontWeight: FontWeight.w900, fontSize: 15)),
                    if (widget.session.winnerSeat == i) const Padding(padding: EdgeInsets.only(left: 4), child: Text('🏆', style: TextStyle(fontSize: 12))),
                  ],
                ),
              );
            }),
          ),
        ),
      ],
    );
  }

  Future<void> _flip(int index) async {
    setState(() => _busy = true);
    GameFeedback.tap();
    await widget.onAction('flip', {'index': index});
    if (mounted) setState(() => _busy = false);
  }
}

/// A card that rotates around its Y axis between a patterned back and the
/// emoji face; matched cards settle with the owner's coloured frame.
class _FlipCard extends StatelessWidget {
  const _FlipCard({
    super.key,
    required this.faceUp,
    required this.emoji,
    required this.matched,
    required this.live,
    required this.ownerColor,
    required this.ownerGlow,
    required this.mine,
    required this.backAccent,
    required this.backTop,
    required this.backBottom,
    required this.onTap,
  });

  final bool faceUp;
  final String emoji;
  final bool matched;
  final bool live;
  final Color? ownerColor;
  final Color? ownerGlow;
  final bool mine;
  final Color backAccent;
  final Color backTop;
  final Color backBottom;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: TweenAnimationBuilder<double>(
        tween: Tween(begin: faceUp ? 1 : 0, end: faceUp ? 1 : 0),
        duration: const Duration(milliseconds: 380),
        curve: Curves.easeInOutCubic,
        builder: (context, t, _) {
          final angle = t * math.pi;
          final showFace = angle > math.pi / 2;
          return Transform(
            alignment: Alignment.center,
            transform: Matrix4.identity()
              ..setEntry(3, 2, 0.0016)
              ..rotateY(angle),
            child: showFace
                ? Transform(
                    alignment: Alignment.center,
                    transform: Matrix4.identity()..rotateY(math.pi),
                    child: _face(),
                  )
                : _back(),
          );
        },
      ),
    );
  }

  Widget _back() {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color.lerp(backTop, Colors.white, 0.12)!, backBottom, Color.lerp(backBottom, Colors.black, 0.35)!],
        ),
        border: Border.all(color: Colors.white.withValues(alpha: onTap != null ? 0.35 : 0.15), width: 1.2),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.45), blurRadius: 8, offset: const Offset(0, 4)),
          if (onTap != null) BoxShadow(color: backAccent.withValues(alpha: 0.18), blurRadius: 12),
        ],
      ),
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Inner frame + lattice.
          Positioned.fill(
            child: Padding(
              padding: const EdgeInsets.all(6),
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: backAccent.withValues(alpha: 0.5)),
                ),
              ),
            ),
          ),
          Positioned.fill(child: CustomPaint(painter: _LatticePainter(color: backAccent.withValues(alpha: 0.22)))),
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.black.withValues(alpha: 0.25),
              border: Border.all(color: backAccent.withValues(alpha: 0.8), width: 1.4),
            ),
            child: Icon(Icons.auto_awesome, size: 16, color: backAccent),
          ),
        ],
      ),
    );
  }

  Widget _face() {
    final frame = matched ? (ownerColor ?? Colors.white) : (live ? AppColors.gold : Colors.white24);
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: matched
              ? [Color.lerp(ownerColor ?? Colors.white, Colors.white, 0.75)!, Color.lerp(ownerColor ?? Colors.white, Colors.white, 0.55)!]
              : const [Colors.white, Color(0xFFEDEBF5)],
        ),
        border: Border.all(color: frame, width: matched || live ? 2.4 : 1),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 8, offset: const Offset(0, 4)),
          if (matched) BoxShadow(color: (ownerGlow ?? Colors.white).withValues(alpha: 0.5), blurRadius: 14),
          if (live) BoxShadow(color: AppColors.gold.withValues(alpha: 0.5), blurRadius: 14),
        ],
      ),
      child: Stack(
        alignment: Alignment.center,
        children: [
          Text(emoji, style: TextStyle(fontSize: matched ? 30 : 32)),
          if (matched && mine)
            Positioned(
              right: 4,
              top: 3,
              child: Icon(Icons.check_circle_rounded, size: 14, color: ownerColor),
            ),
        ],
      ),
    );
  }
}

class _LatticePainter extends CustomPainter {
  _LatticePainter({required this.color});
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1;
    const step = 9.0;
    for (var d = -size.height; d < size.width; d += step) {
      canvas.drawLine(Offset(d, 0), Offset(d + size.height, size.height), paint);
      canvas.drawLine(Offset(d + size.height, 0), Offset(d, size.height), paint);
    }
  }

  @override
  bool shouldRepaint(covariant _LatticePainter old) => old.color != color;
}
