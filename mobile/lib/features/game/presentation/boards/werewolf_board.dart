import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Parsed werewolf view — roles stay sealed server-side.
class _WwView {
  _WwView(Map<String, dynamic> b)
      : players = _players(b['players']),
        phase = (b['phase'] as String?) ?? 'night_kill',
        day = (b['day'] as num?)?.toInt() ?? 1,
        killTarget = b['killTarget'] as num?,
        seerNotes = _notes(b['seerNotes']),
        votes = _votes(b['votes']),
        log = _log(b['log']);

  final List<_WwPlayer> players;
  final String phase;
  final int day;
  final int? killTarget;
  final List<_SeerNote> seerNotes;
  final Map<int, int> votes;
  final List<String> log;

  static List<_WwPlayer> _players(Object? raw) => ((raw as List?) ?? const [])
      .whereType<Map>()
      .map((m) => _WwPlayer(
            (m['role'] as String?) ?? 'hidden',
            m['alive'] == true,
          ))
      .toList();

  static List<_SeerNote> _notes(Object? raw) => ((raw as List?) ?? const [])
      .whereType<Map>()
      .map((m) => _SeerNote(
            (m['night'] as num?)?.toInt() ?? 0,
            (m['seat'] as num?)?.toInt() ?? 0,
            m['isWolf'] == true,
          ))
      .toList();

  static Map<int, int> _votes(Object? raw) {
    final out = <int, int>{};
    final m = raw as Map?;
    m?.forEach((k, v) {
      final key = int.tryParse('$k');
      final val = (v as num?)?.toInt();
      if (key != null && val != null) out[key] = val;
    });
    return out;
  }

  static List<String> _log(Object? raw) =>
      ((raw as List?) ?? const []).whereType<String>().toList();

  bool get isNight => phase == 'night_kill' || phase == 'night_seer';

  Map<int, int> get tally {
    final out = <int, int>{};
    for (final t in votes.values) {
      out[t] = (out[t] ?? 0) + 1;
    }
    return out;
  }
}

class _WwPlayer {
  const _WwPlayer(this.role, this.alive);
  final String role; // 'werewolf' | 'villager' | 'seer' | 'hidden'
  final bool alive;
}

class _SeerNote {
  const _SeerNote(this.night, this.seat, this.isWolf);
  final int night;
  final int seat;
  final bool isWolf;
}

/// Werewolf, wave-5 board.
///
/// A village-square cast list: alive players on the podium, the dead crossed
/// out below. Night shows your secret card (wolf or seer) and a target
/// picker; day runs the lynch vote with a live tally. The story ribbon
/// narrates every dawn.
class WerewolfBoard extends StatefulWidget {
  const WerewolfBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<WerewolfBoard> createState() => _WerewolfBoardState();
}

class _WerewolfBoardState extends State<WerewolfBoard> {
  String _skin = 'wood';

  _WwView get _view => _WwView(widget.session.board);

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  _WwPlayer? get _me =>
      widget.mySeat < _view.players.length ? _view.players[widget.mySeat] : null;

