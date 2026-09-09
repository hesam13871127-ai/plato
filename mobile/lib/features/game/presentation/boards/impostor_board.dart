import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Parsed impostor view — the server seals the location from the impostor.
class _ImpView {
  _ImpView(Map<String, dynamic> b)
      : phase = (b['phase'] as String?) ?? 'clue',
        category = (b['category'] as String?) ?? '',
        location = b['location'] as String? ?? '',
        round = (b['round'] as num?)?.toInt() ?? 1,
        clues = _clues(b['clues']),
        votes = _votes(b['votes']),
        pending = _nums(b['pending']),
        log = _log(b['log']);

  final String phase;
  final String category;
  final String location; // '?' for the impostor mid-game
  final int round;
  final List<_Clue> clues;
  final Map<int, int> votes;
  final List<int> pending;
  final List<String> log;

  static List<_Clue> _clues(Object? raw) => ((raw as List?) ?? const [])
      .whereType<Map>()
      .map((m) => _Clue((m['seat'] as num?)?.toInt() ?? 0, (m['word'] as String?) ?? ''))
      .toList();

  static Map<int, int> _votes(Object? raw) {
    final out = <int, int>{};
    (raw as Map?)?.forEach((k, v) {
      final key = int.tryParse('$k');
      final val = (v as num?)?.toInt();
      if (key != null && val != null) out[key] = val;
    });
    return out;
  }

