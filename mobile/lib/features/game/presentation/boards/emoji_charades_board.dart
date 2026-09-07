import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/piece_3d.dart';
import '../../domain/entities/game_entities.dart';
import '../skins/skinned_pieces.dart';
import '../skins/table_skins.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Emoji Charades. One player performs — their emoji clues pop onto a stage
/// one at a time — while everyone else races to type the answer. A category
/// marquee, the emoji stage with placeholder slots for clues still to come,
/// a round timer bar and a fast guess box with your recent attempts.
class EmojiCharadesBoard extends StatefulWidget {
  const EmojiCharadesBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<EmojiCharadesBoard> createState() => _EmojiCharadesBoardState();
}

class _EmojiCharadesBoardState extends State<EmojiCharadesBoard> {
  final TextEditingController _controller = TextEditingController();
  final FocusNode _focus = FocusNode();
  Timer? _timer;
  int _now = DateTime.now().millisecondsSinceEpoch;
  int _roundStartedAt = DateTime.now().millisecondsSinceEpoch;
  int _lastRound = -1;
  int _lastEmojiCount = 0;
  int? _lastWinner;
  bool _busy = false;
  final List<String> _myGuesses = [];

  Map<String, dynamic> get b => widget.session.board;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(milliseconds: 200), (_) {
      if (mounted) setState(() => _now = DateTime.now().millisecondsSinceEpoch);
    });
    _controller.addListener(() => setState(() {}));
  }

  @override
  void didUpdateWidget(covariant EmojiCharadesBoard old) {
    super.didUpdateWidget(old);
    final round = (b['round'] as num?)?.toInt() ?? 1;
    if (round != _lastRound) {
      _lastRound = round;
      _roundStartedAt = DateTime.now().millisecondsSinceEpoch;
      _myGuesses.clear();
      _lastWinner = null;
    }
    final emojis = (b['revealedEmojis'] as List?) ?? const [];
    if (emojis.length > _lastEmojiCount) GameFeedback.tap();
    _lastEmojiCount = emojis.length;
    final winner = (b['winnerSeat'] as num?)?.toInt();
    if (winner != null && winner != _lastWinner) {
      _lastWinner = winner;
      if (winner == widget.mySeat) {
        GameFeedback.hit();
      } else {
        GameFeedback.move();
      }
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final round = (b['round'] as num?)?.toInt() ?? 1;
    final target = (b['target'] as num?)?.toInt() ?? 6;
    final performer = (b['performerSeat'] as num?)?.toInt() ?? -1;
    final category = (b['category'] as String?) ?? '';
    final emojis = ((b['revealedEmojis'] as List?) ?? const []).map((e) => e.toString()).toList();
    final winner = (b['winnerSeat'] as num?)?.toInt();
    final winnerWord = b['winnerWord'] as String?;
    final players = ((b['players'] as List?) ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    final endsAt = DateTime.tryParse((b['revealEndsAt'] as String?) ?? '')?.millisecondsSinceEpoch ?? _now;
    final totalMs = (endsAt - _roundStartedAt).clamp(1000, 60000);
    final remainMs = (endsAt - _now).clamp(0, 60000);
    final playground = TableSkins.playgroundFor(widget.session, widget.mySeat);
    final seats = widget.session.seats;
    final iPerform = performer == widget.mySeat;
    final solved = winner != null;
    final canGuess = widget.session.isInProgress && !iPerform && !solved && !_busy && widget.mySeat >= 0;
    final performerName = performer >= 0 && performer < seats.length ? (iPerform ? 'You' : seats[performer].displayName) : '?';

    String status;
    if (!widget.session.isInProgress) {
      status = 'Game over';
    } else if (solved) {
      final who = winner == widget.mySeat ? 'You' : (winner < seats.length ? seats[winner].displayName : 'Someone');
      status = '$who got it: "${winnerWord ?? ''}"';
    } else if (iPerform) {
      status = 'You are performing — your clues appear one by one';
    } else {
      status = 'Round $round of $target — guess what $performerName is showing!';
    }

    return Column(
      children: [
        TurnIndicator(text: status, highlight: canGuess, icon: Icons.theater_comedy_rounded),
        const SizedBox(height: 8),
        Playground(
          skin: playground,
          padding: const EdgeInsets.all(12),
          child: Column(
            children: [
              // Marquee: performer + category.
              Row(
                children: [
                  if (performer >= 0)
                    SkinnedPiece(skin: TableSkins.pieceSkin(widget.session.cosmeticsOf(performer).piece), seat: performer, size: 22, highlight: true),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text('$performerName performs', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 13)),
                  ),
                  if (category.isNotEmpty)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: playground.accent.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: playground.accent.withValues(alpha: 0.7)),
                      ),
                      child: Text(category.toUpperCase(), style: TextStyle(color: playground.accent, fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 1)),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              // Stage.
              AnimatedContainer(
                duration: const Duration(milliseconds: 300),
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 22, horizontal: 12),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: solved
                        ? [AppColors.success.withValues(alpha: 0.35), AppColors.success.withValues(alpha: 0.12)]
                        : [Colors.white.withValues(alpha: 0.12), Colors.white.withValues(alpha: 0.04)],
                  ),
                  border: Border.all(color: solved ? AppColors.success : Colors.white.withValues(alpha: 0.18), width: solved ? 1.8 : 1),
                  boxShadow: [
                    BoxShadow(color: Colors.black.withValues(alpha: 0.35), blurRadius: 16, offset: const Offset(0, 8)),
                    if (solved) BoxShadow(color: AppColors.success.withValues(alpha: 0.35), blurRadius: 24),
                  ],
                ),
                child: Column(
                  children: [
                    Wrap(
                      alignment: WrapAlignment.center,
                      spacing: 10,
                      runSpacing: 10,
                      children: [
                        for (var i = 0; i < emojis.length; i++) _EmojiPop(key: ValueKey('e-$round-$i'), emoji: emojis[i]),
                        // Slots for clues still to come (up to four clues per round).
                        for (var i = emojis.length; i < 4 && !solved && widget.session.isInProgress; i++)
                          Container(
                            width: 56,
                            height: 56,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: Colors.white.withValues(alpha: 0.15), width: 1.2),
                              color: Colors.black.withValues(alpha: 0.15),
                            ),
                            child: Icon(Icons.more_horiz_rounded, color: Colors.white.withValues(alpha: 0.3)),
                          ),
                      ],
                    ),
                    if (solved) ...[
                      const SizedBox(height: 14),
                      Text(
                        (winnerWord ?? '').toUpperCase(),
                        style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w900, letterSpacing: 2),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 10),
              // Timer bar.
              Row(
                children: [
                  Icon(Icons.timer_outlined, size: 14, color: Colors.white.withValues(alpha: 0.7)),
                  const SizedBox(width: 6),
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(
                        value: (remainMs / totalMs).clamp(0.0, 1.0),
                        minHeight: 5,
                        backgroundColor: Colors.white.withValues(alpha: 0.1),
                        valueColor: AlwaysStoppedAnimation<Color>(remainMs < 6000 ? AppColors.coral : playground.accent),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text('${(remainMs / 1000).ceil()}s', style: TextStyle(color: remainMs < 6000 ? AppColors.coral : Colors.white, fontWeight: FontWeight.w800, fontSize: 12)),
                  const SizedBox(width: 10),
                  for (var i = 1; i <= target; i++)
                    Container(
                      width: i == round ? 10 : 6,
                      height: 6,
                      margin: const EdgeInsets.only(left: 3),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(3),
                        color: i < round ? playground.accent : (i == round ? Colors.white : Colors.white.withValues(alpha: 0.25)),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        // Guess box (or performer note).
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: iPerform
              ? Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(color: AppColors.glassFill, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.glassStroke)),
                  child: const Row(
                    children: [
                      Icon(Icons.visibility_off_rounded, color: AppColors.textSecondary, size: 18),
                      SizedBox(width: 10),
                      Expanded(child: Text('Sit tight — you score when someone guesses your clues.', style: TextStyle(color: AppColors.textSecondary, fontSize: 12))),
                    ],
                  ),
                )
              : Column(
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Container(
                            decoration: BoxDecoration(
                              color: AppColors.glassFill,
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(color: canGuess ? playground.accent.withValues(alpha: 0.7) : AppColors.glassStroke, width: canGuess ? 1.5 : 1),
                            ),
                            child: TextField(
                              controller: _controller,
                              focusNode: _focus,
                              enabled: canGuess,
                              autocorrect: false,
                              textInputAction: TextInputAction.send,
                              onSubmitted: (_) => _guess(),
                              style: const TextStyle(color: AppColors.textPrimary, fontSize: 16, fontWeight: FontWeight.w700),
                              decoration: InputDecoration(
                                hintText: solved ? 'Round solved!' : (canGuess ? 'type your guess…' : 'wait for the next round'),
                                hintStyle: const TextStyle(color: AppColors.textMuted, fontSize: 14),
                                border: InputBorder.none,
                                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                                prefixIcon: const Icon(Icons.lightbulb_outline_rounded, color: AppColors.gold, size: 20),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        ActionButton(label: 'Guess', icon: Icons.send_rounded, expanded: false, onPressed: canGuess && _controller.text.trim().length >= 2 ? _guess : null),
                      ],
                    ),
                    if (_myGuesses.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Wrap(
                          spacing: 6,
                          runSpacing: 4,
                          children: [
                            for (final g in _myGuesses.reversed.take(6))
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: Colors.black.withValues(alpha: 0.25),
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border.all(color: AppColors.coral.withValues(alpha: 0.5)),
                                ),
                                child: Text(g, style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, decoration: TextDecoration.lineThrough)),
                              ),
                          ],
                        ),
                      ),
                  ],
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
            children: [
              for (var i = 0; i < players.length && i < seats.length; i++)
                _ScoreChip(
                  name: i == widget.mySeat ? 'You' : seats[i].displayName,
                  score: (players[i]['score'] as num?)?.toInt() ?? 0,
                  performing: i == performer && widget.session.isInProgress,
                  solvedIt: winner == i,
                  palette: TableSkins.paletteFor(widget.session, i),
                  winner: widget.session.winnerSeat == i,
                ),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _guess() async {
    final word = _controller.text.trim();
    if (word.length < 2 || _busy) return;
    setState(() {
      _busy = true;
      _myGuesses.add(word);
    });
    GameFeedback.move();
    _controller.clear();
    await widget.onAction('guess', {'word': word});
    if (mounted) {
      setState(() => _busy = false);
      _focus.requestFocus();
    }
  }
}

class _EmojiPop extends StatelessWidget {
  const _EmojiPop({super.key, required this.emoji});
  final String emoji;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 520),
      curve: Curves.elasticOut,
      builder: (context, t, child) => Transform.scale(scale: t, child: child),
      child: Container(
        width: 56,
        height: 56,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Colors.white, Color(0xFFEDEBF5)]),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 8, offset: const Offset(0, 4))],
        ),
        child: Text(emoji, style: const TextStyle(fontSize: 30)),
      ),
    );
  }
}

