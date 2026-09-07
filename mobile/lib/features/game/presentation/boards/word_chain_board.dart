import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/piece_3d.dart';
import '../../domain/entities/game_entities.dart';
import '../skins/skinned_pieces.dart';
import '../skins/table_skins.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Word Chain. The chain snakes across the felt as letter tiles; the big
/// glowing tile shows the letter your word must start with. Type a real
/// word, hit play, and it slides onto the chain. Passing costs a heart —
/// lose all three and you are out; last one standing wins.
class WordChainBoard extends StatefulWidget {
  const WordChainBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<WordChainBoard> createState() => _WordChainBoardState();
}

class _WordChainBoardState extends State<WordChainBoard> {
  final TextEditingController _controller = TextEditingController();
  final FocusNode _focus = FocusNode();
  final ScrollController _chainScroll = ScrollController();
  bool _busy = false;
  int _chainLength = 0;

  Map<String, dynamic> get b => widget.session.board;
  bool get _myTurn => widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  @override
  void initState() {
    super.initState();
    _controller.addListener(() => setState(() {}));
  }

  @override
  void didUpdateWidget(covariant WordChainBoard old) {
    super.didUpdateWidget(old);
    final chain = (b['chain'] as List?) ?? const [];
    if (chain.length != _chainLength) {
      _chainLength = chain.length;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_chainScroll.hasClients) {
          _chainScroll.animateTo(_chainScroll.position.maxScrollExtent, duration: const Duration(milliseconds: 350), curve: Curves.easeOut);
        }
      });
    }
    if (_myTurn && !old.session.isInProgress) _focus.requestFocus();
  }

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    _chainScroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final players = ((b['players'] as List?) ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    final chain = ((b['chain'] as List?) ?? const []).map((e) => e.toString()).toList();
    final required = ((b['requiredFirstLetter'] as String?) ?? '').toUpperCase();
    final lastWord = (b['lastWord'] as String?) ?? '';
    final playground = TableSkins.playgroundFor(widget.session, widget.mySeat);
    final current = widget.session.currentSeat;
    final typed = _controller.text.trim();
    final startsRight = required.isEmpty || (typed.isNotEmpty && typed[0].toUpperCase() == required);
    final canSubmit = _myTurn && !_busy && typed.length >= 2 && startsRight;

    String status;
    if (!widget.session.isInProgress) {
      status = 'Game over';
    } else if (_myTurn) {
      status = required.isEmpty ? 'Your turn — start the chain with any word' : 'Your turn — a word starting with "$required"';
    } else {
      final name = current >= 0 && current < widget.session.seats.length ? widget.session.seats[current].displayName : 'Someone';
      status = '$name is thinking of a word…';
    }

    return Column(
      children: [
        TurnIndicator(text: status, highlight: _myTurn, icon: Icons.abc_rounded),
        const SizedBox(height: 8),
        // Players with hearts.
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(
            children: [
              for (var i = 0; i < players.length && i < widget.session.seats.length; i++)
                Expanded(
                  child: _PlayerTile(
                    name: i == widget.mySeat ? 'You' : widget.session.seats[i].displayName,
                    lives: (players[i]['lives'] as num?)?.toInt() ?? 0,
                    alive: players[i]['alive'] != false,
                    active: widget.session.isInProgress && current == i,
                    winner: widget.session.winnerSeat == i,
                    skin: TableSkins.pieceSkin(widget.session.cosmeticsOf(i).piece),
                    seat: i,
                    palette: TableSkins.paletteFor(widget.session, i),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Playground(
          skin: playground,
          padding: const EdgeInsets.all(12),
          child: Column(
            children: [
              // The chain.
              SizedBox(
                height: 64,
                child: chain.isEmpty
                    ? Center(
                        child: Text('The chain starts here…', style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontWeight: FontWeight.w600)),
                      )
                    : ListView.builder(
                        controller: _chainScroll,
                        scrollDirection: Axis.horizontal,
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        itemCount: chain.length,
                        itemBuilder: (context, i) {
                          final word = chain[i];
                          final latest = i == chain.length - 1;
                          return Row(
                            children: [
                              _WordTiles(word: word, accent: playground.accent, glow: latest ? playground.glow : null, linkLast: latest),
                              if (!latest) Icon(Icons.chevron_right_rounded, color: Colors.white.withValues(alpha: 0.35), size: 18),
                            ],
                          );
                        },
                      ),
              ),
              const SizedBox(height: 14),
              // Required letter + typed preview.
              Row(
                children: [
                  _LetterTile(letter: required.isEmpty ? '?' : required, size: 64, accent: playground.accent, glow: playground.glow, big: true),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          required.isEmpty ? 'Any word to start' : 'Next word must start with',
                          style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 11, fontWeight: FontWeight.w600),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          lastWord.isEmpty ? '—' : 'after "${lastWord.toUpperCase()}"',
                          style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w800),
                        ),
                        const SizedBox(height: 6),
                        Text('${chain.length} word${chain.length == 1 ? '' : 's'} in the chain', style: TextStyle(color: Colors.white.withValues(alpha: 0.55), fontSize: 11)),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        // Input.
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Column(
            children: [
              AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                decoration: BoxDecoration(
                  color: AppColors.glassFill,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: !_myTurn ? AppColors.glassStroke : (typed.isEmpty ? playground.accent.withValues(alpha: 0.6) : (startsRight ? AppColors.success : AppColors.coral)),
                    width: _myTurn ? 1.6 : 1,
                  ),
                ),
                child: Row(
                  children: [
                    const SizedBox(width: 12),
                    if (required.isNotEmpty)
                      Text(required, style: TextStyle(color: startsRight || typed.isEmpty ? playground.accent : AppColors.coral, fontSize: 20, fontWeight: FontWeight.w900)),
                    Expanded(
                      child: TextField(
                        controller: _controller,
                        focusNode: _focus,
                        enabled: _myTurn && !_busy,
                        autocorrect: false,
                        textCapitalization: TextCapitalization.none,
                        textInputAction: TextInputAction.send,
                        onSubmitted: (_) => canSubmit ? _submit() : null,
                        style: const TextStyle(color: AppColors.textPrimary, fontSize: 18, fontWeight: FontWeight.w700, letterSpacing: 1.2),
                        decoration: InputDecoration(
                          hintText: _myTurn ? (required.isEmpty ? 'type any word' : 'type a word starting with $required') : 'wait for your turn…',
                          hintStyle: const TextStyle(color: AppColors.textMuted, fontSize: 14, letterSpacing: 0),
                          border: InputBorder.none,
                          contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 14),
                        ),
                      ),
                    ),
                    if (typed.isNotEmpty && !startsRight)
                      const Padding(
                        padding: EdgeInsets.only(right: 10),
                        child: Icon(Icons.error_outline_rounded, color: AppColors.coral, size: 18),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    flex: 3,
                    child: ActionButton(label: 'Play word', icon: Icons.send_rounded, onPressed: canSubmit ? _submit : null),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    flex: 2,
                    child: ActionButton(
                      label: 'Pass (−❤️)',
                      icon: Icons.heart_broken_rounded,
                      color: AppColors.surfaceElevated,
                      onPressed: _myTurn && !_busy ? _pass : null,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _submit() async {
    final word = _controller.text.trim().toLowerCase();
    if (word.isEmpty) return;
    setState(() => _busy = true);
    GameFeedback.move();
    await widget.onAction('word', {'word': word});
    _controller.clear();
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _pass() async {
    setState(() => _busy = true);
    GameFeedback.tap();
    await widget.onAction('pass', {});
    if (mounted) setState(() => _busy = false);
  }
}

class _PlayerTile extends StatelessWidget {
  const _PlayerTile({
    required this.name,
    required this.lives,
    required this.alive,
    required this.active,
    required this.winner,
    required this.skin,
    required this.seat,
    required this.palette,
  });
  final String name;
  final int lives;
  final bool alive;
  final bool active;
  final bool winner;
  final PieceSkin skin;
  final int seat;
  final PiecePalette palette;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      margin: const EdgeInsets.symmetric(horizontal: 3),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      decoration: BoxDecoration(
        color: active ? palette.base.withValues(alpha: 0.2) : AppColors.glassFill,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: active ? palette.light : AppColors.glassStroke, width: active ? 1.6 : 1),
        boxShadow: active ? [BoxShadow(color: palette.glow.withValues(alpha: 0.3), blurRadius: 12)] : null,
      ),
      child: Opacity(
        opacity: alive ? 1 : 0.45,
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SkinnedPiece(skin: skin, seat: seat, size: 16, dim: !alive),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: AppColors.textPrimary, fontSize: 12, fontWeight: FontWeight.w700, decoration: alive ? null : TextDecoration.lineThrough),
                  ),
                ),
                if (winner) const Text(' 🏆', style: TextStyle(fontSize: 12)),
              ],
            ),
            const SizedBox(height: 5),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var i = 0; i < 3; i++)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 1),
                    child: Icon(i < lives ? Icons.favorite_rounded : Icons.favorite_border_rounded, size: 14, color: i < lives ? AppColors.coral : AppColors.textMuted),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _WordTiles extends StatelessWidget {
  const _WordTiles({required this.word, required this.accent, required this.glow, required this.linkLast});
  final String word;
  final Color accent;
  final Color? glow;
  final bool linkLast;

  @override
  Widget build(BuildContext context) {
    final letters = word.toUpperCase().split('');
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < letters.length; i++)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 1),
            child: _LetterTile(
              letter: letters[i],
              size: 30,
              accent: accent,
              glow: glow,
              // The last letter of the latest word is the link to the next word.
              big: linkLast && i == letters.length - 1,
            ),
          ),
      ],
    );
  }
}

class _LetterTile extends StatelessWidget {
  const _LetterTile({required this.letter, required this.size, required this.accent, this.glow, this.big = false});
  final String letter;
  final double size;
  final Color accent;
  final Color? glow;
  final bool big;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size * 1.12,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(size * 0.2),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: big ? [Color.lerp(accent, Colors.white, 0.3)!, accent] : const [Color(0xFFFFF8E7), Color(0xFFE8DCC0)],
        ),
        border: Border.all(color: big ? Colors.white.withValues(alpha: 0.7) : const Color(0xFFB79E6E), width: big ? 1.5 : 1),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 4, offset: const Offset(0, 2)),
          if (glow != null) BoxShadow(color: glow!.withValues(alpha: big ? 0.6 : 0.3), blurRadius: big ? 14 : 8),
        ],
      ),
      child: Text(
        letter,
        style: TextStyle(color: big ? Colors.white : const Color(0xFF2A2340), fontSize: size * 0.55, fontWeight: FontWeight.w900, height: 1),
      ),
    );
  }
}