  static List<int> _nums(Object? raw) =>
      ((raw as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();

  static List<String> _log(Object? raw) =>
      ((raw as List?) ?? const []).whereType<String>().toList();

  Map<int, int> get tally {
    final out = <int, int>{};
    for (final t in votes.values) {
      out[t] = (out[t] ?? 0) + 1;
    }
    return out;
  }
}

class _Clue {
  const _Clue(this.seat, this.word);
  final int seat;
  final String word;
}

/// Impostor, wave-5 board.
///
/// Your location card (or a big question mark if you are the impostor), the
/// clue ribbon in speaking order, vote buttons and — if you are caught —
/// the location grid for one desperate steal.
class ImpostorBoard extends StatefulWidget {
  const ImpostorBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<ImpostorBoard> createState() => _ImpostorBoardState();
}

class _ImpostorBoardState extends State<ImpostorBoard> {
  String _skin = 'wood';
  final TextEditingController _controller = TextEditingController();

  _ImpView get _view => _ImpView(widget.session.board);

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  bool get _iAmImpostor => _view.location == '?' && widget.session.isInProgress;

  static const _deck = [
    'airport', 'beach', 'hospital', 'school', 'restaurant', 'cinema', 'space station', 'zoo',
    'library', 'stadium', 'submarine', 'casino', 'bakery', 'fire station', 'theatre', 'farm',
  ];

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _act(String type, Map<String, dynamic> payload) async {
    GameFeedback.tap();
    await widget.onAction(type, payload);
  }

  Future<void> _sendClue() async {
    final word = _controller.text.trim();
    if (word.isEmpty) return;
    _controller.clear();
    await _act('clue', {'word': word});
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
          icon: _iAmImpostor ? Icons.help_rounded : Icons.place_rounded,
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
              _locationCard(view, skin),
              const SizedBox(height: 10),
              _castList(view),
              const SizedBox(height: 8),
              if (view.phase == 'clue' && _myTurn) _clueInput(),
              if (view.log.isNotEmpty) _storyRibbon(view),
            ],
          ),
        ),
      ],
    );
  }

  Widget _locationCard(_ImpView view, BoardSkin skin) {
    final hidden = _iAmImpostor;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color.lerp(skin.edge, Colors.white, 0.08)!,
            skin.edge,
            Color.lerp(skin.edge, Colors.black, 0.45)!,
          ],
        ),
        border: Border.all(
          color: hidden ? AppColors.danger.withValues(alpha: 0.6) : AppColors.softCyan.withValues(alpha: 0.4),
        ),
      ),
      child: Row(
        children: [
          Text(
            hidden ? '❓' : '📍',
            style: const TextStyle(fontSize: 30),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  hidden ? 'YOU ARE THE IMPOSTOR' : 'The secret place',
                  style: TextStyle(
                    color: hidden ? AppColors.danger : Colors.white,
                    fontSize: 13,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.4,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  hidden
                      ? 'Category: ${view.category} — blend in and guess if caught!'
                      : view.location,
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w700),
                ),
              ],
            ),
          ),
          if (view.round > 1)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                'R${view.round}',
                style: const TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w800),
              ),
            ),
        ],
      ),
    );
  }

  Widget _castList(_ImpView view) {
    return Column(
      children: [
        for (var i = 0; i < widget.session.seats.length; i++) _castRow(view, i),
      ],
    );
  }

  Widget _castRow(_ImpView view, int i) {
    final votesFor = view.tally[i] ?? 0;
    final canVote = _myTurn && view.phase == 'vote' && view.pending.contains(widget.mySeat) && i != widget.mySeat;

    Widget? trailing;
    final clue = view.clues.where((c) => c.seat == i).toList();
    if (clue.isNotEmpty) {
      trailing = Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: AppColors.electricPurple.withValues(alpha: 0.25),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(
          '“${clue.last.word}”',
          style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800, fontStyle: FontStyle.italic),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: i == widget.mySeat
                    ? AppColors.electricPurple.withValues(alpha: 0.22)
                    : Colors.white.withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: widget.session.currentSeat == i && widget.session.isInProgress
                      ? AppColors.softCyan
                      : Colors.white.withValues(alpha: 0.1),
                ),
              ),
              child: Row(
                children: [
                  Text(
                    _seatLabel(i),
                    style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w800),
                  ),
                  const Spacer(),
                  if (trailing != null) trailing!,
                  if (votesFor > 0) ...[
                    const SizedBox(width: 6),
                    Text(
                      '$votesFor 🗳️',
                      style: const TextStyle(color: Color(0xFFD9A94A), fontSize: 11, fontWeight: FontWeight.w900),
                    ),
                  ],
                ],
              ),
            ),
          ),
          if (canVote)
            Padding(
              padding: const EdgeInsets.only(left: 8),
              child: ElevatedButton(
                onPressed: () => _act('vote', {'target': i}),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.electricPurple,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                child: const Text('EJECT', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900)),
              ),
            ),
        ],
      ),
    );
  }

  Widget _clueInput() {
    // Caught impostor: the steal grid.
    if (_view.phase == 'guess') {
      return Column(
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              'You are caught! Guess the place to steal the win:',
              style: const TextStyle(color: AppColors.danger, fontSize: 12.5, fontWeight: FontWeight.w900),
            ),
          ),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            alignment: WrapAlignment.center,
            children: [
              for (final loc in _deck)
                ElevatedButton(
                  onPressed: () => _act('guess', {'location': loc}),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white.withValues(alpha: 0.08),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    side: BorderSide(color: AppColors.danger.withValues(alpha: 0.3)),
                  ),
                  child: Text(loc, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
                ),
            ],
          ),
        ],
      );
    }
    return Column(
      children: [
        Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _controller,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _sendClue(),
                  maxLength: 16,
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, letterSpacing: 1),
                  decoration: InputDecoration(
                    counterText: '',
                    hintText: 'Your one-word clue…',
                    hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.3)),
                    filled: true,
                    fillColor: Colors.white.withValues(alpha: 0.06),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(color: AppColors.softCyan.withValues(alpha: 0.25)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: AppColors.softCyan),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              ElevatedButton(
                onPressed: _sendClue,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.electricPurple,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 13),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: const Icon(Icons.send_rounded, size: 19),
              ),
            ],
          ),
      ],
    );
  }

  Widget _storyRibbon(_ImpView view) {
    final recent = view.log.length > 3 ? view.log.sublist(view.log.length - 3) : view.log;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final line in recent)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 1.5),
              child: Text(
                line,
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, fontStyle: FontStyle.italic),
              ),
            ),
        ],
      ),
    );
  }

  String _statusText(_ImpView view) {
    if (!widget.session.isInProgress) {
      final winners = widget.session.winnerSeats ?? const <int>[];
      if (winners.contains(widget.mySeat)) {
        return _iAmImpostor || winners.length == 1 ? 'You fooled them all!' : 'Crew wins — sharp eyes!';
      }
      return 'The table read you wrong…';
    }
    if (!_myTurn) {
      return view.phase == 'clue' ? 'Listening for clues…' : 'The table is voting…';
    }
    if (view.phase == 'clue') return 'Your clue — one word';
    if (view.phase == 'vote') return 'Your vote — eject the impostor';
    return 'Guess the place to steal the win!';
  }

  String _seatLabel(int seat) {
    if (seat >= widget.session.seats.length) return 'Seat ${seat + 1}';
    return seat == widget.mySeat ? 'You' : widget.session.seats[seat].displayName;
  }
}