class _ScoreChip extends StatelessWidget {
  const _ScoreChip({required this.name, required this.score, required this.performing, required this.solvedIt, required this.palette, required this.winner});
  final String name;
  final int score;
  final bool performing;
  final bool solvedIt;
  final PiecePalette palette;
  final bool winner;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 220),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: solvedIt ? AppColors.success.withValues(alpha: 0.2) : (performing ? palette.base.withValues(alpha: 0.2) : AppColors.glassFill),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: solvedIt ? AppColors.success : (performing ? palette.light : AppColors.glassStroke), width: solvedIt || performing ? 1.5 : 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (performing) const Padding(padding: EdgeInsets.only(right: 4), child: Text('🎭', style: TextStyle(fontSize: 12))),
          Container(width: 8, height: 8, decoration: BoxDecoration(shape: BoxShape.circle, color: palette.base)),
          const SizedBox(width: 6),
          Text(name, style: const TextStyle(color: AppColors.textPrimary, fontSize: 12, fontWeight: FontWeight.w600)),
          const SizedBox(width: 8),
          Text('$score', style: TextStyle(color: palette.light, fontWeight: FontWeight.w900, fontSize: 14)),
          if (winner) const Padding(padding: EdgeInsets.only(left: 4), child: Text('🏆', style: TextStyle(fontSize: 12))),
        ],
      ),
    );
  }
}