  Future<void> _act(String type, int target) async {
    GameFeedback.tap();
    await widget.onAction(type, {'target': target});
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
          icon: view.isNight ? Icons.dark_mode_rounded : Icons.wb_sunny_rounded,
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
              _roleCard(view, skin),
              const SizedBox(height: 10),
              _castList(view),
              const SizedBox(height: 10),
              if (view.log.isNotEmpty) _storyRibbon(view),
            ],
          ),
        ),
      ],
    );
  }

  Widget _roleCard(_WwView view, BoardSkin skin) {
    final me = _me;
    final role = me?.role ?? 'hidden';
    final revealed = !widget.session.isInProgress;
    final label = revealed
        ? view.players[widget.mySeat].role
        : role;
    final isWolf = label == 'werewolf';
    final isSeer = label == 'seer';
    final wolfMates = <int>[];
    if (isWolf && widget.session.isInProgress) {
      for (var i = 0; i < view.players.length; i++) {
        if (i != widget.mySeat && view.players[i].role == 'werewolf') wolfMates.add(i);
      }
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
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
          color: isWolf
              ? AppColors.danger.withValues(alpha: 0.6)
              : isSeer
                  ? const Color(0xFFA78BFA).withValues(alpha: 0.6)
                  : Colors.white.withValues(alpha: 0.14),
        ),
      ),
      child: Row(
        children: [
          Text(
            isWolf ? '🐺' : isSeer ? '🔮' : '🌾',
            style: const TextStyle(fontSize: 30),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isWolf ? 'You are a WEREWOLF' : isSeer ? 'You are the SEER' : 'You are a VILLAGER',
                  style: TextStyle(
                    color: isWolf ? AppColors.danger : isSeer ? const Color(0xFFA78BFA) : Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.4,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  isWolf
                      ? wolfMates.isEmpty
                          ? 'Hunt alone. Packmates: none'
                          : 'Packmates: ${wolfMates.map((i) => 'Seat ${i + 1}').join(', ')}'
                      : isSeer
                          ? view.seerNotes.isEmpty
                              ? 'You have peeked at nobody yet'
                              : 'Ledger: ${view.seerNotes.map((n) => 'Seat ${n.seat + 1} ${n.isWolf ? '🐺' : '🌾'}').join(' · ')}'
                          : 'Survive the nights. Trust nobody',
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 11),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _castList(_WwView view) {
    return Column(
      children: [
        for (var i = 0; i < view.players.length; i++) _castRow(view, i),
      ],
    );
  }

  Widget _castRow(_WwView view, int i) {
    final p = view.players[i];
    final isMe = i == widget.mySeat;
    final votesFor = view.tally[i] ?? 0;

    // Can I act on this seat right now?
    var canAct = false;
    var actType = '';
    if (_myTurn && p.alive && i != widget.mySeat) {
      if (view.phase == 'night_kill' && _me?.role == 'werewolf') {
        canAct = true;
        actType = 'kill';
      } else if (view.phase == 'night_seer' && _me?.role == 'seer') {
        canAct = true;
        actType = 'check';
      } else if (view.phase == 'day_vote') {
        canAct = true;
        actType = 'vote';
      }
    }
    final alreadyVoted = view.votes.containsKey(widget.mySeat);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: isMe
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
                    style: TextStyle(
                      color: p.alive ? Colors.white : AppColors.textSecondary,
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      decoration: p.alive ? null : TextDecoration.lineThrough,
                    ),
                  ),
                  const SizedBox(width: 6),
                  if (!p.alive)
                    const Icon(Icons.skull_rounded, size: 13, color: AppColors.textSecondary),
                  const Spacer(),
                  if (votesFor > 0)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: Text(
                        '$votesFor 🗳️',
                        style: const TextStyle(color: Color(0xFFD9A94A), fontSize: 11, fontWeight: FontWeight.w900),
                      ),
                    ),
                  if (view.votes[i] != null)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: Text(
                        '→ ${view.votes[i]! + 1}',
                        style: const TextStyle(color: AppColors.textSecondary, fontSize: 10),
                      ),
                    ),
                ],
              ),
            ),
          ),
          if (canAct && !(actType == 'vote' && alreadyVoted))
            Padding(
              padding: const EdgeInsets.only(left: 8),
              child: ElevatedButton(
                onPressed: () => _act(actType, i),
                style: ElevatedButton.styleFrom(
                  backgroundColor: actType == 'kill'
                      ? AppColors.danger
                      : actType == 'check'
                          ? const Color(0xFFA78BFA)
                          : AppColors.electricPurple,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                child: Text(
                  actType == 'kill' ? 'HUNT' : actType == 'check' ? 'PEEK' : 'VOTE',
                  style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _storyRibbon(_WwView view) {
    final recent = view.log.length > 4 ? view.log.sublist(view.log.length - 4) : view.log;
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

  String _statusText(_WwView view) {
    if (!widget.session.isInProgress) {
      final wolvesWon = (widget.session.winnerSeats ?? []).isNotEmpty &&
          _view.players[(widget.session.winnerSeats ?? []).first]?.role == 'werewolf';
      return wolvesWon ? 'The wolves devoured the village!' : 'The village prevails!';
    }
    if (!_myTurn) {
      return view.isNight ? 'Night ${view.day} — the village sleeps…' : 'Day ${view.day} — the table deliberates…';
    }
    if (view.phase == 'night_kill') return 'Night ${view.day} — choose your prey';
    if (view.phase == 'night_seer') return 'Peer into one soul';
    return 'Day ${view.day} — cast your vote';
  }

  String _seatLabel(int seat) {
    if (seat >= widget.session.seats.length) return 'Seat ${seat + 1}';
    return seat == widget.mySeat ? 'You (Seat ${seat + 1})' : widget.session.seats[seat].displayName;
  }
}
