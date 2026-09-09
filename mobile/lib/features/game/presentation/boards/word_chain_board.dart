import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Parsed word-chain view.
class _ChainView {
  _ChainView(Map<String, dynamic> b)
      : letter = b['letter'] as String?,
        used = _words(b['used']),
        taken = (b['taken'] as num?)?.toInt() ?? 0,
        totalTurns = (b['totalTurns'] as num?)?.toInt() ?? 20,
        history = _history(b['history']),
        lastWord = _last(b['lastWord']);

  final String? letter;
  final List<String> used;
  final int taken;
  final int totalTurns;
  final List<_ChainEntry> history;
  final _ChainEntry? lastWord;

  static List<String> _words(Object? raw) =>
      ((raw as List?) ?? const []).whereType<String>().toList();

  static List<_ChainEntry> _history(Object? raw) => ((raw as List?) ?? const [])
      .whereType<Map>()
      .map((m) => _ChainEntry(
            (m['seat'] as num?)?.toInt() ?? 0,
            (m['word'] as String?) ?? '',
            m['valid'] == true,
            (m['points'] as num?)?.toInt() ?? 0,
          ))
      .toList();

  static _ChainEntry? _last(Object? raw) {
    final m = raw as Map?;
    if (m == null) return null;
    return _ChainEntry(
      (m['seat'] as num?)?.toInt() ?? 0,
      (m['word'] as String?) ?? '',
      m['valid'] == true,
      (m['points'] as num?)?.toInt() ?? 0,
    );
  }
}

class _ChainEntry {
  const _ChainEntry(this.seat, this.word, this.valid, this.points);
  final int seat;
  final String word;
  final bool valid;
  final int points;
}

/// Word Chain, wave-4 3D board.
///
/// A big letter tile shows what the next word must start with, a trailing
/// ribbon lists the chain so far, and a text field takes your word. Valid
/// words flash green with their points; misses fade to grey.
class WordChainBoard extends StatefulWidget {
  const WordChainBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<WordChainBoard> createState() => _WordChainBoardState();
}

class _WordChainBoardState extends State<WordChainBoard> {
  String _skin = 'wood';
  final TextEditingController _controller = TextEditingController();

  _ChainView get _view => _ChainView(widget.session.board);

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_myTurn) return;
    final word = _controller.text.trim();
    if (word.isEmpty) return;
    GameFeedback.tap();
    _controller.clear();
    await widget.onAction('word', {'word': word});
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
          icon: Icons.link_rounded,
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
              _scoreRow(view),
              const SizedBox(height: 12),
              _letterTile(view, skin),
              const SizedBox(height: 10),
              _chainRibbon(view),
              const SizedBox(height: 12),
              _inputRow(view),
              const SizedBox(height: 8),
              Text(
                'Turn ${view.taken.clamp(0, view.totalTurns)} / ${view.totalTurns}',
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w700),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _scoreRow(_ChainView view) {
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

  Widget _letterTile(_ChainView view, BoardSkin skin) {
    final letter = view.letter;
    return Container(
      width: 92,
      height: 92,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color.lerp(skin.edge, Colors.white, 0.1)!,
            skin.edge,
            Color.lerp(skin.edge, Colors.black, 0.5)!,
          ],
        ),
        border: Border.all(color: AppColors.softCyan.withValues(alpha: 0.4), width: 1.6),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.45), blurRadius: 14, offset: const Offset(0, 6)),
        ],
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            letter ?? '★',
            style: TextStyle(
              color: letter != null ? Colors.white : const Color(0xFFD9A94A),
              fontSize: 40,
              fontWeight: FontWeight.w900,
              height: 1.0,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            letter != null ? 'STARTS WITH' : 'ANY WORD',
            style: const TextStyle(color: AppColors.textSecondary, fontSize: 8.5, fontWeight: FontWeight.w800, letterSpacing: 1),
          ),
        ],
      ),
    );
  }

  Widget _chainRibbon(_ChainView view) {
    final recent = view.history.length > 8 ? view.history.sublist(view.history.length - 8) : view.history;
    if (recent.isEmpty) {
      return const Text(
        'The chain is empty — open with any word',
        style: TextStyle(color: AppColors.textSecondary, fontSize: 12, fontStyle: FontStyle.italic),
      );
    }
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      alignment: WrapAlignment.center,
      children: [
        for (final entry in recent)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: entry.valid
                  ? const Color(0xFF2A5E46).withValues(alpha: 0.85)
                  : Colors.white.withValues(alpha: 0.05),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: entry.valid ? const Color(0xFF4ADE80).withValues(alpha: 0.5) : Colors.white.withValues(alpha: 0.1),
              ),
            ),
            child: Text(
              entry.valid ? '${entry.word} ${entry.points}' : entry.word,
              style: TextStyle(
                color: entry.valid ? Colors.white : AppColors.textSecondary,
                fontSize: 12,
                fontWeight: FontWeight.w800,
                decoration: entry.valid ? null : TextDecoration.lineThrough,
              ),
            ),
          ),
      ],
    );
  }

  Widget _inputRow(_ChainView view) {
    final enabled = _myTurn;
    return Row(
      children: [
        Expanded(
          child: TextField(
            controller: _controller,
            enabled: enabled,
            textInputAction: TextInputAction.send,
            onSubmitted: (_) => _submit(),
            maxLength: 10,
            autofillHints: const [AutofillHints.language],
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, letterSpacing: 1.2),
            decoration: InputDecoration(
              counterText: '',
              hintText: view.letter != null ? 'A word starting with ${view.letter}…' : 'Open the chain…',
              hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.3)),
              filled: true,
              fillColor: Colors.white.withValues(alpha: 0.06),
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: AppColors.softCyan.withValues(alpha: 0.25)),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: AppColors.softCyan),
              ),
              disabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.08)),
              ),
            ),
          ),
        ),
        const SizedBox(width: 8),
        ElevatedButton(
          onPressed: enabled ? _submit : null,
          style: ElevatedButton.styleFrom(
            backgroundColor: enabled ? AppColors.electricPurple : Colors.white.withValues(alpha: 0.08),
            foregroundColor: Colors.white,
            disabledForegroundColor: Colors.white38,
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
          child: const Icon(Icons.send_rounded, size: 20),
        ),
      ],
    );
  }

  String _statusText(_ChainView view) {
    if (!widget.session.isInProgress) {
      if (widget.session.winnerSeat == null) return 'Chain complete — a tie';
      return widget.session.winnerSeat == widget.mySeat ? 'You out-spelled them!' : 'Their vocabulary ran deeper…';
    }
    if (!_myTurn) return 'Waiting for their word…';
    final last = view.lastWord;
    if (last != null && !last.valid && last.seat == widget.mySeat) return 'That one missed — regroup!';
    return view.letter != null ? 'Your word must start with ${view.letter}' : 'Open the chain with any word';
  }

  String _seatLabel(int seat) {
    if (seat >= widget.session.seats.length) return 'Seat ${seat + 1}';
    return seat == widget.mySeat ? 'You' : widget.session.seats[seat].displayName;
  }
}
