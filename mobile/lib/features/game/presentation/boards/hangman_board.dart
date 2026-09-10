import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Parsed hangman view — the secret itself never leaves the server.
class _HmView {
  _HmView(Map<String, dynamic> b)
      : round = (b['round'] as num?)?.toInt() ?? 1,
        masked = _letters(b['masked']),
        wrong = _letters(b['wrong']),
        revealedWord = (b['revealedWord'] as String?) ?? '',
        log = _log(b['log']);

  final int round;
  final List<String> masked;
  final List<String> wrong;
  final String revealedWord;
  final List<String> log;

  static List<String> _letters(Object? raw) =>
      ((raw as List?) ?? const []).whereType<String>().toList();

  static List<String> _log(Object? raw) =>
      ((raw as List?) ?? const []).whereType<String>().toList();

  Set<String> get taken => {...wrong, ...masked.where((c) => c != '_')};
}

/// Hangman, wave-6 board.
///
/// The sealed word as empty slots, the figure on the gallows one stroke per
/// miss, and an A–Z keypad. Hits score, misses draw.
class HangmanBoard extends StatefulWidget {
  const HangmanBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<HangmanBoard> createState() => _HangmanBoardState();
}

class _HangmanBoardState extends State<HangmanBoard> {
  String _skin = 'wood';

