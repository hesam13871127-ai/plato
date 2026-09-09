import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Parsed charades view — the answer key stays server-side.
class _CharadesView {
  _CharadesView(Map<String, dynamic> b)
      : round = (b['round'] as num?)?.toInt() ?? 0,
        eliminated = _nums(b['eliminated']),
        active = _active(b['active']),
        lastResult = _result(b['lastResult']);

  final int round;
  final List<int> eliminated;
  final _Riddle? active;
  final _Result? lastResult;

  static List<int> _nums(Object? raw) =>
      ((raw as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();

  static _Riddle? _active(Object? raw) {
    final m = raw as Map?;
    if (m == null) return null;
    return _Riddle(
      (m['category'] as String?) ?? '',
      (m['emojis'] as String?) ?? '',
      ((m['options'] as List?) ?? const []).whereType<String>().toList(),
    );
  }

  static _Result? _result(Object? raw) {
    final m = raw as Map?;
    if (m == null) return null;
    return _Result(
      (m['seat'] as num?)?.toInt() ?? 0,
      (m['choice'] as num?)?.toInt() ?? 0,
      (m['correctChoice'] as num?)?.toInt() ?? 0,
      m['correct'] == true,
      m['roundEnded'] == true,
    );
  }
}

class _Riddle {
  const _Riddle(this.category, this.emojis, this.options);
  final String category;
  final String emojis;
  final List<String> options;
}

class _Result {
  const _Result(this.seat, this.choice, this.correctChoice, this.correct, this.roundEnded);
  final int seat;
  final int choice;
  final int correctChoice;
  final bool correct;
  final bool roundEnded;
}

/// Emoji Charades, wave-4 3D board.
///
/// A giant emoji riddle in the spotlight and four phrase options. Wrong
/// picks get knocked out for the whole table — strike-through and grey —
/// narrowing the stage for whoever guesses next.
class EmojiCharadesBoard extends StatefulWidget {
  const EmojiCharadesBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<EmojiCharadesBoard> createState() => _EmojiCharadesBoardState();
}

class _EmojiCharadesBoardState extends State<EmojiCharadesBoard> {
  String _skin = 'wood';

  _CharadesView get _view => _CharadesView(widget.session.board);

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  Future<void> _guess(int choice) async {
    if (!_myTurn || _view.active == null) return;
    GameFeedback.tap();
    await widget.onAction('guess', {'choice': choice});
  }

  @override
  Widget build(BuildContext context) {
    final view = _view;
    final skin = BoardSkin.byId(_skin);
    const totalRounds = 8;

    return Column(
      children: [
        TurnIndicator(
          text: _statusText(view),
          highlight: _myTurn,
          icon: Icons.theater_comedy_rounded,
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
              const SizedBox(height: 12),
              if (view.active != null) _riddleCard(view, skin) else _recapCard(view),
              const SizedBox(height: 8),
              Text(
                'Round ${(view.round + 1).clamp(1, totalRounds)} / $totalRounds',
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w700),
              ),
            ],
          ),
        ),
      ],
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

  Widget _riddleCard(_CharadesView view, BoardSkin skin) {
    final riddle = view.active!;
    final last = view.lastResult;
    return Container(
      padding: const EdgeInsets.all(16),
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
        border: Border.all(color: Colors.white.withValues(alpha: 0.14)),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.45), blurRadius: 14, offset: const Offset(0, 6)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.electricPurple.withValues(alpha: 0.35),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppColors.softCyan.withValues(alpha: 0.4)),
                ),
                child: Text(
                  riddle.category.toUpperCase(),
                  style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1.1),
                ),
              ),
              Icon(
                _myTurn ? Icons.psychology_rounded : Icons.hourglass_top_rounded,
                color: _myTurn ? AppColors.softCyan : AppColors.textSecondary,
                size: 20,
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            riddle.emojis,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 52, height: 1.1),
          ),
          const SizedBox(height: 6),
          Text(
            'What does it say?',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white.withValues(alpha: 0.55), fontSize: 11.5, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 14),
          for (var i = 0; i < riddle.options.length; i++)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: _optionButton(riddle.options[i], i, view),
            ),
          if (last != null && last.roundEnded) ...[
            const SizedBox(height: 6),
            Text(
              last.correct
                  ? 'Solved! The answer was: ${_letter(last.correctChoice)}'
                  : 'The round died — the answer was: ${_letter(last.correctChoice)}',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: last.correct ? const Color(0xFF4ADE80) : AppColors.danger,
                fontSize: 11,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _letter(int idx) {
    const letters = ['A', 'B', 'C', 'D'];
    return letters[idx.clamp(0, 3)];
  }

  Widget _optionButton(String label, int idx, _CharadesView view) {
    final dead = view.eliminated.contains(idx);
    final enabled = _myTurn && !dead && view.active != null;
    const letters = ['A', 'B', 'C', 'D'];
    return ElevatedButton(
      onPressed: enabled ? () => _guess(idx) : null,
      style: ElevatedButton.styleFrom(
        backgroundColor: dead ? Colors.white.withValues(alpha: 0.03) : Colors.white.withValues(alpha: 0.07),
        disabledBackgroundColor: Colors.white.withValues(alpha: 0.04),
        foregroundColor: dead ? Colors.white24 : Colors.white,
        disabledForegroundColor: dead ? Colors.white24 : Colors.white38,
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        side: BorderSide(
          color: dead ? Colors.white.withValues(alpha: 0.06) : AppColors.softCyan.withValues(alpha: 0.25),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 24,
            height: 24,
            decoration: BoxDecoration(
              color: dead ? Colors.white.withValues(alpha: 0.06) : AppColors.electricPurple.withValues(alpha: 0.4),
              borderRadius: BorderRadius.circular(7),
            ),
            child: Center(
              child: Text(
                letters[idx.clamp(0, 3)],
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 13.5,
                fontWeight: FontWeight.w700,
                decoration: dead ? TextDecoration.lineThrough : null,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _recapCard(_CharadesView view) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        color: Colors.white.withValues(alpha: 0.05),
        border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
      ),
      child: Column(
        children: [
          const Icon(Icons.theater_comedy_rounded, color: Color(0xFFD9A94A), size: 34),
          const SizedBox(height: 8),
          Text(
            widget.session.winnerSeat == null
                ? 'Eight riddles, one deadlock'
                : widget.session.winnerSeat == widget.mySeat
                    ? 'You read the emojis best!'
                    : 'They saw through the emojis…',
            style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 6),
          Text(
            'Final scores: ${widget.session.scores.join(" — ")}',
            style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
          ),
        ],
      ),
    );
  }

  String _statusText(_CharadesView view) {
    if (!widget.session.isInProgress) return 'The riddle deck is finished';
    if (!_myTurn) return 'Waiting for the other guesser…';
    final deadCount = view.eliminated.length;
    if (deadCount > 0) return 'Your guess — $deadCount option${deadCount > 1 ? 's are' : ' is'} already out';
    return 'Your guess — read the emoji';
  }

  String _seatLabel(int seat) {
    if (seat >= widget.session.seats.length) return 'Seat ${seat + 1}';
    return seat == widget.mySeat ? 'You' : widget.session.seats[seat].displayName;
  }
}
