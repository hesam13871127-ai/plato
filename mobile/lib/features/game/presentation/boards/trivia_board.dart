import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Parsed trivia view — the engine hides the answer key server-side.
class _TriviaView {
  _TriviaView(Map<String, dynamic> b)
      : asked = (b['asked'] as num?)?.toInt() ?? 0,
        active = _active(b['active']),
        lastResult = _result(b['lastResult']),
        history = _history(b['history']);

  final int asked;
  final _ActiveQuestion? active;
  final _Result? lastResult;
  final List<_HistoryEntry> history;

  static _ActiveQuestion? _active(Object? raw) {
    final m = raw as Map?;
    if (m == null) return null;
    return _ActiveQuestion(
      (m['category'] as String?) ?? '',
      (m['q'] as String?) ?? '',
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
    );
  }

  static List<_HistoryEntry> _history(Object? raw) => ((raw as List?) ?? const [])
      .whereType<Map>()
      .map((m) => _HistoryEntry(
            (m['seat'] as num?)?.toInt() ?? 0,
            m['correct'] == true,
          ))
      .toList();

  int get roundsPlayed => asked;
}

class _ActiveQuestion {
  const _ActiveQuestion(this.category, this.q, this.options);
  final String category;
  final String q;
  final List<String> options;
}

class _Result {
  const _Result(this.seat, this.choice, this.correctChoice, this.correct);
  final int seat;
  final int choice;
  final int correctChoice;
  final bool correct;
}

class _HistoryEntry {
  const _HistoryEntry(this.seat, this.correct);
  final int seat;
  final bool correct;
}

/// Trivia, wave-4 3D board.
///
/// A quiz-show card: category ribbon, the burning question and four chunky
/// answer buttons. The previous answer flashes green or red before the next
/// player's card slides in. No board — just you against the envelope.
class TriviaBoard extends StatefulWidget {
  const TriviaBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<TriviaBoard> createState() => _TriviaBoardState();
}

class _TriviaBoardState extends State<TriviaBoard> {
  String _skin = 'wood';

  _TriviaView get _view => _TriviaView(widget.session.board);

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  Future<void> _answer(int choice) async {
    if (!_myTurn || _view.active == null) return;
    GameFeedback.tap();
    await widget.onAction('answer', {'choice': choice});
  }

  @override
  Widget build(BuildContext context) {
    final view = _view;
    final skin = BoardSkin.byId(_skin);
    final perPlayerRounds = 7;
    final totalRounds = widget.session.seats.length * perPlayerRounds;

    return Column(
      children: [
        TurnIndicator(
          text: _statusText(view),
          highlight: _myTurn,
          icon: Icons.quiz_rounded,
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
              if (view.active != null) ...[
                _questionCard(view, skin),
              ] else
                _recapCard(view),
              const SizedBox(height: 8),
              Text(
                'Round ${view.roundsPlayed.clamp(0, totalRounds)} / $totalRounds',
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w700),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _scoreRow(_TriviaView view) {
    final mine = <int>[];
    final theirs = <int>[];
    for (var seat = 0; seat < widget.session.seats.length; seat++) {
      (seat == widget.mySeat ? mine : theirs).add(seat);
    }
    Widget chip(int seat) {
      final isTurn = widget.session.currentSeat == seat && widget.session.isInProgress;
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: isTurn ? AppColors.electricPurple.withValues(alpha: 0.3) : Colors.white.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: isTurn ? AppColors.softCyan : Colors.white.withValues(alpha: 0.12)),
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
      );
    }

    return Wrap(
      spacing: 8,
      runSpacing: 6,
      alignment: WrapAlignment.center,
      children: [
        for (final seat in [...mine, ...theirs]) chip(seat),
      ],
    );
  }

  Widget _questionCard(_TriviaView view, BoardSkin skin) {
    final q = view.active!;
    final last = view.lastResult;
    final revealLast = last != null && !widget.session.isInProgress ? false : (last != null && last.seat == (widget.session.currentSeat == -1 ? -2 : (widget.session.currentSeat - 1 + widget.session.seats.length) % widget.session.seats.length));

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
                  q.category.toUpperCase(),
                  style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1.1),
                ),
              ),
              Icon(
                _myTurn ? Icons.help_rounded : Icons.hourglass_top_rounded,
                color: _myTurn ? AppColors.softCyan : AppColors.textSecondary,
                size: 20,
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            q.q,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white, fontSize: 16.5, fontWeight: FontWeight.w800, height: 1.35),
          ),
          const SizedBox(height: 14),
          for (var i = 0; i < q.options.length; i++)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: _answerButton(q.options[i], i, view),
            ),
          if (revealLast && last != null) ...[
            const SizedBox(height: 6),
            Text(
              last.correct ? 'Previous: correct!' : 'Previous: the answer was ${_labelFor(view, last.correctChoice)}',
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

  String _labelFor(_TriviaView view, int idx) {
    const letters = ['A', 'B', 'C', 'D'];
    return letters[idx.clamp(0, 3)];
  }

  Widget _answerButton(String label, int idx, _TriviaView view) {
    final enabled = _myTurn && view.active != null;
    final letters = ['A', 'B', 'C', 'D'];
    return ElevatedButton(
      onPressed: enabled ? () => _answer(idx) : null,
      style: ElevatedButton.styleFrom(
        backgroundColor: Colors.white.withValues(alpha: 0.07),
        disabledBackgroundColor: Colors.white.withValues(alpha: 0.04),
        foregroundColor: Colors.white,
        disabledForegroundColor: Colors.white38,
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        side: BorderSide(color: enabled ? AppColors.softCyan.withValues(alpha: 0.25) : Colors.white.withValues(alpha: 0.08)),
      ),
      child: Row(
        children: [
          Container(
            width: 24,
            height: 24,
            decoration: BoxDecoration(
              color: AppColors.electricPurple.withValues(alpha: 0.4),
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
              style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }

  Widget _recapCard(_TriviaView view) {
    final total = view.history.length;
    final mine = view.history.where((h) => h.seat == widget.mySeat).length;
    final mineCorrect = view.history.where((h) => h.seat == widget.mySeat && h.correct).length;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        color: Colors.white.withValues(alpha: 0.05),
        border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
      ),
      child: Column(
        children: [
          const Icon(Icons.emoji_events_rounded, color: Color(0xFFD9A94A), size: 34),
          const SizedBox(height: 8),
          Text(
            widget.session.winnerSeat == null
                ? 'A draw — brilliant minds alike'
                : widget.session.winnerSeat == widget.mySeat
                    ? 'Quiz champion!'
                    : 'Out-quizzed this time…',
            style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 6),
          Text(
            'You answered $mineCorrect of your $mine questions right ($total asked in total).',
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
          ),
        ],
      ),
    );
  }

  String _statusText(_TriviaView view) {
    if (!widget.session.isInProgress) return 'The deck is finished';
    if (!_myTurn) return 'Waiting for the other quizzer…';
    return view.active != null ? 'Your question — pick wisely' : 'Dealing…';
  }

  String _seatLabel(int seat) {
    if (seat >= widget.session.seats.length) return 'Seat ${seat + 1}';
    return seat == widget.mySeat ? 'You' : widget.session.seats[seat].displayName;
  }
}