  _HmView get _view => _HmView(widget.session.board);

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  Future<void> _guess(String letter) async {
    GameFeedback.tap();
    await widget.onAction('guess', {'letter': letter});
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
          icon: Icons.spellcheck_rounded,
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
              const SizedBox(height: 10),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(width: 110, height: 130, child: CustomPaint(painter: _GallowsPainter(wrong: view.wrong.length))),
                  const SizedBox(width: 8),
                  Expanded(child: _wordSlots(view)),
                ],
              ),
              const SizedBox(height: 8),
              _wrongTray(view),
              if (view.revealedWord.isNotEmpty) _revealBanner(view),
              const SizedBox(height: 10),
              _keypad(view),
              if (view.log.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    view.log.last,
                    style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, fontStyle: FontStyle.italic),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _wordSlots(_HmView view) {
    return Wrap(
      spacing: 6,
      runSpacing: 8,
      children: [
        for (final slot in view.masked)
          Container(
            width: 34,
            height: 44,
            decoration: BoxDecoration(
              color: slot == '_'
                  ? Colors.white.withValues(alpha: 0.05)
                  : AppColors.softCyan.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: slot == '_' ? Colors.white.withValues(alpha: 0.14) : AppColors.softCyan,
              ),
            ),
            alignment: Alignment.center,
            child: Text(
              slot == '_' ? '' : slot.toUpperCase(),
              style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w900),
            ),
          ),
      ],
    );
  }

  Widget _wrongTray(_HmView view) {
    if (view.wrong.isEmpty) return const SizedBox.shrink();
    return Wrap(
      spacing: 6,
      runSpacing: 4,
      children: [
        for (final letter in view.wrong)
          Container(
            width: 26,
            height: 26,
            decoration: BoxDecoration(
              color: AppColors.danger.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: AppColors.danger.withValues(alpha: 0.4)),
            ),
            alignment: Alignment.center,
            child: Text(
              letter.toUpperCase(),
              style: const TextStyle(color: AppColors.danger, fontSize: 12, fontWeight: FontWeight.w900),
            ),
          ),
      ],
    );
  }

  Widget _revealBanner(_HmView view) {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: AppColors.electricPurple.withValues(alpha: 0.18),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppColors.electricPurple.withValues(alpha: 0.5)),
        ),
        child: Text(
          'The word was “${view.revealedWord.toUpperCase()}”',
          textAlign: TextAlign.center,
          style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w800, letterSpacing: 1),
        ),
      ),
    );
  }

  Widget _keypad(_HmView view) {
    final taken = view.taken;
    return Column(
      children: [
        for (final row in [
          ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
          ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
          ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
        ])
          Padding(
            padding: const EdgeInsets.only(bottom: 5),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (final letter in row)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 2),
                    child: _key(letter, taken.contains(letter)),
                  ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _key(String letter, bool taken) {
    final enabled = _myTurn && !taken;
    return GestureDetector(
      onTap: enabled ? () => _guess(letter) : null,
      child: Container(
        width: 28,
        height: 32,
        decoration: BoxDecoration(
          color: taken
              ? Colors.white.withValues(alpha: 0.04)
              : enabled
                  ? AppColors.electricPurple.withValues(alpha: 0.35)
                  : Colors.white.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(7),
          border: Border.all(
            color: enabled ? AppColors.softCyan.withValues(alpha: 0.6) : Colors.white.withValues(alpha: 0.1),
          ),
        ),
        alignment: Alignment.center,
        child: Text(
          letter.toUpperCase(),
          style: TextStyle(
            color: enabled ? Colors.white : Colors.white24,
            fontSize: 12,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }

  Widget _scoreRow(_HmView view) {
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
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text(
            'Word ${view.round}/3 · ${6 - view.wrong.length} lives',
            style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w800),
          ),
        ),
      ],
    );
  }

  String _statusText(_HmView view) {
    if (!widget.session.isInProgress) {
      final winners = widget.session.winnerSeats ?? const <int>[];
      final won = widget.session.winnerSeat == widget.mySeat || winners.contains(widget.mySeat);
      if (winners.length > 1) return 'Level pegging — shared win';
      return won ? 'Word wizard — you win!' : 'Out-spelled this time…';
    }
    if (!_myTurn) return 'Their guess is coming…';
    return 'Pick a letter — hits score 10 each';
  }

  String _seatLabel(int seat) {
    if (seat >= widget.session.seats.length) return 'Seat ${seat + 1}';
    return seat == widget.mySeat ? 'You' : widget.session.seats[seat].displayName;
  }
}

// ── the gallows ─────────────────────────────────────────────────────────────

class _GallowsPainter extends CustomPainter {
  _GallowsPainter({required this.wrong});

  final int wrong;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final wood = Paint()
      ..color = const Color(0xFFA97C50)
      ..strokeWidth = 6
      ..strokeCap = StrokeCap.round;
    // Frame: base, pole, beam, brace.
    canvas.drawLine(Offset(w * 0.06, h * 0.95), Offset(w * 0.94, h * 0.95), wood);
    canvas.drawLine(Offset(w * 0.18, h * 0.95), Offset(w * 0.18, h * 0.06), wood);
    canvas.drawLine(Offset(w * 0.16, h * 0.06), Offset(w * 0.72, h * 0.06), wood);
    canvas.drawLine(Offset(w * 0.18, h * 0.2), Offset(w * 0.32, h * 0.06), wood);

    final rope = Paint()
      ..color = const Color(0xFFD9A94A)
      ..strokeWidth = 3;
    canvas.drawLine(Offset(w * 0.72, h * 0.06), Offset(w * 0.72, h * 0.18), rope);

    final body = Paint()
      ..color = AppColors.danger
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round;
    final cx = w * 0.72;
    if (wrong >= 1) {
      canvas.drawCircle(Offset(cx, h * 0.24), w * 0.08, body); // head
    }
    if (wrong >= 2) {
      canvas.drawLine(Offset(cx, h * 0.32), Offset(cx, h * 0.56), body); // body
    }
    if (wrong >= 3) {
      canvas.drawLine(Offset(cx, h * 0.36), Offset(cx - w * 0.12, h * 0.46), body); // left arm
    }
    if (wrong >= 4) {
      canvas.drawLine(Offset(cx, h * 0.36), Offset(cx + w * 0.12, h * 0.46), body); // right arm
    }
    if (wrong >= 5) {
      canvas.drawLine(Offset(cx, h * 0.56), Offset(cx - w * 0.10, h * 0.72), body); // left leg
    }
    if (wrong >= 6) {
      canvas.drawLine(Offset(cx, h * 0.56), Offset(cx + w * 0.10, h * 0.72), body); // right leg
    }
  }

  @override
  bool shouldRepaint(covariant _GallowsPainter old) => old.wrong != wrong;
}
